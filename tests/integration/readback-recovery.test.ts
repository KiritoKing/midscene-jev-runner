import type { Page } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateJevAssertion } from '../../src/assertion';
import { executeAction } from '../../src/browser/execute';
import { observe } from '../../src/browser/observe';
import type {
  BrowserFact,
  BrowserSnapshot,
  DecisionRequest,
} from '../../src/internal-types';
import { runJev } from '../../src/runner';

vi.mock('../../src/browser/observe', () => ({ observe: vi.fn() }));
vi.mock('../../src/browser/execute', () => ({ executeAction: vi.fn() }));
const snapshot: BrowserSnapshot = {
  url: 'about:blank',
  title: '',
  text: 'Continue',
  marker: 'one',
  progressMarker: 'one',
  alerts: [],
  loading: false,
  omittedActions: 0,
  omittedFacts: 0,
  workflowSteps: [],
  validationIssues: [],
  layers: [],
  facts: [],
  actions: [
    {
      id: '1',
      kind: 'click',
      label: 'Continue',
      role: 'button',
      guard: 'stable',
    },
  ],
};
const page = { isClosed: () => false } as unknown as Page;
const answer = (operation: string) =>
  new Response(
    JSON.stringify({
      answers: {
        operation: { type: 'choice', choice: operation },
        click_target: { type: 'choice', choice: '1' },
      },
    }),
  );
const fetch = vi.fn<typeof globalThis.fetch>(async () => answer('DONE'));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
const setup = () => {
  vi.stubEnv('MIDSCENE_JEV_API_KEY', 'local-test');
  vi.stubEnv('MIDSCENE_JEV_BASE_URL', '');
  vi.mocked(observe).mockResolvedValue(
    snapshot as Awaited<ReturnType<typeof observe>>,
  );
  fetch.mockImplementation(async () => answer('DONE'));
};

describe('bounded readback recovery', () => {
  for (const message of [
    'Execution context was destroyed, most likely because of a navigation.',
    'Frame was detached',
  ]) {
    it(`retries observation only after ${message}`, async () => {
      setup();
      vi.mocked(observe).mockRejectedValueOnce(new Error(message));
      expect((await runJev(page, { goal: 'Continue', fetch })).steps).toBe(1);
      expect(observe).toHaveBeenCalledTimes(2);
      expect(executeAction).not.toHaveBeenCalled();
    });
  }
  it('does not retry non-transient errors or a closed page', async () => {
    setup();
    vi.mocked(observe).mockRejectedValueOnce(new Error('Permission denied'));
    await expect(runJev(page, { goal: 'Continue', fetch })).rejects.toThrow(
      'Permission denied',
    );
    expect(observe).toHaveBeenCalledTimes(1);
    vi.mocked(observe).mockRejectedValueOnce(
      new Error('Execution context was destroyed'),
    );
    await expect(
      runJev({ isClosed: () => true } as unknown as Page, {
        goal: 'Continue',
        fetch,
      }),
    ).rejects.toThrow('Execution context');
    expect(observe).toHaveBeenCalledTimes(2);
  });
  it('caps transient retries and honors cancellation', async () => {
    setup();
    vi.mocked(observe).mockRejectedValue(new Error('Frame was detached'));
    await expect(runJev(page, { goal: 'Continue', fetch })).rejects.toThrow(
      'Frame was detached',
    );
    expect(observe).toHaveBeenCalledTimes(2);
    const controller = new AbortController();
    vi.mocked(observe).mockImplementationOnce(async () => {
      controller.abort(new Error('caller stopped'));
      throw new Error('Frame was detached');
    });
    await expect(
      runJev(page, { goal: 'Continue', fetch, signal: controller.signal }),
    ).rejects.toThrow('caller stopped');
    expect(observe).toHaveBeenCalledTimes(3);
  });
  for (const actionThrows of [true, false]) {
    it(`accepts independently verified completion without replay when ${actionThrows ? 'dispatch errors' : 'post-action observation errors'}`, async () => {
      setup();
      fetch.mockImplementation(async () => answer('CLICK'));
      if (actionThrows)
        vi.mocked(executeAction).mockRejectedValue(
          new Error('dispatched but response lost'),
        );
      else {
        vi.mocked(executeAction).mockResolvedValue(true);
        vi.mocked(observe)
          .mockResolvedValueOnce(
            snapshot as Awaited<ReturnType<typeof observe>>,
          )
          .mockRejectedValue(new Error('readback unavailable'));
      }
      const result = await runJev(page, {
        goal: 'Continue',
        fetch,
        verifyCompletion: async () => true,
      });
      expect(result.completionVerified).toBe(true);
      expect(executeAction).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  }
  it('fails uncertain execution when independent verification is false', async () => {
    setup();
    fetch.mockImplementation(async () => answer('CLICK'));
    vi.mocked(executeAction).mockRejectedValue(new Error('response lost'));
    await expect(
      runJev(page, {
        goal: 'Continue',
        fetch,
        verifyCompletion: async () => false,
      }),
    ).rejects.toThrow('no action was retried');
    expect(executeAction).toHaveBeenCalledTimes(1);
  });
});

describe('state-scoped terminal judgment recovery', () => {
  for (const operation of ['DONE', 'BLOCKED']) {
    it(`replans after rejected ${operation} without replaying the same terminal judgment`, async () => {
      setup();
      const requests: Array<DecisionRequest['body']> = [];
      fetch.mockImplementation(async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return answer(requests.length === 1 ? operation : 'CLICK');
      });
      vi.mocked(executeAction).mockResolvedValue(true);
      const result = await runJev(page, {
        goal: 'Continue',
        fetch,
        verifyCompletion: async () =>
          vi.mocked(executeAction).mock.calls.length > 0,
      });
      expect(requests).toHaveLength(2);
      expect(requests[1].questions.operation.criteria).not.toHaveProperty(
        operation,
      );
      expect(requests[1].state.rejected_judgments_in_current_state).toEqual([
        operation,
      ]);
      expect(requests[1].questions.operation.criteria).toHaveProperty('CLICK');
      expect(executeAction).toHaveBeenCalledTimes(1);
      expect(result.completionVerified).toBe(true);
    });

    it(`checks delayed independent completion before replanning rejected ${operation}`, async () => {
      setup();
      fetch.mockImplementation(async () => answer(operation));
      const verifyCompletion = vi
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);
      const result = await runJev(page, {
        goal: 'Continue',
        fetch,
        verifyCompletion,
      });
      expect(result.completionVerified).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(executeAction).not.toHaveBeenCalled();
    });
  }
});

