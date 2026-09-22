import { createCaseRunner, defineNode, z } from '@midscene/test';
import { chromium } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJevNodes, runJev } from '../src';

const response = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

const completionResponse = (truth = 0.99, evidence = 0.99) =>
  response({
    answers: {
      condition_satisfied: { type: 'noul', noul: truth },
      evidence_sufficient: { type: 'noul', noul: evidence },
    },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('JEV node composition', () => {
  it('composes two jevAct nodes with caller-owned text input and a final jevAssert', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'test-key');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.setContent(`
        <main>
          <button type="button" onclick="document.querySelector('#settings').hidden = false">Open settings</button>
          <section id="settings" hidden>
            <button type="button" onclick="document.querySelector('#editor').hidden = false">Open profile editor</button>
          </section>
          <section id="editor" hidden>
            <label>Display name <input aria-label="Display name" /></label>
            <button type="button" onclick="document.querySelector('#status').textContent = 'Saved profile for ' + document.querySelector('input').value">Save profile</button>
          </section>
          <p id="status">No profile saved</p>
        </main>
      `);

      const selectedByGoal = new Map<string, number>();
      const actionLabels: string[] = [];
      const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          state?: {
            goal?: string;
            browser_evidence?: { page?: { visible_text?: string } };
          };
          questions?: Record<
            string,
            { criteria?: Record<string, { element?: string }> }
          >;
        };
        if (body.questions?.condition_satisfied) {
          expect(body.state?.browser_evidence?.page?.visible_text).toContain(
            'Saved profile for Ada Lovelace',
          );
          return completionResponse();
        }

        const goal = body.state?.goal;
        if (!goal) throw new Error('Decision request omitted its goal.');
        const plannedLabels =
          goal === 'Open the profile editor'
            ? ['Open settings', 'Open profile editor']
            : goal === 'Save the profile'
              ? ['Save profile']
              : undefined;
        if (!plannedLabels) throw new Error(`Unexpected action goal: ${goal}`);
        const selected = selectedByGoal.get(goal) ?? 0;
        if (selected >= plannedLabels.length)
          return response({
            answers: { operation: { type: 'choice', choice: 'DONE' } },
          });
        const expectedLabel = plannedLabels[selected];
        const candidates = body.questions?.click_target?.criteria ?? {};
        const target = Object.entries(candidates).find(
          ([, candidate]) => candidate.element === expectedLabel,
        )?.[0];
        if (!target)
          throw new Error(`Missing offered action: ${expectedLabel}`);
        selectedByGoal.set(goal, selected + 1);
        actionLabels.push(expectedLabel);
        return response({
          answers: {
            operation: { type: 'choice', choice: 'CLICK' },
            click_target: { type: 'choice', choice: target },
          },
        });
      });
      vi.stubGlobal('fetch', fetch);

      const callerInput = defineNode({
        name: 'callerInput',
        description: 'Caller-owned text entry for the current test page.',
        stringInputKey: 'value',
        inputSchema: z.object({ value: z.string() }),
        async execute(execution) {
          await page.getByLabel('Display name').fill(execution.input.value);
          return { summary: 'Caller entered the display name.' };
        },
      });
      const runner = createCaseRunner({
        nodes: [...createJevNodes({ getPage: () => page }), callerInput],
      });

      const result = await runner.run({
        name: 'profile save composition',
        steps: [
          { jevAct: { goal: 'Open the profile editor', maxSteps: 3 } },
          { callerInput: { value: 'Ada Lovelace' } },
          { jevAct: { goal: 'Save the profile', maxSteps: 3 } },
          { jevAssert: 'The saved profile for Ada Lovelace is visible' },
        ],
      });

      expect(result.status).toBe('success');
      expect(await page.getByLabel('Display name').inputValue()).toBe(
        'Ada Lovelace',
      );
      expect(await page.locator('#status').innerText()).toBe(
        'Saved profile for Ada Lovelace',
      );
      expect(actionLabels).toEqual([
        'Open settings',
        'Open profile editor',
        'Save profile',
      ]);
      expect(fetch).toHaveBeenCalledTimes(6);
    } finally {
      await browser.close();
    }
  });

  it('does not mutate text for a blocked text-only goal and marks an unverified DONE false', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'test-key');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.setContent(
        '<label>Display name <input aria-label="Display name" value="Original" /></label>',
      );
      const blockedFetch = vi.fn<typeof globalThis.fetch>(
        async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as {
            questions?: Record<string, unknown>;
          };
          expect(body.questions).not.toHaveProperty('type_text_target');
          expect(body.questions).not.toHaveProperty('clear_target');
          return response({
            answers: { operation: { type: 'choice', choice: 'BLOCKED' } },
          });
        },
      );

      await expect(
        runJev(page, {
          goal: 'Replace the display name with Ada Lovelace',
          fetch: blockedFetch,
        }),
      ).rejects.toThrow('JEV reported that the goal is blocked.');
      expect(await page.getByLabel('Display name').inputValue()).toBe(
        'Original',
      );

      const events: Array<{ type: string; verified?: boolean }> = [];
      const done = await runJev(page, {
        goal: 'The display name is already correct',
        fetch: async () =>
          response({
            answers: { operation: { type: 'choice', choice: 'DONE' } },
          }),
        observer: (event) => events.push(event),
      });
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'completion', verified: false }),
        ]),
      );
      expect(done.completionVerified).toBe(false);
      expect(await page.getByLabel('Display name').inputValue()).toBe(
        'Original',
      );
    } finally {
      await browser.close();
    }
  });
});
