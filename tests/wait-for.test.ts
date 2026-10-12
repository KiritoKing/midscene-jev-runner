import { NodeExecutionError, createCaseRunner } from '@midscene/test';
import type { Page } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createJevNodes,
  jevWaitForInputSchema,
  waitForJevAssertion,
} from '../src';

const pageFor = (text: () => string): Page =>
  ({
    evaluate: vi.fn(async () => ({
      url: 'about:blank',
      title: 'Test',
      text: text(),
      marker: 'test',
      progressMarker: 'test',
      alerts: [],
      loading: false,
      actions: [],
      facts: [],
      layers: [],
      workflowSteps: [],
      validations: [],
      omittedActions: 0,
    })),
    goto: vi.fn(),
    route: vi.fn(),
    close: vi.fn(),
  }) as unknown as Page;

const reply = (truth: number, evidence = 0.95) =>
  new Response(
    JSON.stringify({
      answers: {
        condition_satisfied: { type: 'noul', noul: truth },
        evidence_sufficient: { type: 'noul', noul: evidence },
      },
      usage: { input_tokens: 10, output_tokens: 2, cost: 0.01 },
    }),
    { status: 200 },
  );

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('jevWaitFor', () => {
  it('registers string and structured YAML inputs and succeeds after a later observation', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'test-key');
    const page = pageFor(() => 'A status message changes asynchronously');
    const outcomes = [0.05, 0.95, 0.95];
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      reply(outcomes.shift() ?? 0),
    );
    vi.stubGlobal('fetch', fetch);
    const nodes = createJevNodes({ getPage: () => page });
    expect(
      nodes.find((node) => node.name === 'jevWaitFor')?.stringInputKey,
    ).toBe('prompt');
    expect(
      jevWaitForInputSchema.parse({ prompt: 'The status is ready' }).prompt,
    ).toBe('The status is ready');
    const runner = createCaseRunner({ nodes });
    const result = await runner.run({
      name: 'wait examples',
      steps: [
        {
          jevWaitFor: {
            prompt: 'The status is ready',
            options: {
              checkIntervalMs: 1,
              timeoutMs: 200,
              context: 'The request has been sent.',
            },
          },
        },
        { jevWaitFor: 'The status remains ready' },
      ],
    });
    expect(result.status).toBe('success');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      (page as unknown as { goto: ReturnType<typeof vi.fn> }).goto,
    ).not.toHaveBeenCalled();
    expect(
      (page as unknown as { route: ReturnType<typeof vi.fn> }).route,
    ).not.toHaveBeenCalled();
    expect(
      (page as unknown as { close: ReturnType<typeof vi.fn> }).close,
    ).not.toHaveBeenCalled();
  });

  it('rechecks an indeterminate state on a structurally different page and records aggregate usage', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'test-key');
    const page = pageFor(() => 'A dashboard counter is loading');
    const outcomes = [
      [0.5, 0.1],
      [0.95, 0.95],
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(async () => {
        const [truth, evidence] = outcomes.shift() ?? [0, 0];
        return reply(truth, evidence);
      }),
    );
    const result = await waitForJevAssertion(page, {
      prompt: 'The dashboard counter has appeared',
      timeoutMs: 200,
      checkIntervalMs: 1,
    });
    expect(result).toMatchObject({
      pass: true,
      attempts: 2,
      usage: { calls: 2, inputTokens: 20, outputTokens: 4, cost: 0.02 },
    });
  });

  it('does not turn a persistent false condition into a pass at timeout', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(async () => reply(0.05)),
    );
    const page = pageFor(() => 'An error banner remains visible');
    const node = createJevNodes({ getPage: () => page }).find(
      (item) => item.name === 'jevWaitFor',
    );
    if (!node) throw new Error('Missing jevWaitFor');
    let error: unknown;
    try {
      await node.execute({
        input: {
          prompt: 'The error banner has disappeared',
          options: { timeoutMs: 20, checkIntervalMs: 5 },
        },
        signal: new AbortController().signal,
      } as never);
    } catch (received) {
      error = received;
    }
    expect(error).toBeInstanceOf(NodeExecutionError);
    expect(error).toMatchObject({
      node: 'jevWaitFor',
      output: { data: { pass: false, lastAssertion: { verdict: 'fail' } } },
    });
  });
});
