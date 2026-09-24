import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  CaseExecutionError,
  type CaseRunResult,
  createCaseRunner,
} from '@midscene/test';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightAgent } from '@midscene/web/playwright/agent';
import { type Browser, type Page, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createJevNodes } from '../../src/index';
import type { JevObserverEvent, JevRunResult } from '../../src/types';
import {
  type FixtureScenario,
  type FixtureServer,
  type FixtureState,
  startFixtureServer,
} from '../fixtures/server';

const departureDate = '2026-11-12';
const artifactDir = resolve('tests/e2e/.artifacts');

interface Context {
  page: Page;
  agent: PlaywrightAgent;
}

interface ScenarioSpec {
  scenario: FixtureScenario;
  steps(runId: string): Array<Record<string, unknown>>;
  verify(goal: string, state: FixtureState, page: Page): Promise<boolean>;
  assert(state: FixtureState, initialState: FixtureState): void;
}

const specs: ScenarioSpec[] = [
  {
    scenario: 'encyclopedia',
    steps: () => [
      {
        aiInput: {
          prompt: 'Visible Search Wikipedia text input',
          value: 'incompleteness theorems logic',
        },
      },
      {
        jevAct: {
          goal: 'Submit the Wikipedia search for incompleteness theorems logic and reach its search results',
          maxSteps: 8,
          maxTaskMs: 60_000,
        },
      },
      {
        jevAct: {
          goal: "Open Gödel's incompleteness theorems article from the search results",
          maxSteps: 8,
          maxTaskMs: 60_000,
        },
      },
    ],
    async verify(goal, state, page) {
      if (goal.startsWith('Submit the Wikipedia search'))
        return (
          state.result.query === 'incompleteness theorems logic' &&
          page.url().includes('/scenario/encyclopedia/results') &&
          (await page
            .getByRole('heading', { name: 'Search results' })
            .isVisible())
        );
      return (
        state.result.navigated === true &&
        state.result.articleId === 'godel-incompleteness' &&
        page
          .url()
          .includes('/scenario/encyclopedia/article/godel-incompleteness') &&
        (await page
          .getByRole('heading', { name: "Gödel's incompleteness theorems" })
          .isVisible())
      );
    },
    assert(state) {
      expect(state.result).toMatchObject({
        query: 'incompleteness theorems logic',
        articleId: 'godel-incompleteness',
        articleTitle: "Gödel's incompleteness theorems",
        navigated: true,
      });
      expect(state.events.map((event) => event.type)).toEqual([
        'searchSubmitted',
        'articleOpened',
      ]);
    },
  },
  {
    scenario: 'marketing-clone',
    steps: (runId) => [
      {
        jevAct: {
          goal: 'From the visible touchpoint activity table, open the Blue Meridian row More menu and choose Clone to reach step 1 Basic information',
          maxSteps: 12,
          maxTaskMs: 90_000,
        },
      },
      {
        aiInput: {
          prompt: 'Visible 玩法名称 input in step 1 基础信息',
          value: `Blue Meridian E2E ${runId.slice(0, 8)}`,
        },
      },
      {
        aiInput: {
          prompt: 'Visible 开始日期 date input in step 1',
          value: '2026-10-01',
        },
      },
      {
        aiInput: {
          prompt: 'Visible 结束日期 date input in step 1',
          value: '2026-12-30',
        },
      },
      {
        jevAct: {
          goal: 'Advance from Basic information through People scope, Frequency control, and Entitlements, validating each step until the Difference preview is visible',
          maxSteps: 18,
          maxTaskMs: 120_000,
        },
      },
      {
        jevAct: {
          goal: `Review and confirm the difference preview, then submit exactly one copy named Blue Meridian E2E ${runId.slice(0, 8)} and reach Warning configuration`,
          maxSteps: 12,
          maxTaskMs: 100_000,
        },
      },
    ],
    async verify(goal, state, page) {
      if (goal.startsWith('From the visible touchpoint'))
        return (
          state.events.some((event) => event.type === 'wizard-opened') &&
          page.locator('.wizard-step[data-step="1"]').isVisible()
        );
      if (goal.startsWith('Advance from Basic information'))
        return (
          (state.result.wizard as Record<string, unknown>).stage ===
            'preview' && page.locator('.wizard-step[data-step="5"]').isVisible()
        );
      return (
        state.result.latestCopy !== null &&
        (state.result.latestCopy as Record<string, unknown>).name ===
          `Blue Meridian E2E ${state.runId.slice(0, 8)}` &&
        page.locator('.wizard-step[data-step="6"]').isVisible()
      );
    },
    assert(state, initialState) {
      expect(state.result.source).toEqual(initialState.result.source);
      expect(state.result.copies).toHaveLength(1);
      expect(state.result.latestCopy).toMatchObject({
        id: `COPY-${state.runId}-0001`,
        name: `Blue Meridian E2E ${state.runId.slice(0, 8)}`,
        sourceId: 'campaign-source-01',
        status: '未生效',
        startDate: '2026-10-01',
        validUntil: '2026-12-30',
        rule: 'rule-growth',
        audience: 'all',
        benefit: 'benefit-voucher',
        frequency: 2,
        period: 'day',
        quantity: 1,
        grantMode: '实时发放',
      });
      expect(state.result.wizard).toMatchObject({
        stage: 'warning',
        sourceId: 'campaign-source-01',
        completed: [1, 2, 3, 4],
        confirmed: true,
      });
      expect(state.attempts).toHaveLength(1);
      expect(state.attempts[0]).toMatchObject({
        operation: 'clone',
        outcome: 'committed',
      });
      expect(state.events.map((event) => event.type)).toEqual([
        'wizard-opened',
        'wizard-step-completed',
        'wizard-step-completed',
        'wizard-step-completed',
        'wizard-step-completed',
        'preview-confirmed',
        'clone-created',
      ]);
      expect(
        state.events.filter((event) => event.type === 'clone-created'),
      ).toHaveLength(1);
    },
  },
  {
    scenario: 'flights',
    steps: () => [
      {
        aiInput: {
          prompt: 'Visible From flight city combobox',
          value: 'Zur',
        },
      },
      {
        jevAct: {
          goal: 'Choose the visible Zurich Airport ZRH suggestion for the From field',
          maxSteps: 6,
          maxTaskMs: 55_000,
        },
      },
      {
        aiInput: {
          prompt: 'Visible To flight city combobox',
          value: 'Lon',
        },
      },
      {
        jevAct: {
          goal: 'Choose the visible Heathrow Airport LHR suggestion for the To field, then select One-way as trip type; keep 1 adult and Economy',
          maxSteps: 10,
          maxTaskMs: 75_000,
        },
      },
      {
        jevAct: {
          goal: 'Choose 12 November 2026 as the departure date in the flight calendar',
          maxSteps: 8,
          maxTaskMs: 60_000,
        },
      },
      {
        jevAct: {
          goal: `Submit the Zurich to London one-way flight search departing ${departureDate} for 1 adult in Economy, and show available flights`,
          maxSteps: 8,
          maxTaskMs: 60_000,
        },
      },
    ],
    async verify(goal, state, page) {
      if (goal.startsWith('Choose the visible Zurich'))
        return (
          (await page.getByLabel('From', { exact: true }).inputValue()) ===
            'Zurich' &&
          (await page
            .getByLabel('From', { exact: true })
            .getAttribute('data-airport-code')) === 'ZRH'
        );
      if (goal.startsWith('Choose the visible Heathrow'))
        return (
          (await page.getByLabel('To', { exact: true }).inputValue()) ===
            'London' &&
          (await page
            .getByLabel('To', { exact: true })
            .getAttribute('data-airport-code')) === 'LHR' &&
          (await page.locator('#trip-type').inputValue()) === 'one-way' &&
          (await page.locator('input[name="adults"]').inputValue()) === '1' &&
          (await page.locator('select[name="cabin"]').inputValue()) ===
            'economy'
        );
      if (goal.startsWith('Choose 12 November 2026'))
        return (
          (await page.locator('input[name="date"]').inputValue()) ===
          departureDate
        );
      return (
        state.result.resultsVisible === true &&
        state.result.departureDate === departureDate &&
        state.result.destinationAirport === 'LHR' &&
        page.url().includes('/scenario/flights/results') &&
        (await page
          .getByRole('heading', { name: 'Available flights' })
          .isVisible())
      );
    },
    assert(state) {
      expect(state.result).toMatchObject({
        origin: 'Zurich',
        destination: 'London',
        originAirport: 'ZRH',
        destinationAirport: 'LHR',
        tripType: 'one-way',
        departureDate,
        adults: 1,
        cabin: 'economy',
        resultsVisible: true,
      });
      expect(state.events.map((event) => event.type)).toEqual([
        'flightResultsOpened',
      ]);
    },
  },
  {
    scenario: 'hotel',
    steps: () => [
      {
        aiInput: {
          prompt: 'Visible Destination hotel city combobox',
          value: 'Lis',
        },
      },
      {
        jevAct: {
          goal: 'Choose the visible Lisbon destination suggestion, select Design and Free cancellation filters, then search for Lisbon stays',
          maxSteps: 14,
          maxTaskMs: 100_000,
        },
      },
      {
        jevAct: {
          goal: 'Open the Casa Flora hotel details from the filtered Lisbon results',
          maxSteps: 8,
          maxTaskMs: 60_000,
        },
      },
    ],
    async verify(goal, state, page) {
      if (goal.startsWith('Choose the visible Lisbon'))
        return (
          state.result.city === 'Lisbon' &&
          state.result.design === true &&
          state.result.freeCancellation === true &&
          state.result.resultsVisible === true &&
          page.url().includes('/scenario/hotel/results') &&
          (await page.locator('.hotel-card').count()) === 2
        );
      return (
        state.result.openedHotelId === 'casa-flora' &&
        page.url().includes('/scenario/hotel/casa-flora') &&
        (await page
          .getByRole('heading', { name: 'Casa Flora', level: 1 })
          .isVisible())
      );
    },
    assert(state) {
      expect(state.result).toMatchObject({
        city: 'Lisbon',
        design: true,
        freeCancellation: true,
        resultsVisible: true,
        openedHotelId: 'casa-flora',
        openedHotelTitle: 'Casa Flora',
      });
      expect(state.events.map((event) => event.type)).toEqual([
        'hotelResultsOpened',
        'hotelOpened',
      ]);
    },
  },
];

