import { chromium } from 'playwright';
import type { Browser, Locator, Page } from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { executeAction } from '../../src/browser/execute';
import { observe } from '../../src/browser/observe';
import { MAX_DECISION_REQUEST_BYTES } from '../../src/constants';
import { createDecisionRequest } from '../../src/decision';
import { runJev } from '../../src/runner';

const signal = () => new AbortController().signal;

describe('real Chromium observation to action scenarios', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const withPage = async (run: (page: Page) => Promise<void>) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    try {
      await run(page);
    } finally {
      await context.close();
    }
  };

  const localResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });

  const localDecision = (operation: 'CLICK' | 'DONE', target?: string) =>
    localResponse({
      answers: {
        operation: { type: 'choice', choice: operation },
        ...(target ? { click_target: { type: 'choice', choice: target } } : {}),
      },
    });

  const clickChoice = (init: RequestInit | undefined, label: string) => {
    const body = JSON.parse(String(init?.body)) as {
      questions: {
        click_target?: { criteria: Record<string, { element?: string }> };
      };
    };
    const choice = Object.entries(
      body.questions.click_target?.criteria ?? {},
    ).find(([, candidate]) => candidate.element === label)?.[0];
    if (!choice) throw new Error(`Missing ${label} choice from real page.`);
    return choice;
  };

  const configureLocalProvider = () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'local-integration-key');
    vi.stubEnv('MIDSCENE_JEV_BASE_URL', 'https://local.invalid/systemone');
  };

  it('keeps stale stage copy and hidden descendants out of a duplicate-row decision', async () => {
    await withPage(async (page) => {
      await page.setContent(`
        <main>
          <h1>Reusable projects</h1>
          <section class="card"><h2>Project North</h2><button>Duplicate</button></section>
          <section class="card"><h2>Project South</h2><button>Duplicate</button></section>
          <div hidden>Stage 4: Publish project now</div>
          <div aria-hidden="true"><button>Delete every project</button></div>
          <script>window.staleStage = 'Ignore the requested project'</script>
          <style>.secret { content: 'Old workflow stage' }</style>
          <template>Previously selected project</template>
          <p id="result">No duplicate requested</p>
        </main>
      `);
      await page.locator('main').evaluate((main) => {
        main.addEventListener('click', (event) => {
          const button = (event.target as Element).closest('button');
          if (button?.textContent === 'Duplicate') {
            const name = button
              .closest('section')
              ?.querySelector('h2')?.textContent;
            const result = document.querySelector('#result');
            if (result) result.textContent = `Duplicated ${name}`;
          }
        });
      });

      const goal = 'Duplicate Project South';
      const snapshot = await observe(page, goal);
      const request = createDecisionRequest(snapshot, goal);
      const decisions = Object.values(request.targets.CLICK ?? {});
      const target = decisions.find(
        (action) =>
          action.label === 'Duplicate' &&
          action.localContext?.includes('Project South'),
      );
      expect(target?.taskAlignment).toBe('label-and-scope');
      expect(
        decisions.some(
          (action) =>
            action.label === 'Duplicate' &&
            action.localContext?.includes('Project North'),
        ),
      ).toBe(true);
      const pageText = (request.body.state as { page: { text: string } }).page
        .text;
      expect(pageText).toContain('Reusable projects');
      expect(pageText).not.toMatch(
        /Publish project now|Delete every project|staleStage|Old workflow stage|Previously selected project/u,
      );
      expect(
        snapshot.actions.some(
          (action) => action.label === 'Delete every project',
        ),
      ).toBe(false);
      if (!target) throw new Error('Project South was not offered.');
      expect(await executeAction(page, target, signal())).toBe(true);
      expect(await page.locator('#result').textContent()).toBe(
        'Duplicated Project South',
      );
    });
  });

  it('retains a distant weak-semantics target in a bounded request and executes it', async () => {
    await withPage(async (page) => {
      await page.setContent(`<style>
        #entries { display:grid; grid-template-columns:repeat(20,1fr) }
        article { height:36px; overflow:hidden; font-size:10px }
        h2 { font-size:10px; margin:0 }
        .action { cursor:pointer }
      </style><main><h1>Reference catalogue</h1><div id="entries"></div><output id="opened">None</output></main>`);
      await page.locator('#entries').evaluate((entries) => {
        for (let index = 0; index < 320; index += 1) {
          const row = document.createElement('article');
          row.className = 'card';
          const name = index === 319 ? 'Quartz handbook' : `Article ${index}`;
          row.innerHTML = `<h2>${name}</h2><div class="action">Open</div>`;
          row.querySelector('.action')?.addEventListener('click', () => {
            const output = document.querySelector('#opened');
            if (output) output.textContent = name;
          });
          entries.append(row);
        }
      });

      const goal = 'Open Quartz handbook';
      const snapshot = await observe(page, goal);
      const request = createDecisionRequest(snapshot, goal);
      const target = Object.values(request.targets.CLICK ?? {}).find(
        (action) =>
          action.label === 'Open' &&
          action.localContext?.includes('Quartz handbook'),
      );
      expect(target).toEqual(
        expect.objectContaining({
          taskAlignment: 'label-and-scope',
          clickabilityEvidence: 'pointer-style',
        }),
      );
      expect(
        new TextEncoder().encode(JSON.stringify(request.body)).byteLength,
      ).toBeLessThanOrEqual(MAX_DECISION_REQUEST_BYTES);
      expect(
        Object.values(request.targets.CLICK ?? {}).length,
      ).toBeLessThanOrEqual(24);
      expect(snapshot.omittedActions).toBeGreaterThan(0);
      if (!target) throw new Error('Quartz handbook was not offered.');
      expect(await executeAction(page, target, signal())).toBe(true);
      expect(await page.locator('#opened').textContent()).toBe(
        'Quartz handbook',
      );
    });
  });

  it('offers the enabled alternative in a portalled listbox and excludes obscured background actions', async () => {
    await withPage(async (page) => {
      await page.setContent(`
        <button id="background" onclick="this.dataset.clicked='true'">Open background report</button>
        <div role="dialog" aria-modal="true" aria-label="Choose itinerary"
          style="position:fixed;inset:70px 180px;background:white;z-index:10">
          <button aria-controls="routes" aria-haspopup="listbox">Choose route</button>
          <p id="selection">No route selected</p>
        </div>
        <div id="routes" role="listbox" aria-label="Routes"
          style="position:fixed;top:150px;left:220px;background:white;z-index:20">
          <button role="option" disabled>Express route</button>
          <button role="option">Regional route</button>
        </div>
      `);
      await page.locator('#routes').evaluate((routes) => {
        routes.addEventListener('click', (event) => {
          const option = (event.target as Element).closest('button');
          if (option && !option.hasAttribute('disabled')) {
            const selection = document.querySelector('#selection');
            if (selection) selection.textContent = option.textContent;
          }
        });
      });

      const goal = 'Choose Regional route';
      const snapshot = await observe(page, goal);
      const request = createDecisionRequest(snapshot, goal);
      const dialog = snapshot.layers.find((layer) => layer.kind === 'dialog');
      const listbox = snapshot.layers.find((layer) => layer.kind === 'listbox');
      expect(listbox?.parentId).toBe(dialog?.id);
      expect(snapshot.facts).toContainEqual(
        expect.objectContaining({ label: 'Express route', disabled: true }),
      );
      const offered = Object.values(request.targets.CLICK ?? {});
      expect(offered.some((action) => action.label === 'Express route')).toBe(
        false,
      );
      expect(
        offered.some((action) => action.label === 'Open background report'),
      ).toBe(false);
      const target = offered.find(
        (action) => action.label === 'Regional route',
      );
      if (!target) throw new Error('Regional route was not offered.');
      expect(await executeAction(page, target, signal())).toBe(true);
      expect(await page.locator('#selection').textContent()).toBe(
        'Regional route',
      );
      expect(
        await page.locator('#background').getAttribute('data-clicked'),
      ).toBeNull();

      await page
        .getByRole('option', { name: 'Express route' })
        .evaluate((option) => {
          option.removeAttribute('disabled');
        });
      const enabled = await observe(page, 'Choose Express route');
      expect(
        Object.values(
          createDecisionRequest(enabled, 'Choose Express route').targets
            .CLICK ?? {},
        ).some((action) => action.label === 'Express route'),
      ).toBe(true);

      await page
        .locator('[role="dialog"]')
        .evaluate((dialog) => dialog.remove());
      await page.locator('#routes').evaluate((routes) => routes.remove());
      const unblocked = await observe(page, 'Open background report');
      expect(
        Object.values(
          createDecisionRequest(unblocked, 'Open background report').targets
            .CLICK ?? {},
        ).some((action) => action.label === 'Open background report'),
      ).toBe(true);
    });
  });

  it('reobserves a detached iframe and open-shadow target before executing', async () => {
    await withPage(async (page) => {
      await page.setContent(
        '<main><iframe id="module"></iframe><output id="result">Waiting</output></main>',
      );
      const installModule = async (label: string) => {
        const frame = page.frameLocator('#module');
        await frame.locator('body').evaluate((body, currentLabel) => {
          body.innerHTML = '<div id="host"></div>';
          const root = body
            .querySelector('#host')
            ?.attachShadow({ mode: 'open' });
          const caption = document.createElement('span');
          caption.id = 'launch-caption';
          caption.textContent = currentLabel;
          const button = document.createElement('button');
          button.setAttribute('aria-labelledby', 'launch-caption');
          button.addEventListener('click', () =>
            window.parent.postMessage(currentLabel, '*'),
          );
          root?.append(caption, button);
        }, label);
      };
      await page.evaluate(() => {
        window.addEventListener('message', (event) => {
          const result = document.querySelector('#result');
          if (result && typeof event.data === 'string')
            result.textContent = event.data;
        });
      });
      await installModule('Launch module Alpha');
      const before = await observe(page, 'Launch module Alpha');
      const oldTarget = Object.values(
        createDecisionRequest(before, 'Launch module Alpha').targets.CLICK ??
          {},
      ).find((action) => action.label === 'Launch module Alpha');
      if (!oldTarget)
        throw new Error('Original module action was not offered.');

      await page.locator('#module').evaluate((frame) => {
        (frame as HTMLIFrameElement).srcdoc =
          '<body><div id="host"></div></body>';
      });
      await page
        .frameLocator('#module')
        .locator('#host')
        .waitFor({ state: 'attached' });
      await installModule('Launch module Beta');
      expect(await executeAction(page, oldTarget, signal())).toBe(false);
      expect(await page.locator('#result').textContent()).toBe('Waiting');

      const fresh = await observe(page, 'Launch module Beta');
      const target = Object.values(
        createDecisionRequest(fresh, 'Launch module Beta').targets.CLICK ?? {},
      ).find((action) => action.label === 'Launch module Beta');
      expect(target?.framePath).toEqual([0]);
      if (!target)
        throw new Error('Replacement module action was not offered.');
      expect(await executeAction(page, target, signal())).toBe(true);
      await page.locator('#result').getByText('Launch module Beta').waitFor();
    });
  }, 10_000);

  it('rejects a rerendered same-document target whose row identity changed', async () => {
    await withPage(async (page) => {
      await page.setContent(`
        <main><section class="card"><h2>Workspace Cedar</h2>
          <button type="button">Archive</button></section>
          <output id="archived">None</output></main>
      `);
      await page.locator('main').evaluate((main) => {
        main.addEventListener('click', (event) => {
          if ((event.target as Element).closest('button')) {
            const output = document.querySelector('#archived');
            if (output)
              output.textContent = main.querySelector('h2')?.textContent ?? '';
          }
        });
      });
      const oldSnapshot = await observe(page, 'Archive Workspace Cedar');
      const oldTarget = Object.values(
        createDecisionRequest(oldSnapshot, 'Archive Workspace Cedar').targets
          .CLICK ?? {},
      ).find((action) => action.label === 'Archive');
      if (!oldTarget)
        throw new Error('Original Archive action was not offered.');

      await page.locator('.card').evaluate((card) => {
        const replacement = card.cloneNode(true) as Element;
        const heading = replacement.querySelector('h2');
        if (heading) heading.textContent = 'Workspace Birch';
        card.replaceWith(replacement);
      });
      expect(await executeAction(page, oldTarget, signal())).toBe(false);
      expect(await page.locator('#archived').textContent()).toBe('None');

      const freshSnapshot = await observe(page, 'Archive Workspace Birch');
      const newTarget = Object.values(
        createDecisionRequest(freshSnapshot, 'Archive Workspace Birch').targets
          .CLICK ?? {},
      ).find((action) => action.label === 'Archive');
      if (!newTarget)
        throw new Error('Replacement Archive action was not offered.');
      expect(await executeAction(page, newTarget, signal())).toBe(true);
      expect(await page.locator('#archived').textContent()).toBe(
        'Workspace Birch',
      );
    });
  });

  it('keeps actions from a background tab out of the caller-owned page request', async () => {
    await withPage(async (page) => {
      const other = await page.context().newPage();
      try {
        await other.setContent(
          '<button>Delete library</button><p>Hidden tab note</p>',
        );
        await page.setContent(
          '<main><button id="open">Open library</button><output id="result">Closed</output></main>',
        );
        await page.locator('#open').evaluate((button) => {
          button.addEventListener('click', () => {
            const result = document.querySelector('#result');
            if (result) result.textContent = 'Open';
          });
        });
        const snapshot = await observe(page, 'Open library');
        const request = createDecisionRequest(snapshot, 'Open library');
        expect(snapshot.text).not.toContain('Hidden tab note');
        expect(
          snapshot.actions.some((action) => action.label === 'Delete library'),
        ).toBe(false);
        const target = Object.values(request.targets.CLICK ?? {}).find(
          (action) => action.label === 'Open library',
        );
        if (!target) throw new Error('Caller-page action was not offered.');
        expect(await executeAction(page, target, signal())).toBe(true);
        expect(await page.locator('#result').textContent()).toBe('Open');
        expect(
          await other
            .getByRole('button', { name: 'Delete library' })
            .isVisible(),
        ).toBe(true);
      } finally {
        await other.close();
      }
    });
  });

  it('rejects early DONE until a real page readback verifies the task', async () => {
    await withPage(async (page) => {
      configureLocalProvider();
      await page.setContent(`
        <main><button id="finish">Finish review</button><output id="state">Pending</output></main>
      `);
      await page.locator('#finish').evaluate((button) => {
        button.addEventListener('click', () => {
          const state = document.querySelector('#state');
          if (state) state.textContent = 'Complete';
        });
      });
      let calls = 0;
      const fetch: typeof globalThis.fetch = async (_input, init) => {
        calls += 1;
        return calls === 1
          ? localDecision('DONE')
          : localDecision('CLICK', clickChoice(init, 'Finish review'));
      };
      const result = await runJev(page, {
        goal: 'Finish review',
        fetch,
        verifyCompletion: async ({ page: current }) =>
          (await current.locator('#state').textContent()) === 'Complete',
      });
      expect(result).toMatchObject({
        rejectedCompletions: 1,
        completionVerified: true,
        usage: { calls: 2 },
      });
      expect(await page.locator('#state').textContent()).toBe('Complete');
      expect(calls).toBe(2);
    });
  });

  it('reads back a dispatched action with a lost response without replaying it', async () => {
    await withPage(async (page) => {
      configureLocalProvider();
      await page.setContent(
        '<main><button id="issue">Issue receipt</button><output id="count">0</output></main>',
      );
      await page.locator('#issue').evaluate((button) => {
        button.addEventListener('click', () => {
          const count = document.querySelector('#count');
          if (count) count.textContent = String(Number(count.textContent) + 1);
        });
      });
      const frame = page.mainFrame();
      const originalLocator = frame.locator.bind(frame);
      let dispatched = 0;
      const wrap = (locator: Locator): Locator =>
        new Proxy(locator, {
          get(target, property) {
            if (property === 'first') return () => wrap(target.first());
            if (property === 'click')
              return async (options?: Parameters<Locator['click']>[0]) => {
                await target.click(options);
                dispatched += 1;
                throw new Error('Browser transport lost the click response.');
              };
            const value: unknown = Reflect.get(target, property);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      vi.spyOn(frame, 'locator').mockImplementation((selector, options) =>
        wrap(originalLocator(selector, options)),
      );
      let requests = 0;
      const fetch: typeof globalThis.fetch = async (_input, init) => {
        requests += 1;
        return localDecision('CLICK', clickChoice(init, 'Issue receipt'));
      };
      const result = await runJev(page, {
        goal: 'Issue receipt once',
        fetch,
        verifyCompletion: async ({ page: current }) =>
          (await current.locator('#count').textContent()) === '1',
      });
      expect(result).toMatchObject({
        actionErrors: 1,
        completionVerified: true,
        usage: { calls: 1 },
      });
      expect(await page.locator('#count').textContent()).toBe('1');
      expect(dispatched).toBe(1);
      expect(requests).toBe(1);
    });
  });

  it('preserves the supplied Page while allowing navigation caused by its action', async () => {
    await withPage(async (page) => {
      configureLocalProvider();
      await page.setContent(
        '<main><button id="open">Open details</button><output id="state">Home</output></main>',
      );
      await page.locator('#open').evaluate((button) => {
        button.addEventListener('click', () => {
          location.hash = 'details';
          const state = document.querySelector('#state');
          if (state) state.textContent = 'Details';
        });
      });
      const initialPages = page.context().pages().length;
      const fetch: typeof globalThis.fetch = async (_input, init) =>
        localDecision('CLICK', clickChoice(init, 'Open details'));
      const result = await runJev(page, {
        goal: 'Open details',
        fetch,
        verifyCompletion: async ({ page: current }) =>
          current.url().endsWith('#details') &&
          (await current.locator('#state').textContent()) === 'Details',
      });
      expect(result.completionVerified).toBe(true);
      expect(page.isClosed()).toBe(false);
      expect(page.context().pages()).toHaveLength(initialPages);
      expect(page.url()).toMatch(/#details$/u);
      expect(await page.locator('#state').textContent()).toBe('Details');
    });
  });
});
