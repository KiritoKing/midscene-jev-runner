import { randomUUID } from 'node:crypto';
import { type Browser, type Page, chromium } from 'playwright';
import { expect as pwExpect } from 'playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeAction } from '../../src/browser/execute';
import { observe } from '../../src/browser/observe';
import { createDecisionRequest } from '../../src/decision';
import type { BrowserAction } from '../../src/internal-types';
import {
  type FixtureScenario,
  type FixtureServer,
  startFixtureServer,
} from '../fixtures/server';

const sourceId = 'campaign-source-01';

describe('real Chromium against isolated HTTP fixtures', () => {
  let browser: Browser;
  let fixture: FixtureServer;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.FIXTURE_BROWSER_EXECUTABLE
        ? { executablePath: process.env.FIXTURE_BROWSER_EXECUTABLE }
        : {}),
    });
  });
  afterAll(async () => {
    await browser?.close();
    await fixture?.close();
  });

  async function withScenario(
    scenario: FixtureScenario,
    run: (page: Page, runId: string, blocked: string[]) => Promise<void>,
    fault?: string,
  ) {
    const runId = randomUUID();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const blocked: string[] = [];
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith(`${fixture.origin}/`)) await route.continue();
      else {
        blocked.push(url);
        await route.abort();
      }
    });
    try {
      const url = new URL(fixture.url(scenario, runId));
      if (fault) url.searchParams.set('fault', fault);
      await page.goto(url.toString());
      await run(page, runId, blocked);
      expect(blocked).toEqual([]);
    } finally {
      await context.close();
    }
  }

  async function chooseObserved(
    page: Page,
    goal: string,
    match: (candidate: BrowserAction) => boolean,
  ) {
    const snapshot = await observe(page, goal);
    const decision = createDecisionRequest(snapshot, goal);
    const action = Object.values(decision.targets.CLICK ?? {}).find(match);
    expect(action, `Missing observed action for ${goal}`).toBeDefined();
    expect(
      await executeAction(
        page,
        action as BrowserAction,
        new AbortController().signal,
      ),
    ).toBe(true);
  }

  async function openMarketingWizard(page: Page) {
    const row = page.locator(`tr[data-row="${sourceId}"]`);
    await pwExpect(row).toBeVisible();
    await row.getByRole('button', { name: /更多/ }).click();
    await row.getByRole('button', { name: '克隆玩法' }).click();
    await pwExpect(
      page.getByRole('heading', { name: '克隆玩法' }),
    ).toBeVisible();
    await pwExpect(page.locator('.wizard-step[data-step="1"]')).toBeVisible();
  }

  async function completeMarketingWizard(page: Page, name: string) {
    await openMarketingWizard(page);
    await page.locator('#copy-name').fill(name);
    await page.getByLabel('开始日期').fill('2026-10-01');
    await page.getByLabel('结束日期').fill('2026-12-30');
    await page.getByRole('button', { name: '下一步' }).click();
    await pwExpect(page.locator('.wizard-step[data-step="2"]')).toBeVisible();
    await pwExpect(page.locator('#rule-select')).toBeEnabled();
    await page.getByRole('button', { name: '下一步' }).click();
    await pwExpect(page.locator('.wizard-step[data-step="3"]')).toBeVisible();
    await page.getByRole('button', { name: '下一步' }).click();
    await pwExpect(page.locator('.wizard-step[data-step="4"]')).toBeVisible();
    await pwExpect(page.locator('#benefit-select')).toBeEnabled();
    await page.getByRole('button', { name: '下一步' }).click();
    await pwExpect(page.locator('.wizard-step[data-step="5"]')).toBeVisible();
    await pwExpect(page.locator('#preview-content')).toContainText(name);
  }

  it('shows a dense paginated table, recursive menu, cached tabs and disposed close state', async () => {
    await withScenario('marketing-clone', async (page, runId) => {
      await pwExpect(
        page.locator('[data-panel="touchpoint"] .data-table tbody tr'),
      ).toHaveCount(10);
      await pwExpect(page.locator('#total-count')).toHaveText('共 35 条');
      await page.getByRole('button', { name: '下一页' }).click();
      await pwExpect(page.locator('.pagination')).toContainText('第 2 / 4 页');
      await page.locator('input[name="query"]').fill('Blue');
      await page.getByRole('button', { name: '查询' }).click();
      await pwExpect(
        page.locator('[data-panel="touchpoint"] .data-table tbody tr'),
      ).toHaveCount(1);
      await pwExpect(page.locator('#total-count')).toHaveText('共 1 条');
      await page.getByRole('button', { name: '配置服务' }).click();
      await page.getByRole('button', { name: '人群规则' }).click();
      await pwExpect(page.getByRole('tab', { name: /人群规则/ })).toBeVisible();
      const hidden = await observe(
        page,
        'Clone Blue Meridian from the activity list',
      );
      expect(hidden.text).not.toContain('Blue Meridian');
      expect(
        hidden.actions.some((action) => action.label.includes('克隆玩法')),
      ).toBe(false);
      await page.getByRole('tab', { name: /触点玩法/ }).click();
      await pwExpect(page.locator('input[name="query"]')).toHaveValue('Blue');
      await pwExpect(
        page.locator('[data-panel="touchpoint"] .data-table tbody tr'),
      ).toHaveCount(1);
      await page
        .getByRole('tab', { name: /人群规则/ })
        .locator('[data-close]')
        .click();
      expect(await page.locator('[data-panel="rules"]').count()).toBe(0);
      expect((await fixture.readState(runId)).result.copies).toEqual([]);
    });
  });

  it('exposes local row context and a real shadow detail with same-origin frame', async () => {
    await withScenario('marketing-clone', async (page) => {
      await pwExpect(
        page.locator('[data-panel="touchpoint"] .data-table tbody tr'),
      ).toHaveCount(10);
      const snapshot = await observe(page, 'Open Blue Meridian details');
      expect(
        snapshot.actions.some((action) =>
          action.label.includes('Blue Meridian'),
        ),
      ).toBe(true);
      await chooseObserved(
        page,
        'Open Blue Meridian details',
        (action) =>
          action.label.includes('Blue Meridian') && action.kind === 'click',
      );
      await pwExpect(page.locator('activity-detail')).toBeVisible();
      await pwExpect(page.locator('activity-detail').locator('h3')).toHaveText(
        'Blue Meridian',
      );
      const frame = page.frameLocator('iframe[title="规则与权益配置说明"]');
      await pwExpect(
        frame.getByRole('button', { name: '新客与活跃用户' }),
      ).toBeVisible();
      await frame.getByLabel('规则名称').fill('会员');
      await frame.getByRole('button', { name: '查询规则' }).click();
      await pwExpect(
        frame.getByRole('button', { name: '会员等级人群' }),
      ).toBeVisible();
      await pwExpect(
        frame.getByRole('button', { name: '新客与活跃用户' }),
      ).toHaveCount(0);
      const frameSnapshot = await observe(
        page,
        'Open the matching member audience rule',
      );
      expect(
        frameSnapshot.actions.some(
          (action) =>
            action.label.includes('会员等级人群') &&
            Boolean(action.framePath?.length),
        ),
      ).toBe(true);
      await chooseObserved(
        page,
        'Open the matching member audience rule',
        (action) =>
          action.label.includes('会员等级人群') &&
          Boolean(action.framePath?.length),
      );
      await pwExpect(frame.locator('#detail')).toContainText('银卡及以上');
    });
  });

  it('rejects incomplete and out-of-order submission, then creates once after four validated steps and preview confirmation', async () => {
    await withScenario('marketing-clone', async (page, runId) => {
      const initialSource = (await fixture.readState(runId)).result.source;
      const base = `${fixture.origin}/api/marketing/${runId}`;
      const direct = await page.request.post(`${base}/clone`, {
        data: { submissionId: 'early', name: 'Early' },
      });
      expect(direct.status()).toBe(409);
      await openMarketingWizard(page);
      await page.getByRole('button', { name: '下一步' }).click();
      await pwExpect(page.locator('.wizard-step[data-step="1"]')).toBeVisible();
      const session = await (await page.request.get(`${base}/session`)).json();
      const jump = await page.request.post(`${base}/session/step`, {
        data: {
          sessionId: session.wizard.sessionId,
          step: 4,
          data: {
            benefitId: 'benefit-voucher',
            quantity: 1,
            ruleId: 'rule-growth',
          },
        },
      });
      expect(jump.status()).toBe(409);
      await page
        .locator('#copy-name')
        .fill(`Blue Meridian verified ${runId.slice(0, 8)}`);
      await page.getByLabel('开始日期').fill('2026-10-01');
      await page.getByLabel('结束日期').fill('2026-12-30');
      for (let step = 1; step <= 4; step++) {
        if (step === 2)
          await pwExpect(page.locator('#rule-select')).toBeEnabled();
        if (step === 4)
          await pwExpect(page.locator('#benefit-select')).toBeEnabled();
        await page.getByRole('button', { name: '下一步' }).click();
        await pwExpect(
          page.locator(`.wizard-step[data-step="${step + 1}"]`),
        ).toBeVisible();
      }
      const beforeConfirm = await page.request.post(`${base}/clone`, {
        data: {
          sessionId: session.wizard.sessionId,
          submissionId: 'preconfirm',
          name: `Blue Meridian verified ${runId.slice(0, 8)}`,
        },
      });
      expect(beforeConfirm.status()).toBe(409);
      const preview = await observe(page, 'Confirm the reviewed clone');
      expect(preview.text).toContain('差异预览');
      expect(preview.text).not.toContain('单日发放预警阈值');
      expect(preview.actions.some((action) => action.label === '下一步')).toBe(
        false,
      );
      await page.getByRole('button', { name: '查看并确认差异' }).click();
      await page.getByRole('button', { name: '确认差异', exact: true }).click();
      await page.getByRole('button', { name: '提交', exact: true }).click();
      await pwExpect(page.locator('.wizard-step[data-step="6"]')).toBeVisible();
      const state = await fixture.readState(runId);
      expect(state.result.source).toEqual(initialSource);
      expect(state.result.copies).toHaveLength(1);
      expect(state.result.latestCopy).toMatchObject({
        id: `COPY-${runId}-0001`,
        name: `Blue Meridian verified ${runId.slice(0, 8)}`,
        sourceId,
        status: '未生效',
        startDate: '2026-10-01',
        validUntil: '2026-12-30',
        rule: 'rule-growth',
        audience: 'all',
        benefit: 'benefit-voucher',
        quantity: 1,
        frequency: 2,
        period: 'day',
        grantMode: '实时发放',
      });
      expect(state.result.wizard).toMatchObject({
        stage: 'warning',
        completed: [1, 2, 3, 4],
        confirmed: true,
      });
      expect(
        state.events.filter((event) => event.type === 'wizard-step-completed'),
      ).toHaveLength(4);
      expect(
        state.events.filter((event) => event.type === 'clone-created'),
      ).toHaveLength(1);
      expect(state.attempts.map((attempt) => attempt.outcome)).toEqual([
        'rejected',
        'rejected',
        'committed',
      ]);
    });
  });

  it('reconciles a committed 503 via independent readback without replay and keeps runs isolated', async () => {
    await withScenario(
      'marketing-clone',
      async (page, runId) => {
        const initialSource = (await fixture.readState(runId)).result.source;
        const otherRun = randomUUID();
        const other = await page.context().newPage();
        await other.goto(fixture.url('marketing-clone', otherRun));
        const name = `Response lost ${runId.slice(0, 8)}`;
        await completeMarketingWizard(page, name);
        await page.getByRole('button', { name: '查看并确认差异' }).click();
        await page
          .getByRole('button', { name: '确认差异', exact: true })
          .click();
        await page.getByRole('button', { name: '提交', exact: true }).click();
        await pwExpect(
          page.locator('.wizard-step[data-step="6"]'),
        ).toBeVisible();
        const state = await fixture.readState(runId);
        expect(state.result.source).toEqual(initialSource);
        expect(state.result.copies).toHaveLength(1);
        expect(state.result.latestCopy).toMatchObject({ name, sourceId });
        expect(state.attempts).toEqual([
          expect.objectContaining({ operation: 'clone', outcome: 'committed' }),
        ]);
        expect(
          state.events.filter((event) => event.type === 'clone-created'),
        ).toHaveLength(1);
        const replay = await page.request.post(
          `${fixture.origin}/api/marketing/${runId}/clone`,
          { data: { submissionId: state.attempts[0].submissionId } },
        );
        expect(replay.status()).toBe(200);
        expect((await fixture.readState(runId)).result.copies).toHaveLength(1);
        const isolated = await fixture.readState(otherRun);
        expect(isolated.result.copies).toEqual([]);
        expect(isolated.events).toEqual([]);
        await other.close();
      },
      'commit503',
    );
  });

  it('opens the featured article and another home article, then returns home through the logo', async () => {
    await withScenario('encyclopedia', async (page, runId) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await pwExpect(
        page.getByRole('link', { name: 'Full article...' }),
      ).toHaveAttribute('href', /article\/mary-mallon/);
      await page.getByRole('link', { name: 'Full article...' }).click();
      await pwExpect(
        page.getByRole('heading', { name: 'Mary Mallon', level: 1 }),
      ).toBeVisible();
      expect(page.url()).toContain('/article/mary-mallon');
      expect((await fixture.readState(runId)).result).toMatchObject({
        articleId: 'mary-mallon',
        articleTitle: 'Mary Mallon',
        view: 'article',
      });
      await page.getByRole('link', { name: 'Wikipedia main page' }).click();
      await pwExpect(
        page.getByRole('heading', { name: 'Main Page', level: 1 }),
      ).toBeVisible();
      expect(page.url()).toContain(`/scenario/encyclopedia?runId=${runId}`);
      expect((await fixture.readState(runId)).result).toMatchObject({
        articleId: null,
        view: 'main',
      });
      await page
        .getByRole('link', { name: 'Punjab Legislative Assembly' })
        .click();
      await pwExpect(
        page.getByRole('heading', {
          name: 'Punjab Legislative Assembly',
          level: 1,
        }),
      ).toBeVisible();
      expect((await fixture.readState(runId)).result.articleId).toBe(
        'punjab-legislative-assembly',
      );
      expect(
        (await fixture.readState(runId)).events.map((event) => event.type),
      ).toEqual(['articleOpened', 'homeOpened', 'articleOpened']);
      expect(errors).toEqual([]);
    });
  });

  it('routes home topic links to local search and explains unsupported chrome actions', async () => {
    await withScenario('encyclopedia', async (page, runId) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.getByRole('link', { name: 'marine snail' }).click();
      await pwExpect(
        page.getByRole('heading', { name: 'Search results', level: 1 }),
      ).toBeVisible();
      expect(page.url()).toContain('search=marine%20snail');
      expect((await fixture.readState(runId)).result).toMatchObject({
        query: 'marine snail',
        searchQuery: 'marine snail',
        view: 'results',
      });
      await page.getByRole('button', { name: 'Advanced search' }).click();
      await pwExpect(page.locator('#preview-notice')).toContainText(
        'Advanced search is outside this local reading-and-search preview',
      );
      await page.getByRole('button', { name: 'Close preview notice' }).click();
      await pwExpect(page.locator('#preview-notice')).toBeHidden();
      await page.getByRole('button', { name: 'About Wikipedia' }).click();
      await pwExpect(page.locator('#preview-notice')).toContainText(
        'About Wikipedia is outside this local reading-and-search preview',
      );
      expect(
        (await fixture.readState(runId)).events.map((event) => event.type),
      ).toEqual(['searchSubmitted']);
      expect(errors).toEqual([]);
    });
  });

  it('keeps every visible encyclopedia link and button bound to a local target or explicit action', async () => {
    await withScenario('encyclopedia', async (page, runId) => {
      const knownButtons = new Set([
        'menu-toggle',
        'tools-toggle',
        'appearance-toggle',
        'toc-toggle',
        'preview-notice-close',
      ]);
      const audit = async () => {
        const controls = await page.evaluate(() => {
          const visible = (element: Element) =>
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== 'hidden';
          return {
            links: [...document.querySelectorAll('a[href]')]
              .filter(visible)
              .map((anchor) => ({
                label: anchor.textContent?.trim() ?? '',
                href: anchor.getAttribute('href') ?? '',
              })),
            buttons: [...document.querySelectorAll('button')]
              .filter(visible)
              .map((button) => ({
                id: button.id,
                type: button.type,
                info: button.hasAttribute('data-local-info'),
              })),
          };
        });
        expect(controls.links.length).toBeGreaterThan(5);
        expect(
          new Set(controls.links.map(({ href }) => href)).size,
        ).toBeGreaterThan(5);
        for (const { label, href } of controls.links) {
          expect(href, `Empty link: ${label}`).not.toBe('');
          expect(href, `Placeholder link: ${label}`).not.toBe('#site-footer');
          const target = new URL(href, page.url());
          expect(target.origin, `External link: ${label}`).toBe(fixture.origin);
          const current = new URL(page.url());
          if (
            target.hash &&
            target.pathname === current.pathname &&
            target.search === current.search
          ) {
            expect(
              await page.evaluate(
                (hash) =>
                  Boolean(
                    document.getElementById(decodeURIComponent(hash.slice(1))),
                  ),
                target.hash,
              ),
              `Missing anchor target: ${label}`,
            ).toBe(true);
          } else {
            expect(
              (await page.request.get(target.toString())).status(),
              `Broken route: ${label}`,
            ).toBe(200);
          }
        }
        expect(
          controls.buttons.filter(
            ({ id, type, info }) =>
              !info && type !== 'submit' && !knownButtons.has(id),
          ),
        ).toEqual([]);
      };
      await audit();
      await page.goto(
        `${fixture.origin}/scenario/encyclopedia/results?runId=${runId}&search=incompleteness%20theorems%20logic`,
      );
      await audit();
      await page.goto(
        `${fixture.origin}/scenario/encyclopedia/article/godel-incompleteness?runId=${runId}`,
      );
      await audit();
    });
  }, 20_000);

  it('searches a substantial encyclopedia results page and opens the article with independent state readback', async () => {
    await withScenario('encyclopedia', async (page, runId) => {
      const secondRun = randomUUID();
      await page
        .getByLabel('Search Wikipedia')
        .first()
        .fill('incompleteness theorems logic');
      await page
        .getByRole('button', { name: 'Search', exact: true })
        .first()
        .click();
      await pwExpect(
        page.getByRole('heading', { name: 'Search results' }),
      ).toBeVisible();
      expect(page.url()).toContain('/scenario/encyclopedia/results');
      await pwExpect(page.locator('.search-result')).toHaveCount(4);
      await page
        .getByRole('link', { name: "Gödel's incompleteness theorems" })
        .first()
        .click();
      await pwExpect(
        page.getByRole('heading', {
          name: "Gödel's incompleteness theorems",
          level: 1,
        }),
      ).toBeVisible();
      expect(page.url()).toContain(
        '/scenario/encyclopedia/article/godel-incompleteness',
      );
      await pwExpect(page.locator('img').first()).toBeVisible();
      expect(
        await page
          .locator('img')
          .first()
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      const state = await fixture.readState(runId);
      expect(state.result).toMatchObject({
        query: 'incompleteness theorems logic',
        articleId: 'godel-incompleteness',
        articleTitle: "Gödel's incompleteness theorems",
        navigated: true,
        view: 'article',
      });
      expect(state.events.map((event) => event.type)).toEqual([
        'searchSubmitted',
        'articleOpened',
      ]);
      const second = await page.context().newPage();
      await second.goto(fixture.url('encyclopedia', secondRun));
      expect((await fixture.readState(secondRun)).events).toEqual([]);
      await second.close();
    });
  });

  it('rejects invalid encyclopedia routes and API actions without mutating the run', async () => {
    await withScenario('encyclopedia', async (page, runId) => {
      const base = `${fixture.origin}/api/encyclopedia/${runId}`;
      expect(
        (
          await page.request.post(`${base}/search`, { data: { query: '' } })
        ).status(),
      ).toBe(400);
      expect(
        (
          await page.request.post(`${base}/open-article`, {
            data: { articleId: 'missing' },
          })
        ).status(),
      ).toBe(404);
      expect(
        (
          await page.request.get(
            `${fixture.origin}/scenario/encyclopedia/article/missing?runId=${runId}`,
          )
        ).status(),
      ).toBe(404);
      const state = await fixture.readState(runId);
      expect(state.events).toEqual([]);
      expect(state.result).toMatchObject({ articleId: null, navigated: false });
    });
  });
});
