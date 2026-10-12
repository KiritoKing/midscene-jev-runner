import { randomUUID } from 'node:crypto';
import { type Browser, type Page, chromium } from 'playwright';
import { expect as pwExpect } from 'playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeAction } from '../../src/browser/execute';
import { observe } from '../../src/browser/observe';
import { createDecisionRequest } from '../../src/decision';
import {
  type FixtureScenario,
  type FixtureServer,
  startFixtureServer,
} from '../fixtures/server';

describe('travel fixture in real Chromium', () => {
  let browser: Browser;
  let server: FixtureServer;
  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch({ headless: true });
  });
  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  async function withPage(
    scenario: FixtureScenario,
    run: (page: Page, runId: string) => Promise<void>,
  ) {
    const runId = randomUUID();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const blocked: string[] = [];
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (url.startsWith(`${server.origin}/`)) await route.continue();
      else {
        blocked.push(url);
        await route.abort();
      }
    });
    const page = await context.newPage();
    try {
      await page.goto(server.url(scenario, runId));
      await run(page, runId);
      expect(blocked).toEqual([]);
    } finally {
      await context.close();
    }
  }

  async function selectAirport(
    page: Page,
    field: 'From' | 'To',
    text: string,
    code: string,
  ) {
    const input = page.getByLabel(field, { exact: true });
    await input.fill(text);
    const options =
      field === 'From' ? '#origin-options' : '#destination-options';
    await page
      .locator(`${options} .airport-option`)
      .filter({ hasText: code })
      .click();
    await pwExpect(input).toHaveAttribute('data-airport-code', code);
  }

  it('selects exact airport suggestions, calendar date and priced flights, then sorts them', async () => {
    await withPage('flights', async (page, runId) => {
      const from = page.getByLabel('From', { exact: true });
      await from.fill('Zur');
      await pwExpect(
        page.locator('#origin-options .airport-option').filter({
          hasText: 'ZRH',
        }),
      ).toBeVisible();
      const goal = 'Choose Zurich Airport ZRH for the From field';
      const snapshot = await observe(page, goal);
      const decision = createDecisionRequest(snapshot, goal);
      const candidate = Object.values(decision.targets.CLICK ?? {}).find(
        (action) =>
          action.label.includes('Zurich') && action.label.includes('ZRH'),
      );
      expect(candidate).toBeDefined();
      if (!candidate) throw new Error('Observed Zurich airport action missing');
      expect(
        snapshot.facts.some(
          (fact) => fact.label === 'From' && fact.currentValue === 'Zur',
        ),
      ).toBe(true);
      expect(
        await executeAction(page, candidate, new AbortController().signal),
      ).toBe(true);
      await pwExpect(from).toHaveValue('Zurich');
      await pwExpect(from).toHaveAttribute('data-airport-code', 'ZRH');
      await selectAirport(page, 'To', 'Lon', 'LHR');
      await page.getByRole('button', { name: 'Round trip' }).click();
      await page.getByRole('button', { name: 'One-way' }).click();
      await page.getByRole('button', { name: 'Choose departure date' }).click();
      await page.getByRole('button', { name: '12 November 2026' }).click();
      await pwExpect(page.locator('input[name="date"]')).toHaveValue(
        '2026-11-12',
      );
      await page.getByRole('button', { name: 'Search flights' }).click();
      await page.waitForURL('**/scenario/flights/results?*');
      await pwExpect(page.locator('.flight-card')).toHaveCount(5);
      await pwExpect(
        page.getByRole('heading', { name: 'Available flights' }),
      ).toBeVisible();
      const state = await server.readState(runId);
      expect(state.result).toMatchObject({
        origin: 'Zurich',
        destination: 'London',
        originAirport: 'ZRH',
        destinationAirport: 'LHR',
        tripType: 'one-way',
        departureDate: '2026-11-12',
        adults: 1,
        cabin: 'economy',
        resultsVisible: true,
      });
      expect(state.events.map((event) => event.type)).toEqual([
        'flightResultsOpened',
      ]);
      await page.getByRole('tab', { name: /Cheapest/ }).click();
      await pwExpect(page.getByLabel('Sort flights')).toHaveValue('price');
      expect((await server.readState(runId)).result.sort).toBe('price');
    });
  }, 20_000);

  it('renders a legitimate empty Paris to London result instead of a fixed Zurich answer', async () => {
    await withPage('flights', async (page, runId) => {
      await selectAirport(page, 'From', 'Par', 'CDG');
      await selectAirport(page, 'To', 'Lon', 'LHR');
      await page.getByRole('button', { name: 'Round trip' }).click();
      await page.getByRole('button', { name: 'One-way' }).click();
      await page.getByRole('button', { name: 'Choose departure date' }).click();
      await page.getByRole('button', { name: '12 November 2026' }).click();
      await page.getByRole('button', { name: 'Search flights' }).click();
      await page.waitForURL('**/scenario/flights/results?*');
      await pwExpect(page.locator('.flight-card')).toHaveCount(0);
      await pwExpect(
        page.getByText('No flights match this route or these filters', {
          exact: false,
        }),
      ).toBeVisible();
      expect((await server.readState(runId)).result).toMatchObject({
        origin: 'Paris',
        originAirport: 'CDG',
        destination: 'London',
        destinationAirport: 'LHR',
        resultsVisible: true,
      });
    });
  }, 20_000);

  it('accepts the native date variant and rejects an invalid direct search', async () => {
    await withPage('flights-native-date', async (page, runId) => {
      const api = `${server.origin}/api/travel/${runId}`;
      const invalid = await page.request.post(`${api}/flights/search`, {
        data: {
          origin: 'Zurich',
          destination: 'London',
          tripType: 'one-way',
          departureDate: 'bad-date',
          adults: 1,
          cabin: 'economy',
        },
      });
      expect(invalid.status()).toBe(400);
      expect((await server.readState(runId)).events).toEqual([]);
      await selectAirport(page, 'From', 'Zur', 'ZRH');
      await selectAirport(page, 'To', 'Lon', 'LHR');
      await page.getByRole('button', { name: 'Round trip' }).click();
      await page.getByRole('button', { name: 'One-way' }).click();
      await page.getByLabel('Departure date').fill('2026-11-12');
      await page.getByRole('button', { name: 'Search flights' }).click();
      await page.waitForURL('**/scenario/flights-native-date/results?*');
      await pwExpect(page.locator('.flight-card')).toHaveCount(5);
      expect((await server.readState(runId)).result).toMatchObject({
        departureDate: '2026-11-12',
        destinationAirport: 'LHR',
        resultsVisible: true,
      });
    });
  }, 40_000);

  it('combines destination suggestion and filters, opens a photo-rich hotel, and preserves criteria', async () => {
    await withPage('hotel', async (page, runId) => {
      await pwExpect(page.locator('.hotel-hero img')).toBeVisible();
      expect(
        await page
          .locator('.hotel-hero img')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      await page.getByLabel('Destination').fill('Lis');
      await page
        .locator('#city-options button')
        .filter({ hasText: 'Lisbon' })
        .click();
      await page.getByLabel('Design', { exact: true }).check();
      await page.getByLabel('Free cancellation', { exact: true }).check();
      await page.getByRole('button', { name: 'Search stays' }).click();
      await page.waitForURL('**/scenario/hotel/results?*');
      await pwExpect(page.locator('.hotel-card')).toHaveCount(2);
      expect(
        await page
          .locator('.hotel-card img')
          .first()
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      await page.locator('.hotel-card h3 a', { hasText: 'Casa Flora' }).click();
      await page.waitForURL('**/scenario/hotel/casa-flora?*');
      await pwExpect(
        page.getByRole('heading', { name: 'Casa Flora', level: 1 }),
      ).toBeVisible();
      await pwExpect(page.locator('#room-rates .room-card')).toHaveCount(2);
      await page.getByRole('button', { name: 'Open photo gallery' }).click();
      await pwExpect(page.locator('#photo-modal')).toBeVisible();
      await page.getByRole('button', { name: 'Close gallery' }).click();
      const state = await server.readState(runId);
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
      await page.getByRole('link', { name: 'Back to Lisbon results' }).click();
      await pwExpect(page.getByLabel('Design', { exact: true })).toBeChecked();
    });
  }, 20_000);

  it('rejects an early hotel detail and unsupported search without creating a result', async () => {
    await withPage('hotel', async (page, runId) => {
      expect(
        (
          await page.request.get(
            `${server.origin}/scenario/hotel/casa-flora?runId=${runId}`,
          )
        ).status(),
      ).toBe(404);
      const bad = await page.request.post(
        `${server.origin}/api/travel/${runId}/hotels/search`,
        {
          data: {
            city: 'Lisbon',
            checkIn: '2026-11-15',
            checkOut: '2026-11-12',
            adults: 2,
            rooms: 1,
            design: true,
            freeCancellation: true,
          },
        },
      );
      expect(bad.status()).toBe(400);
      expect((await server.readState(runId)).events).toEqual([]);
    });
  });
});