function requireModelConfiguration(): void {
  const required = [
    'OPENROUTER_API_KEY',
    'MIDSCENE_MODEL_NAME',
    'MIDSCENE_MODEL_API_KEY',
    'MIDSCENE_MODEL_BASE_URL',
    'MIDSCENE_MODEL_FAMILY',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(`LIVE_MODEL_E2E_CONFIG_MISSING: ${missing.join(', ')}`);
  // Keep provider selection and credentials local to this test process.
  process.env.MIDSCENE_JEV_API_KEY = process.env.OPENROUTER_API_KEY;
  process.env.MIDSCENE_JEV_BASE_URL =
    'https://openrouter.ai/api/alpha/decisions';
  process.env.MIDSCENE_JEV_MODEL_NAME = '~typesafe/jev-latest';
}

function summarizeCase(result: CaseRunResult | undefined) {
  if (!result) return undefined;
  return {
    status: result.status,
    durationMs: result.durationMs,
    steps: result.steps.map((step) => ({
      node: step.node,
      status: step.status,
      durationMs: step.durationMs,
      summary: redact(step.output?.summary),
      data: step.node === 'jevAct' ? step.output?.data : undefined,
      error: redact(step.error?.message),
    })),
  };
}

function redact(value: string | undefined): string | undefined {
  return value?.replace(/https?:\/\/[^\s"']+/gu, '[redacted-url]');
}

requireModelConfiguration();

describe('real-model public Midscene Test composition', () => {
  let fixture: FixtureServer;
  let browser: Browser;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    browser = await chromium.launch({ headless: true });
    await mkdir(artifactDir, { recursive: true });
  });

  afterAll(async () => {
    await browser?.close();
    await fixture?.close();
  });

  for (const spec of specs) {
    it(
      spec.scenario,
      async () => {
        const runId = randomUUID();
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        let blockedRequestCount = 0;
        await context.route('**/*', (route) => {
          const url = route.request().url();
          if (url.startsWith(`${fixture.origin}/`)) return route.continue();
          blockedRequestCount += 1;
          return route.abort('blockedbyclient');
        });
        const page = await context.newPage();
        let agent: PlaywrightAgent | undefined;
        const decisions: JevObserverEvent[] = [];
        const verification: Array<Record<string, unknown>> = [];
        let result: CaseRunResult | undefined;
        let error: unknown;
        try {
          await page.goto(fixture.url(spec.scenario, runId));
          const initialState = await fixture.readState(runId);
          const activeAgent = new PlaywrightAgent(page);
          agent = activeAgent;
          const nodes = [
            ...createMidsceneNodes<Context>({
              agentClass: PlaywrightAgent,
              getAgent: ({ context }) => context.agent,
            }),
            ...createJevNodes<Context>({
              getPage: ({ context }) => context.page,
              verifyCompletion: async ({ goal, page: currentPage }) => {
                const state = await fixture.readState(runId);
                const verified = await spec.verify(goal, state, currentPage);
                verification.push({
                  goal,
                  verified,
                  stateRevision: state.revision,
                  ...(spec.scenario === 'flights'
                    ? {
                        flightForm:
                          (await currentPage.locator('form').count()) > 0
                            ? await currentPage
                                .locator('form')
                                .evaluate((form) =>
                                  Object.fromEntries(
                                    new FormData(
                                      form as HTMLFormElement,
                                    ).entries(),
                                  ),
                                )
                            : null,
                      }
                    : {}),
                });
                return verified;
              },
              observer: (event) => decisions.push(event),
            }),
          ];
          const runner = createCaseRunner<Context>({
            nodes,
            context: { page, agent: activeAgent },
          });
          result = await runner.run({
            name: `real-model ${spec.scenario}`,
            steps: spec.steps(runId),
          });
          expect(result.status, JSON.stringify(summarizeCase(result))).toBe(
            'success',
          );
          const jevSteps = result.steps.filter(
            (step) => step.node === 'jevAct',
          );
          expect(jevSteps.length).toBeGreaterThan(0);
          for (const step of jevSteps) {
            expect(step.status).toBe('success');
            expect(
              (step.output?.data as JevRunResult | undefined)
                ?.completionVerified,
            ).toBe(true);
            expect(
              (step.output?.data as JevRunResult | undefined)?.usage.calls,
            ).toBeGreaterThan(0);
          }
          spec.assert(await fixture.readState(runId), initialState);
          expect(
            blockedRequestCount,
            'Browser attempted a non-fixture request',
          ).toBe(0);
        } catch (caught) {
          if (caught instanceof CaseExecutionError) result = caught.result;
          error = caught;
          throw caught;
        } finally {
          let state: FixtureState | undefined;
          try {
            state = await fixture.readState(runId);
          } catch {
            /* navigation failed before fixture initialization */
          }
          const report = {
            scenario: spec.scenario,
            runId,
            pagePath: new URL(page.url()).pathname,
            blockedRequestCount,
            case: summarizeCase(result),
            state,
            decisions,
            verification,
            failure:
              error instanceof Error
                ? { name: error.name, message: redact(error.message) }
                : undefined,
          };
          try {
            await writeFile(
              resolve(artifactDir, `${spec.scenario}-${runId}.json`),
              `${JSON.stringify(report, null, 2)}\n`,
            );
            if (error)
              await page
                .screenshot({
                  path: resolve(artifactDir, `${spec.scenario}-${runId}.png`),
                  fullPage: true,
                })
                .catch(() => undefined);
          } finally {
            try {
              await agent?.destroy();
            } finally {
              await context.close();
            }
          }
        }
      },
      spec.scenario === 'marketing-clone' ? 7 * 60_000 : 5 * 60_000,
    );
  }
});
