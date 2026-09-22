import { NodeExecutionError, createCaseRunner } from '@midscene/test';
import { type Page, chromium } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createJevNodes,
  evaluateJevAssertion,
  jevAssertInputSchema,
} from '../src';

const response = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

const assertionResponse = (
  truthProbability: number,
  evidenceProbability = 0.95,
) =>
  response({
    answers: {
      condition_satisfied: { type: 'noul', noul: truthProbability },
      evidence_sufficient: { type: 'noul', noul: evidenceProbability },
    },
    usage: { input_tokens: 12, output_tokens: 4, cost: 0.000012 },
  });

const browserSnapshot = () => ({
  url: 'https://example.test/checkout?token=not-for-model',
  title: 'Checkout',
  text: 'Order confirmed',
  marker: 'confirmation',
  progressMarker: 'confirmation',
  alerts: ['Payment accepted'],
  loading: false,
  omittedActions: 0,
  workflowSteps: [{ index: 1, label: 'Pay', status: 'complete' }],
  validations: [
    {
      message: 'Email is required',
      field: 'Email',
      groupId: 'contact',
      required: true,
    },
  ],
  layers: [{ id: 'main', kind: 'page', label: 'Checkout', blocking: false }],
  facts: [
    {
      id: 'confirmation',
      kind: 'click',
      label: 'Order confirmed',
      role: 'status',
      region: 'main',
      groupId: 'checkout',
      layerPath: ['page'],
      visible: true,
      actionable: false,
      covered: false,
      disabled: false,
      semanticConfidence: 1,
    },
  ],
  // These are deliberately present in the browser observation.  Assertions
  // must project facts, not serialize executable action data or selectors.
  actions: [
    {
      id: 'submit',
      kind: 'click',
      label: 'Pay',
      selector: '#private-submit-selector',
      region: 'main',
    },
  ],
});

const pageFor = () => {
  const evaluate = vi.fn(async () => browserSnapshot());
  return {
    page: {
      evaluate,
      locator: vi.fn(),
      keyboard: { press: vi.fn() },
      mouse: { wheel: vi.fn() },
      goto: vi.fn(),
      close: vi.fn(),
    } as unknown as Page,
    evaluate,
  };
};

