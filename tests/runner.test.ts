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
  vi.stubEnv('MIDSCENE_JEV_API_KEY', 'secret-key-that-must-not-leak');
  vi.stubEnv('MIDSCENE_JEV_BASE_URL', 'https://api.typesafe.ai/v1/');
  vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', 'jev-test');
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('JEV runner', () => {
  it('uses the official protocol endpoint, verifies DONE, and keeps sensitive URL parameters out of requests', async () => {
    setupJevEnvironment();
    const { page } = pageFor([browserSnapshot()]);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response({
        answers: { operation: { type: 'choice', choice: 'DONE' } },
        usage: { input_tokens: 12, output_tokens: 4 },
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
      usage: { calls: 1, inputTokens: 12, outputTokens: 4 },
    });
    expect(verifier).toHaveBeenCalledWith(
      expect.objectContaining({
        page,
        goal: 'Finish the form',
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
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
        usage: { input_tokens: 3, output_tokens: 2 },
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
      result: { usage: { calls: 0, inputTokens: 0, outputTokens: 0 } },
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
        if (url.endsWith('/systemone')) {
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
