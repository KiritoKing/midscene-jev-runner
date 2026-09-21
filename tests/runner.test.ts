import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NodeRegistry,
  collectWorkflowDocument,
  createCaseRunner,
  runWorkflowDocument,
} from '@midscene/test';
import { chromium } from 'playwright';
import type { Page } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JevRunError, createJevNodes, jevActInputSchema, runJev } from '../src';

const response = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

const browserSnapshot = (marker = 'first') => ({
  url: 'https://example.test/path?token=not-for-logs',
  title: 'Example',
  text: 'Complete the form',
  marker,
  alerts: [],
  workflowSteps: [],
  actions: [
    {
      id: '1',
      node: '1',
      guard: 'stable',
      kind: 'click',
      label: 'Continue',
      role: 'button',
    },
    { id: 'wait', kind: 'wait', label: 'Wait' },
  ],
});

const pageFor = (
  snapshots: ReturnType<typeof browserSnapshot>[],
  fresh = true,
) => {
  const locator = {
    first: () => locator,
    click: vi.fn(async () => undefined),
    fill: vi.fn(async () => undefined),
    selectOption: vi.fn(async () => undefined),
  };
  const evaluate = vi.fn(async (fn: { name?: string }) => {
    if (fn.name === 'browserSnapshot')
      return snapshots.shift() ?? browserSnapshot('last');
    return fresh;
  });
  return {
    page: {
      evaluate,
      locator: vi.fn(() => locator),
      mouse: { wheel: vi.fn(async () => undefined) },
    } as unknown as Page,
    evaluate,
    locator,
  };
};

