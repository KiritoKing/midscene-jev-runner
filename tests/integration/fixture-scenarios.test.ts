import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeAction } from '../../src/browser/execute';
import { observe } from '../../src/browser/observe';
import { createDecisionRequest } from '../../src/decision';
import type { BrowserAction, BrowserSnapshot } from '../../src/internal-types';
import {
  type FixtureScenario,
  type FixtureServer,
  startFixtureServer,
} from '../fixtures/server';

const source = {
  id: 'campaign-source-01',
  name: 'Blue Meridian',
  status: 'active',
  budget: 12500,
  channel: 'Web',
  objective: 'Awareness',
};

describe('production pipeline against independent HTTP fixtures', () => {
  let browser: Browser;
  let fixture: FixtureServer;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    await fixture?.close();
  });

  const withScenario = async (
    scenario: FixtureScenario,
    run: (page: Page, runId: string, blocked: string[]) => Promise<void>,
    fault?: string,
  ) => {
    const runId = randomUUID();
    const context = await browser.newContext({
      viewport: { width: 1360, height: 900 },
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
  };

  const offer = async (
    page: Page,
    goal: string,
    operation: 'CLICK' | 'SELECT',
    match: (action: BrowserAction) => boolean,
  ): Promise<{ action: BrowserAction; snapshot: BrowserSnapshot }> => {
    const snapshot = await observe(page, goal);
    const request = createDecisionRequest(snapshot, goal);
    const action = Object.values(request.targets[operation] ?? {}).find(match);
    if (!action)
      throw new Error(
        `Production observation did not offer ${operation} for ${goal}: ${Object.values(
          request.targets[operation] ?? {},
        )
          .map((candidate) => candidate.label)
          .join(', ')}`,
      );
    return { action, snapshot };
  };

  const act = async (
    page: Page,
    goal: string,
    operation: 'CLICK' | 'SELECT',
    match: (action: BrowserAction) => boolean,
  ): Promise<BrowserSnapshot> => {
    const { action, snapshot } = await offer(page, goal, operation, match);
    expect(
      await executeAction(page, action, new AbortController().signal),
    ).toBe(true);
    return snapshot;
  };

  const click = (page: Page, goal: string, label: string) =>
    act(page, goal, 'CLICK', (action) => action.label === label);

  const openCloneWizard = async (page: Page) => {
    await click(page, 'Open Campaigns section', 'Campaigns');
    await page.getByText('Blue Meridian', { exact: true }).waitFor();
    await click(page, 'Open Blue Meridian campaign', 'Open campaign');
    await page
      .getByText('Campaign ID: campaign-source-01', { exact: false })
      .waitFor();
    await click(page, 'Open more campaign actions', 'More actions');
    await click(page, 'Duplicate Blue Meridian campaign', 'Duplicate campaign');
    await page.getByLabel('New campaign name').waitFor();
  };

  const prepareCloneReview = async (page: Page, name: string) => {
    await openCloneWizard(page);
    const base = await observe(page, 'Enter a new campaign name');
    expect(base.text).toContain('Basic information');
    expect(base.text).toContain('New campaign name');
    expect(base.text).not.toContain('Use source settings');
    expect(base.text).not.toContain('New draft, source preserved');
    expect(await page.getByLabel('Use source settings').isVisible()).toBe(
      false,
    );
    expect(
      base.actions.some(
        (action) => action.label === 'Continue to configuration',
      ),
    ).toBe(true);
    expect(base.actions.some((action) => action.label === 'Review copy')).toBe(
      false,
    );
    expect(
      base.actions.some((action) => action.label === 'Create draft copy'),
    ).toBe(false);

    // The caller supplies text; jevAct only handles the non-text transitions.
    await page.getByLabel('New campaign name').fill(name);
    await click(page, 'Continue to configuration', 'Continue to configuration');
    const config = await observe(page, 'Review copied source settings');
    expect(config.text).toContain('Budget: 12500');
    expect(config.text).toContain('Use source settings');
    expect(config.text).not.toContain('New campaign:');
    expect(config.text).not.toContain('New draft, source preserved');
    expect(await page.getByLabel('Use source settings').isVisible()).toBe(true);
    expect(
      config.actions.some((action) => action.label === 'Review copy'),
    ).toBe(true);
    expect(
      config.actions.some(
        (action) => action.label === 'Continue to configuration',
      ),
    ).toBe(false);
    expect(
      config.actions.some((action) => action.label === 'Create draft copy'),
    ).toBe(false);

    await click(page, 'Review the draft copy', 'Review copy');
    const review = await observe(page, 'Create draft copy');
    expect(review.text).toContain(`New campaign: ${name}`);
    expect(review.text).toContain('New draft, source preserved');
    expect(review.text).not.toContain('Use source settings');
    expect(await page.getByLabel('Use source settings').isVisible()).toBe(
      false,
    );
    expect(
      review.actions.some((action) => action.label === 'Create draft copy'),
    ).toBe(true);
    expect(
      review.actions.some((action) => action.label === 'Review copy'),
    ).toBe(false);
  };

  it('creates one marketing draft after three visible wizard stages and preserves the source', async () => {
    await withScenario('marketing-clone', async (page, runId) => {
      const name = `Blue Meridian copy ${runId.slice(0, 8)}`;
      await prepareCloneReview(page, name);
      await click(page, 'Create the reviewed draft copy', 'Create draft copy');
      const state = await fixture.readState(runId);
      const copy = {
        id: `campaign-copy-${runId}-001`,
        name,
        sourceId: source.id,
        status: 'draft',
        budget: source.budget,
        channel: source.channel,
        objective: source.objective,
      };
      expect(state.result.source).toEqual(source);
      expect(state.result.copies).toEqual([copy]);
      expect(state.result.latestCopy).toEqual(copy);
      expect(state.attempts).toEqual([
        expect.objectContaining({ operation: 'clone', outcome: 'committed' }),
      ]);
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
    });
  }, 15_000);

  it('rejects out-of-order clone operations with 409 and keeps the wizard closed', async () => {
    await withScenario('marketing-clone', async (page, runId) => {
      const result = await page.request.post(
        `${fixture.origin}/api/marketing/${runId}/open-clone`,
        { data: { sourceId: source.id } },
      );
      expect(result.status()).toBe(409);
      const state = await fixture.readState(runId);
      expect(state.events).toEqual([]);
      expect(state.result.source).toEqual(source);
      expect(state.result.wizard).toMatchObject({ stage: 'closed' });
      expect(state.result.copies).toEqual([]);
      expect(state.attempts).toEqual([]);
    });
  });

  it('reconciles a committed clone with a 503 response without replaying the submission', async () => {
    await withScenario(
      'marketing-clone',
      async (page, runId) => {
        const name = `Response-lost copy ${runId.slice(0, 8)}`;
        await prepareCloneReview(page, name);
        await click(
          page,
          'Create the reviewed draft copy',
          'Create draft copy',
        );
        expect(await page.getByRole('status').textContent()).toContain(
          'Response unavailable after commit',
        );
        const state = await fixture.readState(runId);
        expect(state.result.source).toEqual(source);
        expect(state.result.copies).toEqual([
          expect.objectContaining({
            name,
            sourceId: source.id,
            budget: source.budget,
            channel: source.channel,
            objective: source.objective,
          }),
        ]);
        expect(state.attempts).toEqual([
          expect.objectContaining({ operation: 'clone', outcome: 'committed' }),
        ]);
        expect(
          state.events.filter((event) => event.type === 'cloneCreated'),
        ).toHaveLength(1);
      },
      'clone-commit-503',
    );
  }, 15_000);

  it('opens an encyclopedia article through actual search and document navigation', async () => {
    await withScenario('encyclopedia', async (page, runId) => {
      await page
        .getByLabel('Search articles')
        .fill('Gödel incompleteness theorems');
      await click(page, 'Search the atlas for Gödel incompleteness', 'Search');
      expect(page.url()).toContain('/scenario/encyclopedia/results');
      const result = await fixture.readState(runId);
      expect(result.result.query).toBe('Gödel incompleteness theorems');
      await click(
        page,
        'Open Gödel incompleteness theorems article',
        'Gödel incompleteness theorems',
      );
      expect(page.url()).toContain(
        '/scenario/encyclopedia/article/godel-incompleteness',
      );
      const state = await fixture.readState(runId);
      expect(state.result).toEqual({
        query: 'Gödel incompleteness theorems',
        articleId: 'godel-incompleteness',
        articleTitle: 'Gödel incompleteness theorems',
        navigated: true,
      });
      expect(state.events.map((event) => event.type)).toEqual([
        'searchSubmitted',
        'articleOpened',
      ]);
    });
  }, 10_000);

  it('submits a one-way flight search from selected controls and reads back server criteria', async () => {
    await withScenario('flights', async (page, runId) => {
      await act(
        page,
        'Choose Zurich origin',
        'SELECT',
        (action) => action.value === 'Zurich',
      );
      await act(
        page,
        'Choose London destination',
        'SELECT',
        (action) => action.value === 'London',
      );
      await click(page, 'Choose a one-way trip', 'Round trip');
      await click(page, 'Choose a one-way trip', 'One-way');
      await click(
        page,
        'Choose 12 November 2026 departure date',
        'Choose departure date',
      );
      await click(
        page,
        'Choose 12 November 2026 departure date',
        '12 November 2026',
      );
      expect(await page.locator('input[name="date"]').inputValue()).toBe(
        '2026-11-12',
      );
      await click(page, 'Search Zurich to London flights', 'Search flights');
      const state = await fixture.readState(runId);
      expect(state.result).toEqual({
        origin: 'Zurich',
        destination: 'London',
        tripType: 'one-way',
        departureDate: '2026-11-12',
        adults: 1,
        cabin: 'economy',
        resultsVisible: true,
      });
      expect(state.events.map((event) => event.type)).toEqual([
        'flightResultsOpened',
      ]);
      expect(page.url()).toContain('/scenario/flights/results');
    });
  }, 10_000);

  it('filters Lisbon stays and opens the selected hotel through real navigation', async () => {
    await withScenario('hotel', async (page, runId) => {
      await page.getByLabel('Destination').fill('Lisbon');
      await click(page, 'Select Design stays', 'Design');
      await click(page, 'Select Free cancellation', 'Free cancellation');
      await click(page, 'Search matching stays', 'Search stays');
      expect(page.url()).toContain('/scenario/hotel/results');
      await click(page, 'Open Casa Flora hotel details', 'Casa Flora');
      expect(page.url()).toContain('/scenario/hotel/casa-flora');
      const state = await fixture.readState(runId);
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
    });
  }, 10_000);

  it('isolates independent runs and rejects browser requests outside the local fixture origin', async () => {
    await withScenario('marketing-clone', async (page, runId, blocked) => {
      const secondId = randomUUID();
      const second = await page.context().newPage();
      try {
        await second.goto(fixture.url('marketing-clone', secondId));
        await click(page, 'Open Campaigns section', 'Campaigns');
        await page.getByText('Blue Meridian', { exact: true }).waitFor();
        const first = await fixture.readState(runId);
        const isolated = await fixture.readState(secondId);
        expect(
          first.events.some((event) => event.type === 'campaignsOpened'),
        ).toBe(true);
        expect(isolated.events).toEqual([]);
        expect(first.result.source).toEqual(source);
        expect(isolated.result.source).toEqual(source);
        expect(isolated.result.copies).toEqual([]);

        const probe = await page.context().newPage();
        try {
          await expect(
            probe.goto('https://external.invalid/probe'),
          ).rejects.toThrow();
          expect(blocked).toEqual(['https://external.invalid/probe']);
        } finally {
          await probe.close();
        }
      } finally {
        await second.close();
      }
      // The deliberate probe is the only allowed blocked request in this test.
      blocked.length = 0;
    });
  }, 10_000);
});