describe('assertion evidence identity', () => {
  for (const framed of [false, true]) {
    it(`preserves identical labels across ${framed ? 'frames' : 'groups/layers'} without dropping hidden counterevidence`, async () => {
      setup();
      const facts: BrowserFact[] = [true, false].map((visible, index) => ({
        id: `fact-${index}`,
        kind: 'text',
        label: 'Ready',
        role: 'status',
        groupId: `group-${index}`,
        layerPath: ['page', `layer-${index}`],
        ...(framed ? { framePath: [index] } : {}),
        visible,
        actionable: false,
        covered: !visible,
        disabled: !visible,
        semanticConfidence: 1,
        nameSource: 'content',
        region: 'content',
        score: 1,
      }));
      vi.mocked(observe).mockResolvedValue({ ...snapshot, facts } as Awaited<
        ReturnType<typeof observe>
      >);
      let evidence: Array<Record<string, unknown>> = [];
      const request = async (_url: unknown, init?: RequestInit) => {
        evidence = JSON.parse(String(init?.body)).state.browser_evidence
          .elements;
        return new Response(
          JSON.stringify({
            answers: {
              condition_satisfied: { type: 'noul', noul: 0.99 },
              evidence_sufficient: { type: 'noul', noul: 0.1 },
            },
          }),
        );
      };
      const result = await evaluateJevAssertion(page, {
        prompt: 'Both groups are Ready',
        fetch: request as typeof globalThis.fetch,
      });
      expect(evidence).toHaveLength(2);
      expect(evidence.map((f) => f.id)).toEqual(['fact-0', 'fact-1']);
      expect(evidence.map((f) => f.group_id)).toEqual(['group-0', 'group-1']);
      expect(evidence[1]).toMatchObject({
        layer_path: ['page', 'layer-1'],
        visible: false,
        covered: true,
        disabled: true,
      });
      if (framed) expect(evidence[1]?.frame_path).toEqual([1]);
      expect(result.verdict).toBe('indeterminate');
    });
  }
});