const setupJevEnvironment = () => {
  vi.stubEnv('OPENROUTER_API_KEY', 'secret-key-that-must-not-leak');
  vi.stubEnv('MIDSCENE_JEV_API_KEY', '');
  vi.stubEnv('MIDSCENE_JEV_BASE_URL', '');
  vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', '');
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('JEV runner', () => {
  it('uses OpenRouter Decisions, verifies DONE, and keeps sensitive URL parameters out of requests', async () => {
    setupJevEnvironment();
    const { page } = pageFor([browserSnapshot()]);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response({
        answers: { operation: { type: 'choice', choice: 'DONE' } },
        usage: { input_tokens: 12, output_tokens: 4, cost: 0.000012 },
      }),
    );
    const verifier = vi.fn(async () => true);

    const result = await runJev(page, {
      goal: 'Finish the form',
      verifyCompletion: verifier,
      fetch,
    });

    expect(result).toMatchObject({
      steps: 1,
      completionVerified: true,
      usage: {
        calls: 1,
        inputTokens: 12,
        outputTokens: 4,
        cost: 0.000012,
      },
    });
    expect(verifier).toHaveBeenCalledWith(
      expect.objectContaining({
        page,
        goal: 'Finish the form',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/alpha/decisions',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(request.model).toBe('~typesafe/jev-latest');
    expect(request.state.goal).toBe('Finish the form');
    expect(request.state.page.url).toBe('https://example.test/path');
    expect(JSON.stringify(request)).not.toContain('token=not-for-logs');
  });

  it('rejects malformed choices, reports consumed usage, and never exposes the API key to observers', async () => {
    setupJevEnvironment();
    const { page } = pageFor([browserSnapshot()]);
    const events: unknown[] = [];
    const fetch = vi.fn(async () =>
      response({
        answers: { operation: { type: 'choice', choice: 'NOT_OFFERED' } },
        usage: { input_tokens: 3, output_tokens: 2, cost: 0.000003 },
      }),
    );

    let received: unknown;
    try {
      await runJev(page, {
        goal: 'Finish',
        fetch,
        observer: (event) => events.push(event),
      });
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(JevRunError);
    expect((received as JevRunError).result.usage).toEqual({
      calls: 1,
      inputTokens: 3,
      outputTokens: 2,
      cost: 0.000003,
    });
    expect(JSON.stringify(events)).not.toContain(
      'secret-key-that-must-not-leak',
    );
  });

  it('does not execute a stale target and replans from a fresh observation', async () => {
    setupJevEnvironment();
    const { page, locator } = pageFor(
      [browserSnapshot(), browserSnapshot('fresh')],
      false,
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          answers: {
            operation: { type: 'choice', choice: 'CLICK' },
            click_target: { type: 'choice', choice: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          answers: { operation: { type: 'choice', choice: 'DONE' } },
        }),
      );

    const result = await runJev(page, { goal: 'Continue', fetch });

    expect(result.staleDecisions).toBe(1);
    expect(result.steps).toBe(2);
    expect(locator.click).not.toHaveBeenCalled();
  });

  it('includes prior action outcomes when replanning the next step', async () => {
    setupJevEnvironment();
    const { page } = pageFor([
      browserSnapshot('before'),
      browserSnapshot('after'),
    ]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          answers: {
            operation: { type: 'choice', choice: 'CLICK' },
            click_target: { type: 'choice', choice: '1' },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          answers: { operation: { type: 'choice', choice: 'DONE' } },
        }),
      );

    const result = await runJev(page, { goal: 'Continue', fetch });

    expect(result.steps).toBe(2);
    const secondRequest = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
    expect(secondRequest.state.recent_actions).toEqual([
      {
        operation: 'CLICK',
        target: '1',
        label: 'Continue',
        outcome: 'progressed',
      },
    ]);
  });

  it('withholds global navigation search fields while staged workflow controls are visible', async () => {
    setupJevEnvironment();
    const snapshot = {
      ...browserSnapshot(),
      workflowSteps: [],
      actions: [
        {
          id: 'search',
          node: '10',
          guard: 'search',
          kind: 'fill' as const,
          label: 'Global Search',
          role: 'input',
          currentValue: '',
          scope: 'global-navigation' as const,
        },
        {
          id: 'next',
          node: '11',
          guard: 'next',
          kind: 'click' as const,
          label: 'Next',
          role: 'button',
        },
      ],
    };
    const { page } = pageFor([snapshot]);
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      expect(request.state.page.workflow_active).toBe(true);
      expect(request.questions.type_text_target).toBeUndefined();
      return response({
        answers: { operation: { type: 'choice', choice: 'DONE' } },
      });
    });

    await runJev(page, { goal: 'Finish the current form', fetch });
  });

  it('does not offer a just-filled field again while its value remains accepted', async () => {
    setupJevEnvironment();
    vi.stubEnv('MIDSCENE_MODEL_API_KEY', 'local-text-key');
    vi.stubEnv('MIDSCENE_MODEL_BASE_URL', 'https://local-model.test/v1');
    vi.stubEnv('MIDSCENE_MODEL_NAME', 'local-text-model');
    const field = (marker: string, currentValue: string) => ({
      ...browserSnapshot(marker),
      actions: [
        {
          id: 'field',
          node: '12',
          guard: 'field',
          kind: 'fill' as const,
          label: 'Activity name',
          role: 'input',
          currentValue,
        },
      ],
    });
    const { page } = pageFor([field('before', ''), field('after', 'clone')]);
    let decisions = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      if (String(input).endsWith('/chat/completions')) {
        const request = JSON.parse(String(init?.body));
        expect(request.max_tokens).toBe(1_024);
        return response({
          choices: [
            {
              message: {
                content:
                  '<think>select value</think>\n```json\n{"text":"clone"}\n```',
              },
            },
          ],
        });
      }
      decisions += 1;
      const request = JSON.parse(String(init?.body));
      if (decisions === 1) {
        expect(request.questions.type_text_target.instructions.rules).toContain(
          'Do not fill optional empty fields',
        );
        return response({
          answers: {
            operation: { type: 'choice', choice: 'TYPE_TEXT' },
            type_text_target: { type: 'choice', choice: 'field' },
          },
        });
      }
      expect(request.questions.type_text_target).toBeUndefined();
      return response({
        answers: { operation: { type: 'choice', choice: 'DONE' } },
      });
    });

    const result = await runJev(page, { goal: 'Name it clone', fetch });

    expect(result.steps).toBe(2);
  });

  it('feeds a rejected DONE back into the loop instead of treating model completion as business success', async () => {
    setupJevEnvironment();
    const { page } = pageFor([
      browserSnapshot(),
      browserSnapshot('after-rejection'),
    ]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          answers: { operation: { type: 'choice', choice: 'DONE' } },
        }),
      )
      .mockResolvedValueOnce(
        response({
          answers: { operation: { type: 'choice', choice: 'DONE' } },
        }),
      );
    const verifier = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await runJev(page, {
      goal: 'Finish',
      fetch,
      verifyCompletion: verifier,
    });

    expect(result).toMatchObject({
      steps: 2,
      rejectedCompletions: 1,
      completionVerified: true,
    });
    expect(verifier).toHaveBeenCalledTimes(3);
  });

  it('stops after an action as soon as the independent verifier confirms completion', async () => {
    setupJevEnvironment();
    const { page, locator } = pageFor([
      browserSnapshot('before'),
      browserSnapshot('after'),
    ]);
    const fetch = vi.fn(async () =>
      response({
        answers: {
          operation: { type: 'choice', choice: 'CLICK' },
          click_target: { type: 'choice', choice: '1' },
        },
      }),
    );
    const verifier = vi.fn(async () => true);

    const result = await runJev(page, {
      goal: 'Click Continue',
      fetch,
      verifyCompletion: verifier,
    });

    expect(result).toMatchObject({
      steps: 1,
      completionVerified: true,
      usage: { calls: 1 },
    });
    expect(locator.click).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(verifier).toHaveBeenCalledTimes(1);
  });

  it('checks completion before a second decision when the first action settles asynchronously', async () => {
    setupJevEnvironment();
    const { page, locator } = pageFor([
      browserSnapshot('before'),
      browserSnapshot('after'),
    ]);
    const fetch = vi.fn(async () =>
      response({
        answers: {
          operation: { type: 'choice', choice: 'CLICK' },
          click_target: { type: 'choice', choice: '1' },
        },
      }),
    );
    // The post-action check has not observed the settled page yet; the next
    // loop's pre-decision check does, so no second decision/action is allowed.
    const verifier = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await runJev(page, {
      goal: 'Click Continue',
      fetch,
      verifyCompletion: verifier,
    });

    expect(result).toMatchObject({
      steps: 1,
      completionVerified: true,
      usage: { calls: 1 },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(locator.click).toHaveBeenCalledTimes(1);
    expect(verifier).toHaveBeenCalledTimes(2);
  });

  it('honors an already-aborted signal before issuing a model request', async () => {
    setupJevEnvironment();
    const { page } = pageFor([browserSnapshot()]);
    const fetch = vi.fn(async () => response({}));
    const controller = new AbortController();
    controller.abort(new Error('caller stopped'));

    await expect(
      runJev(page, { goal: 'Finish', fetch, signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'JevRunError',
      result: {
        usage: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('enforces the task time budget before making a model request', async () => {
    setupJevEnvironment();
    const delayedPage = {
      evaluate: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return browserSnapshot();
      }),
      locator: vi.fn(),
      mouse: { wheel: vi.fn() },
    } as unknown as Page;
    const fetch = vi.fn(async () => response({}));

    await expect(
      runJev(delayedPage, { goal: 'Finish', fetch, maxTaskMs: 1 }),
    ).rejects.toThrow('JEV task time budget was exhausted.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('runs a parsed YAML jevAct step in Chromium with local model responses and leaves the Page usable', async () => {
    setupJevEnvironment();
    vi.stubEnv('MIDSCENE_MODEL_API_KEY', 'local-text-key');
    vi.stubEnv('MIDSCENE_MODEL_BASE_URL', 'https://local-model.test/v1');
    vi.stubEnv('MIDSCENE_MODEL_NAME', 'local-text-model');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'midscene-jev-test-'),
    );
    try {
      await page.setContent(`
        <label>Activity name <input aria-label="Activity name" /></label>
        <button type="button" onclick="document.querySelector('#status').textContent = 'Created'">Create</button>
        <p id="status">Draft</p>
      `);
      let systemCalls = 0;
      const localFetch: typeof globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.endsWith('/decisions')) {
          systemCalls += 1;
          if (systemCalls === 1)
            return response({
              answers: {
                operation: { type: 'choice', choice: 'TYPE_TEXT' },
                type_text_target: { type: 'choice', choice: '1' },
              },
              usage: { input_tokens: 1, output_tokens: 1 },
            });
          if (systemCalls === 2)
            return response({
              answers: {
                operation: { type: 'choice', choice: 'CLICK' },
                click_target: { type: 'choice', choice: '2' },
              },
            });
          return response({
            answers: { operation: { type: 'choice', choice: 'DONE' } },
          });
        }
        expect(url).toBe('https://local-model.test/v1/chat/completions');
        return response({
          choices: [
            { message: { content: JSON.stringify({ text: 'clone-smoke' }) } },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 1 },
        });
      };
      vi.stubGlobal('fetch', localFetch);
      const registry = new NodeRegistry(
        createJevNodes({
          getPage: () => page,
          verifyCompletion: async ({ page: currentPage }) =>
            (await currentPage.locator('#status').innerText()) === 'Created',
        }),
      );
      const workflowPath = join(temporaryDirectory, 'jev.yaml');
      await writeFile(
        workflowPath,
        'cases:\n  - name: local Chromium JEV\n    steps:\n      - jevAct:\n          goal: Create a clone named clone-smoke\n          maxSteps: 5\n          maxTaskMs: 10000\n',
      );
      const document = collectWorkflowDocument(
        {
          projectId: 'jev-browser',
          sourcePath: 'flows/jev.yaml',
          absolutePath: workflowPath,
        },
        { resolveNode: registry.get.bind(registry) },
      );

      const execution = await runWorkflowDocument(document, {
        resolveNode: registry.require.bind(registry),
      });

      expect(execution.cases[0]?.run?.status).toBe('success');
      expect(await page.locator('input').inputValue()).toBe('clone-smoke');
      expect(await page.locator('#status').innerText()).toBe('Created');
      expect(await page.title()).toBe('');
    } finally {
      await browser.close();
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it('exposes a role-less component-library action instead of forcing a nearby semantic action', async () => {
    setupJevEnvironment();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <div class="next-arco-steps-item next-arco-steps-item-process">1 Select source</div>
        <div class="demo-form-item">
          <span class="demo-form-label">Activity unique name</span>
          <div class="demo-form-item-control-input"><input placeholder="helper placeholder" /></div>
        </div>
        <span role="button" aria-label="复制" style="display: inline-block; width: 16px; height: 16px" onclick="document.querySelector('#status').textContent = 'Copied'" class="next-arco-typography-operation-copy"></span>
        <span id="clone" style="cursor: pointer" onclick="document.querySelector('#status').textContent = 'Cloned'" class="next-arco-link operation-button-example">克隆</span>
        <span id="plain">Not actionable</span>
        <p id="status">Draft</p>
      `);
      const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
        const request = JSON.parse(String(init?.body));
        expect(request.state.page.workflow_steps).toEqual([
          expect.objectContaining({
            index: 1,
            label: '1 Select source',
            status: 'process',
          }),
        ]);
        expect(
          Object.values(
            request.questions.type_text_target.criteria as Record<
              string,
              { element: string }
            >,
          ),
        ).toContainEqual(
          expect.objectContaining({ element: 'Activity unique name' }),
        );
        const candidates = request.questions.click_target.criteria as Record<
          string,
          { element: string; role: string }
        >;
        const clone = Object.entries(candidates).find(
          ([, candidate]) => candidate.element === '克隆',
        );
        expect(clone?.[1]).toEqual(
          expect.objectContaining({ element: '克隆', role: 'button' }),
        );
        expect(
          Object.values(candidates).some(
            (candidate) => candidate.element === '复制',
          ),
        ).toBe(true);
        expect(
          Object.values(candidates).some(
            (candidate) => candidate.element === 'Not actionable',
          ),
        ).toBe(false);
        return response({
          answers: {
            operation: { type: 'choice', choice: 'CLICK' },
            click_target: { type: 'choice', choice: clone?.[0] },
          },
        });
      });

      const result = await runJev(page, {
        goal: '克隆活动',
        fetch,
        verifyCompletion: async ({ page: currentPage }) =>
          (await currentPage.locator('#status').innerText()) === 'Cloned',
      });

      expect(result).toMatchObject({ steps: 1, completionVerified: true });
      expect(await page.locator('#status').innerText()).toBe('Cloned');
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      await browser.close();
    }
  });

  it('registers strict jevAct and delegates to the caller-owned Page', async () => {
    setupJevEnvironment();
    const { page } = pageFor([browserSnapshot()]);
    const fetch = vi.fn(async () =>
      response({ answers: { operation: { type: 'choice', choice: 'DONE' } } }),
    );
    vi.stubGlobal('fetch', fetch);
    const getPage = vi.fn(() => page);
    const runner = createCaseRunner({ nodes: createJevNodes({ getPage }) });

    const result = await runner.run({
      name: 'JEV node',
      steps: [
        {
          jevAct: { goal: 'Finish', maxSteps: 2, maxTaskMs: 1_000 },
        },
      ],
    });

    expect(result.status).toBe('success');
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(
      runner.registry
        .require('jevAct')
        .inputSchema?.safeParse({ goal: 'ok', extra: true }).success,
    ).toBe(false);
    expect(jevActInputSchema.parse({ goal: 'ok' })).toEqual({
      goal: 'ok',
      maxSteps: 60,
      maxTaskMs: 180_000,
    });
  });
});
