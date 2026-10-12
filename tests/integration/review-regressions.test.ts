import { type Browser, type Page, chromium } from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { observe } from '../../src/browser/observe';
import { createDecisionRequest } from '../../src/decision';
import type {
  DecisionRequest,
  JevRecentAction,
} from '../../src/internal-types';
import { runJev } from '../../src/runner';
import { actionIdentity } from '../../src/utils';

const answer = (operation: string, target?: string) =>
  new Response(
    JSON.stringify({
      answers: {
        operation: { type: 'choice', choice: operation },
        ...(target
          ? {
              [`${operation.toLowerCase()}_target`]: {
                type: 'choice',
                choice: target,
              },
            }
          : {}),
      },
    }),
  );
const requestBody = (init?: RequestInit): DecisionRequest['body'] =>
  JSON.parse(String(init?.body));
const targetFor = (
  body: DecisionRequest['body'],
  operation: string,
  label?: string,
): string => {
  const entries = Object.entries(
    body.questions[`${operation.toLowerCase()}_target`]?.criteria || {},
  );
  const match = entries.find(
    ([, value]) => !label || (value as { element: string }).element === label,
  );
  if (!match) throw new Error(`Missing ${operation} ${label || ''} target`);
  return match[0];
};

describe('reviewed progress, settling and target identity boundaries', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  afterAll(async () => {
    await browser.close();
  });
  afterEach(async () => {
    await page?.close();
    vi.unstubAllEnvs();
  });
  const setup = async (html: string) => {
    page = await browser.newPage();
    await page.setContent(html);
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'local-review-test');
    vi.stubEnv('MIDSCENE_JEV_BASE_URL', 'https://local.invalid');
  };

  for (const control of ['button', 'tab'] as const) {
    it(`settles an unmarked asynchronous ${control} without replaying dispatch`, async () => {
      await setup(
        `<main><div role="${control === 'tab' ? 'tablist' : 'toolbar'}"><button ${control === 'tab' ? 'role="tab"' : ''}>Open report</button></div><p id="result">Idle</p></main>`,
      );
      await page.locator('button').evaluate((button) => {
        button.addEventListener('click', async () => {
          button.setAttribute(
            'data-dispatches',
            String(Number(button.getAttribute('data-dispatches') || 0) + 1),
          );
          // An unresolved response deliberately outlives the fixed dispatch settle.
          await new Promise<void>((resolve) =>
            document.addEventListener('response-ready', () => resolve(), {
              once: true,
            }),
          );
          const result = document.querySelector('#result');
          if (result) result.textContent = 'Report ready';
        });
      });
      const requests: DecisionRequest['body'][] = [];
      const fetch: typeof globalThis.fetch = async (_url, init) => {
        const body = requestBody(init);
        requests.push(body);
        if (requests.length === 1)
          return answer('CLICK', targetFor(body, 'CLICK', 'Open report'));
        expect((body.state.page as { loading: boolean }).loading).toBe(false);
        const wait = targetFor(body, 'WAIT');
        await page.evaluate(() =>
          document.dispatchEvent(new Event('response-ready')),
        );
        return answer('WAIT', wait);
      };
      const result = await runJev(page, {
        goal: 'Open report and wait until it is ready',
        fetch,
        maxSteps: 4,
        verifyCompletion: async () =>
          (await page.locator('#result').textContent()) === 'Report ready',
      });
      expect(result.completionVerified).toBe(true);
      expect(requests).toHaveLength(2);
      expect(await page.locator('button').getAttribute('data-dispatches')).toBe(
        '1',
      );
      expect(await page.locator('#result').textContent()).toBe('Report ready');
    });
  }

  it('does not offer idle waiting, and caps unchanged settling without inventing completion', async () => {
    await setup(
      '<button onclick="this.dataset.calls=String(Number(this.dataset.calls||0)+1)">Submit</button>',
    );
    const initial = await observe(page, 'Submit');
    expect(
      createDecisionRequest(initial, 'Submit').targets.WAIT,
    ).toBeUndefined();
    let calls = 0;
    let waits = 0;
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      const body = requestBody(init);
      if (++calls === 1)
        return answer('CLICK', targetFor(body, 'CLICK', 'Submit'));
      if (body.questions.wait_target) {
        waits += 1;
        return answer('WAIT', targetFor(body, 'WAIT'));
      }
      return answer(
        body.questions.operation.criteria &&
          Object.hasOwn(body.questions.operation.criteria, 'BLOCKED')
          ? 'BLOCKED'
          : 'DONE',
      );
    };
    await expect(
      runJev(page, {
        goal: 'Submit',
        fetch,
        maxSteps: 8,
        verifyCompletion: async () => false,
      }),
    ).rejects.toThrow('recovery budget');
    expect(waits).toBe(2);
    expect(await page.locator('button').getAttribute('data-calls')).toBe('1');
    await page.locator('button').evaluate((button) => {
      button.textContent = 'Changed';
    });
    expect(
      createDecisionRequest(await observe(page), 'Submit').targets.WAIT,
    ).toBeUndefined();
  });

  it('offers settling only for an unchanged successful dispatch in the current epoch', async () => {
    await setup('<button>Submit</button>');
    const snapshot = await observe(page);
    const action = snapshot.actions.find(
      (candidate) => candidate.kind === 'click',
    );
    if (!action) throw new Error('Missing dispatch control');
    const history: JevRecentAction = {
      operation: 'CLICK',
      target: action.id,
      signature: action.signature,
      targetIdentity: actionIdentity(action),
      outcome: 'no-progress',
      fromProgressMarker: snapshot.progressMarker,
      toProgressMarker: snapshot.progressMarker,
      recoveryEpoch: 2,
    };
    expect(
      createDecisionRequest(snapshot, 'Submit', [history], 2).targets.WAIT,
    ).toBeDefined();
    for (const override of [
      { outcome: 'stale' as const },
      { outcome: 'failed' as const },
      { error: 'dispatch uncertain' },
      { fromProgressMarker: 'older-state' },
      { toProgressMarker: 'different-state' },
      { recoveryEpoch: 1 },
    ]) {
      expect(
        createDecisionRequest(
          snapshot,
          'Submit',
          [{ ...history, ...override }],
          2,
        ).targets.WAIT,
      ).toBeUndefined();
    }
  });

  it('isolates failed and completed edges by node, frame and document identity', async () => {
    await setup('<button>Open</button><button>Open</button>');
    const snapshot = await observe(page);
    const actions = snapshot.actions.filter(
      (candidate) => candidate.kind === 'click',
    );
    const first = actions[0];
    const second = actions[1];
    if (!first || !second) throw new Error('Missing duplicate controls');
    expect(first.signature).toBe(second.signature);
    const history: JevRecentAction = {
      operation: 'CLICK',
      target: first.id,
      signature: first.signature,
      targetIdentity: actionIdentity(first),
      outcome: 'no-progress',
      fromProgressMarker: snapshot.progressMarker,
      toProgressMarker: snapshot.progressMarker,
      recoveryEpoch: 0,
    };
    for (const attempts of [
      [history, history],
      [{ ...history, outcome: 'progressed' as const }],
    ]) {
      const targets = createDecisionRequest(snapshot, 'Open', attempts).targets
        .CLICK;
      expect(targets).not.toHaveProperty(first.id);
      expect(targets).toHaveProperty(second.id);
      for (const changed of [
        { ...first, frameDocumentId: `${first.frameDocumentId}-new` },
        { ...first, framePath: [...(first.framePath || []), 999] },
      ]) {
        expect(
          createDecisionRequest(
            { ...snapshot, actions: [changed] },
            'Open',
            attempts,
          ).targets.CLICK,
        ).toHaveProperty(first.id);
      }
    }
  });

  for (const layout of ['heading', 'output'] as const) {
    it(`recognizes repeated numeric-only ${layout} progress outside action scope`, async () => {
      await setup(
        `<main>${layout === 'heading' ? '<h1 id="value">Page 1</h1>' : '<output id="value">1</output>'}<nav><button>Increment</button></nav></main>`,
      );
      await page.locator('button').evaluate((button) => {
        button.addEventListener('click', () => {
          const value = document.querySelector('#value');
          if (value)
            value.textContent = value.textContent?.startsWith('Page')
              ? `Page ${Number(value.textContent.slice(5)) + 1}`
              : String(Number(value.textContent) + 1);
        });
      });
      const initial = await observe(page, 'Reach 5');
      const fetch: typeof globalThis.fetch = async (_url, init) =>
        answer('CLICK', targetFor(requestBody(init), 'CLICK', 'Increment'));
      const progressed: boolean[] = [];
      const result = await runJev(page, {
        goal: 'Reach 5',
        fetch,
        maxSteps: 6,
        observer: (event) => {
          if (event.type === 'action') progressed.push(event.progressed);
        },
        verifyCompletion: async () =>
          /(?:Page )?5/u.test(
            (await page.locator('#value').textContent()) || '',
          ),
      });
      const final = await observe(page, 'Reach 5');
      expect(initial.actions.map((action) => action.localContext)).toEqual(
        final.actions.map((action) => action.localContext),
      );
      expect(final.progressMarker).not.toBe(initial.progressMarker);
      expect(progressed).toEqual([true, true, true, true]);
      expect(result.completionVerified).toBe(true);
    });
  }

  it('ignores hidden numeric churn and still identifies a visible numeric round trip', async () => {
    await setup(
      '<h1 id="page">Page 1</h1><p hidden id="hidden">10</p><nav><button>Next</button></nav>',
    );
    const first = await observe(page);
    await page.locator('#hidden').evaluate((element) => {
      element.textContent = '11';
    });
    expect((await observe(page)).progressMarker).toBe(first.progressMarker);
    await page.locator('#page').evaluate((element) => {
      element.textContent = 'Page 2';
    });
    expect((await observe(page)).progressMarker).not.toBe(first.progressMarker);
    await page.locator('#page').evaluate((element) => {
      element.textContent = 'Page 1';
    });
    expect((await observe(page)).progressMarker).toBe(first.progressMarker);
  });

  for (const layout of ['cards', 'table'] as const) {
    it(`suppresses only the tried cycle edge among identically named ${layout}`, async () => {
      await setup(
        layout === 'cards'
          ? '<article class="card"><h2>Entry</h2><button id="first">Open</button></article><article class="card"><h2>Entry</h2><button id="second">Open</button></article>'
          : '<table><tr><td>Entry</td><td><button id="first">Open</button></td></tr><tr><td>Entry</td><td><button id="second">Open</button></td></tr></table>',
      );
      await page.locator('#first').evaluate((button) =>
        button.addEventListener('click', () => {
          const details = document.createElement('aside');
          details.id = 'details';
          details.innerHTML = '<button>Back</button>';
          details
            .querySelector('button')
            ?.addEventListener('click', () => details.remove());
          document.body.append(details);
        }),
      );
      await page.locator('#second').evaluate((button) =>
        button.addEventListener('click', () => {
          const result = document.createElement('p');
          result.id = 'accepted';
          result.textContent = 'Accepted';
          document.body.append(result);
        }),
      );
      const initial = await observe(page, 'Open the accepting entry');
      const first = initial.actions.find((a) => a.selector?.includes('#first'));
      const second = initial.actions.find((a) =>
        a.selector?.includes('#second'),
      );
      if (!first || !second) throw new Error('Missing duplicate controls');
      expect(first.signature).toBe(second.signature);
      const selected: string[] = [];
      let calls = 0;
      const fetch: typeof globalThis.fetch = async (_url, init) => {
        const body = requestBody(init);
        calls += 1;
        const criteria = body.questions.click_target?.criteria || {};
        const target =
          calls === 1
            ? first.id
            : calls === 2
              ? targetFor(body, 'CLICK', 'Back')
              : second.id;
        if (calls === 3) {
          expect(criteria).not.toHaveProperty(first.id);
          expect(criteria).toHaveProperty(second.id);
        }
        selected.push(target);
        return answer('CLICK', target);
      };
      const result = await runJev(page, {
        goal: 'Open the accepting entry',
        fetch,
        maxSteps: 5,
        verifyCompletion: async () =>
          (await page.locator('#accepted').count()) === 1,
      });
      expect(selected).toEqual([first.id, expect.any(String), second.id]);
      expect(result.completionVerified).toBe(true);
      expect(result.steps).toBe(3);
    });
  }
});