const setupJevEnvironment = () => {
  vi.stubEnv('MIDSCENE_JEV_API_KEY', 'test-key-not-for-requests');
  vi.stubEnv('MIDSCENE_JEV_BASE_URL', '');
  vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', '');
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('JEV assertions', () => {
  it('rejects an overlong assertion rather than silently dropping its final condition', async () => {
    const { page, evaluate } = pageFor();
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(
      evaluateJevAssertion(page, { prompt: 'x'.repeat(4001), fetch }),
    ).rejects.toThrow('must not exceed');
    expect(evaluate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('projects read-only assertion context into one two-noul Decisions request', async () => {
    setupJevEnvironment();
    const { page, evaluate } = pageFor();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      assertionResponse(0.95),
    );

    const result = await evaluateJevAssertion(page, {
      prompt: 'The order confirmation is visible',
      context: 'The purchase flow was submitted by the test.',
      fetch,
    });

    expect(result).toMatchObject({
      pass: true,
      verdict: 'pass',
      truthProbability: 0.95,
      evidenceProbability: 0.95,
      certainty: 0.95,
      usage: {
        calls: 1,
        inputTokens: 12,
        outputTokens: 4,
        cost: 0.000012,
      },
    });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({ method: 'POST' }),
    );

    const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(request.questions).toEqual(
      expect.objectContaining({
        condition_satisfied: expect.objectContaining({ type: 'noul' }),
        evidence_sufficient: expect.objectContaining({ type: 'noul' }),
      }),
    );
    expect(Object.keys(request.questions)).toEqual([
      'condition_satisfied',
      'evidence_sufficient',
    ]);
    expect(request.questions.condition_satisfied.instructions).toEqual(
      expect.any(String),
    );
    expect(request.questions.evidence_sufficient.instructions).toEqual(
      expect.any(String),
    );
    expect(request.state).toEqual(
      expect.objectContaining({
        browser_evidence: expect.objectContaining({
          page: expect.objectContaining({
            url: 'https://example.test/checkout',
            title: 'Checkout',
          }),
          elements: expect.any(Array),
          workflow_steps: expect.any(Array),
          validation_issues: expect.any(Array),
        }),
      }),
    );
    expect(request.state.browser_evidence).not.toHaveProperty('active_layers');
    expect(request.state.trusted_context).toBe(
      'The purchase flow was submitted by the test.',
    );
    expect(JSON.stringify(request)).not.toContain('token=not-for-model');
    expect(JSON.stringify(request)).not.toContain('#private-submit-selector');
    expect(request.state).not.toHaveProperty('candidates');
    expect(request.state).not.toHaveProperty('actions');
    expect(request.state).not.toHaveProperty('recent_actions');
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0.9, 0.95, 'pass', true],
    [0.1, 0.95, 'fail', false],
    [0.5, 0.95, 'indeterminate', false],
    [0.95, 0.79, 'indeterminate', false],
  ] as const)(
    'uses symmetric default thresholds for truth=%s and evidence=%s',
    async (truthProbability, evidenceProbability, verdict, pass) => {
      setupJevEnvironment();
      const { page } = pageFor();

      const result = await evaluateJevAssertion(page, {
        prompt: 'The confirmation is visible',
        fetch: vi.fn<typeof globalThis.fetch>(async () =>
          assertionResponse(truthProbability, evidenceProbability),
        ),
      });

      expect(result).toMatchObject({
        pass,
        verdict,
        truthProbability,
        evidenceProbability,
      });
    },
  );

  it('honors programmatic assertion thresholds', async () => {
    setupJevEnvironment();
    const { page } = pageFor();

    const result = await evaluateJevAssertion(page, {
      prompt: 'The confirmation is visible',
      threshold: 0.8,
      evidenceThreshold: 0.7,
      fetch: vi.fn<typeof globalThis.fetch>(async () =>
        assertionResponse(0.2, 0.7),
      ),
    });

    expect(result).toMatchObject({ pass: false, verdict: 'fail' });
  });

  it.each([
    {},
    {
      answers: {
        condition_satisfied: { type: 'choice', choice: 'yes' },
        evidence_sufficient: { type: 'noul', noul: 0.95 },
      },
    },
    {
      answers: {
        condition_satisfied: { type: 'noul', noul: 0.95 },
        evidence_sufficient: { type: 'noul', noul: 'certain' },
      },
    },
  ])('rejects malformed or non-noul assertion answers: %j', async (body) => {
    setupJevEnvironment();
    const { page } = pageFor();

    await expect(
      evaluateJevAssertion(page, {
        prompt: 'The confirmation is visible',
        fetch: vi.fn<typeof globalThis.fetch>(async () => response(body)),
      }),
    ).rejects.toThrow(/noul|assertion/i);
  });

  it('registers jevAssert with Midscene string input and preserves structured results on non-passes', async () => {
    setupJevEnvironment();
    const { page } = pageFor();
    const responses = [
      assertionResponse(0.95),
      assertionResponse(0.1),
      assertionResponse(0.5),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>(async () => {
        const next = responses.shift();
        if (!next) throw new Error('Unexpected assertion request.');
        return next;
      }),
    );
    const getPage = vi.fn(() => page);
    const nodes = createJevNodes({ getPage });
    const node = nodes.find((definition) => definition.name === 'jevAssert');
    if (!node) throw new Error('jevAssert was not registered.');

    expect(node.stringInputKey).toBe('prompt');
    expect(
      jevAssertInputSchema.parse({
        prompt: 'The confirmation is visible',
        message: 'Confirmation did not appear.',
        options: { context: 'The order was submitted.' },
      }),
    ).toEqual({
      prompt: 'The confirmation is visible',
      message: 'Confirmation did not appear.',
      options: { context: 'The order was submitted.' },
    });

    const execute = node.execute as unknown as (execution: {
      input: unknown;
      signal: AbortSignal;
    }) => Promise<unknown>;
    const run = (input: unknown) =>
      execute({
        input,
        signal: new AbortController().signal,
      });

    await expect(run('The confirmation is visible')).resolves.toMatchObject({
      data: { pass: true, verdict: 'pass' },
    });

    for (const expectedVerdict of ['fail', 'indeterminate'] as const) {
      let received: unknown;
      try {
        await run({
          prompt: 'The confirmation is visible',
          message: 'Confirmation did not appear.',
          options: { context: 'The order was submitted.' },
        });
      } catch (error) {
        received = error;
      }
      expect(received).toBeInstanceOf(NodeExecutionError);
      expect(received).toMatchObject({
        node: 'jevAssert',
        output: {
          data: {
            pass: false,
            verdict: expectedVerdict,
            truthProbability: expect.any(Number),
            evidenceProbability: expect.any(Number),
          },
        },
      });
    }

    expect(getPage).toHaveBeenCalledTimes(3);
    expect(
      (page as unknown as { goto: ReturnType<typeof vi.fn> }).goto,
    ).not.toHaveBeenCalled();
    expect(
      (page as unknown as { close: ReturnType<typeof vi.fn> }).close,
    ).not.toHaveBeenCalled();
    expect(
      (page as unknown as { locator: ReturnType<typeof vi.fn> }).locator,
    ).not.toHaveBeenCalled();
  });

  it('runs both short and structured jevAssert inputs through the Midscene case runner', async () => {
    setupJevEnvironment();
    const { page } = pageFor();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      assertionResponse(0.95),
    );
    vi.stubGlobal('fetch', fetch);
    const runner = createCaseRunner({
      nodes: createJevNodes({ getPage: () => page }),
    });

    const result = await runner.run({
      name: 'JEV assertions',
      steps: [
        { jevAssert: 'The confirmation is visible' },
        {
          jevAssert: {
            prompt: 'No validation error remains',
            options: { context: 'The order was submitted.' },
          },
        },
      ],
    });

    expect(result.status).toBe('success');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves visible text boundaries and omits empty evidence collections', async () => {
    setupJevEnvironment();
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        '<main><h1>Checkout complete</h1><p role="status">Order saved successfully</p></main>',
      );
      let request: Record<string, unknown> | undefined;
      const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
        request = JSON.parse(String(init?.body));
        return assertionResponse(0.95);
      });

      await evaluateJevAssertion(page, {
        prompt: 'Checkout is complete',
        fetch,
      });

      const state = request?.state as
        | {
            browser_evidence?: {
              page?: { visible_text?: string };
              elements?: unknown;
              active_layers?: unknown;
            };
          }
        | undefined;
      expect(state?.browser_evidence?.page?.visible_text).toBe(
        'Checkout complete Order saved successfully',
      );
      expect(state?.browser_evidence).not.toHaveProperty('elements');
      expect(state?.browser_evidence).not.toHaveProperty('active_layers');
    } finally {
      await browser.close();
    }
  });
});
