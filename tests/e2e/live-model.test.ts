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
  assert(state: FixtureState): void;
}

const specs: ScenarioSpec[] = [
  {
    scenario: 'encyclopedia',
    steps: () => [
      {
        aiInput: {
          prompt: 'Search articles input',
          value: 'Gödel incompleteness theorems',
        },
      },
      {
        jevAct: {
          goal: 'Submit the encyclopedia search for Gödel incompleteness theorems and reach its search results',
          maxSteps: 8,
          maxTaskMs: 60_000,
        },
      },
      {
        jevAct: {
          goal: 'Open the Gödel incompleteness theorems article from the search results',
          maxSteps: 8,
          maxTaskMs: 60_000,
        },
      },
    ],
    async verify(goal, state) {
      if (goal.startsWith('Submit the encyclopedia search'))
        return state.result.query === 'Gödel incompleteness theorems';
      return (
        state.result.navigated === true &&
        state.result.articleId === 'godel-incompleteness'
      );
    },
    assert(state) {
      expect(state.result).toMatchObject({
        query: 'Gödel incompleteness theorems',
        articleId: 'godel-incompleteness',
        articleTitle: 'Gödel incompleteness theorems',
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
          goal: 'In the campaign workspace, open the Blue Meridian source campaign and its duplicate campaign dialog',
          maxSteps: 16,
          maxTaskMs: 100_000,
        },
      },
      {
        aiInput: {
          prompt:
            'The visible New campaign name input in the Duplicate campaign Basic information section',
          value: `Blue Meridian E2E ${runId.slice(0, 8)}`,
          options: { deepLocate: true },
        },
      },
      {
        jevAct: {
          goal: `Complete the duplicate campaign wizard: continue through configuration, keep Use source settings selected, review the copy, and create exactly one draft named Blue Meridian E2E ${runId.slice(0, 8)} from Blue Meridian`,
          maxSteps: 12,
          maxTaskMs: 80_000,
        },
      },
    ],
    async verify(goal, state, page) {
      if (goal.startsWith('In the campaign workspace'))
        return (
          state.events.some((event) => event.type === 'cloneDialogOpened') &&
          page.getByLabel('New campaign name').isVisible()
        );
      return (
        state.result.latestCopy !== null &&
        (state.result.latestCopy as Record<string, unknown>).name ===
          `Blue Meridian E2E ${state.runId.slice(0, 8)}`
      );
    },
    assert(state) {
      const copy = {
        id: `campaign-copy-${state.runId}-001`,
        name: `Blue Meridian E2E ${state.runId.slice(0, 8)}`,
        sourceId: 'campaign-source-01',
        status: 'draft',
        budget: 12500,
        channel: 'Web',
        objective: 'Awareness',
      };
      expect(state.result.source).toEqual({
        id: 'campaign-source-01',
        name: 'Blue Meridian',
        status: 'active',
        budget: 12500,
        channel: 'Web',
        objective: 'Awareness',
      });
      expect(state.result.copies).toEqual([copy]);
      expect(state.result.latestCopy).toEqual(copy);
      expect(state.result.wizard).toMatchObject({
        stage: 'completed',
        sourceId: 'campaign-source-01',
        name: copy.name,
        useSourceSettings: true,
      });
      expect(state.attempts).toHaveLength(1);
      expect(state.attempts[0]).toMatchObject({
        operation: 'clone',
        outcome: 'committed',
      });
      expect(state.events.map((event) => event.type)).toEqual([
        'campaignsOpened',
        'catalogLoaded',
        'sourceSelected',
        'sourceDetailLoaded',
        'cloneDialogOpened',
        'baseCompleted',
        'configurationCompleted',
        'cloneCreated',
      ]);
      expect(
        state.events.filter((event) => event.type === 'cloneCreated'),
      ).toHaveLength(1);
    },
  },
  {
    scenario: 'flights',
    steps: () => [
      {
        jevAct: {
          goal: 'On the flight search form select Zurich as origin, London as destination, and One-way as trip type; keep 1 adult and Economy',
          maxSteps: 12,
          maxTaskMs: 80_000,
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
      if (goal.startsWith('On the flight search form'))
        return (
          (await page.getByLabel('From').inputValue()) === 'Zurich' &&
          (await page.getByLabel('To').inputValue()) === 'London' &&
          (await page.locator('#trip-type').inputValue()) === 'one-way' &&
          (await page.getByLabel('Adults').inputValue()) === '1' &&
          (await page.getByLabel('Cabin').inputValue()) === 'economy'
        );
      if (goal.startsWith('Choose 12 November 2026'))
        return (
          (await page.locator('input[name="date"]').inputValue()) ===
          departureDate
        );
      return (
        state.result.resultsVisible === true &&
        state.result.departureDate === departureDate
      );
    },
    assert(state) {
      expect(state.result).toEqual({
        origin: 'Zurich',
        destination: 'London',
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
      { aiInput: { prompt: 'Destination input', value: 'Lisbon' } },
      {
        jevAct: {
          goal: 'Select Design and Free cancellation filters, then search for Lisbon stays',
          maxSteps: 12,
          maxTaskMs: 80_000,
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
    async verify(goal, state) {
      if (goal.startsWith('Select Design'))
        return (
          state.result.city === 'Lisbon' &&
          state.result.design === true &&
          state.result.freeCancellation === true &&
          state.result.resultsVisible === true
        );
      return state.result.openedHotelId === 'casa-flora';
    },
    assert(state) {
      expect(state.result).toEqual({
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
          spec.assert(await fixture.readState(runId));
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
      4 * 60_000,
    );
  }
});
