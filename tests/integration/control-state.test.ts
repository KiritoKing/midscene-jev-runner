import { randomUUID } from 'node:crypto';
import { type Browser, type Page, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeAction } from '../../src/browser/execute';
import { observe } from '../../src/browser/observe';
import { createDecisionRequest } from '../../src/decision';
import { type FixtureServer, startFixtureServer } from '../fixtures/server';

describe('current control state in decision requests', () => {
  let browser: Browser;
  let page: Page;
  let fixture: FixtureServer;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  });

  afterAll(async () => {
    await browser?.close();
    await fixture?.close();
  });

  const factsFor = async (goal: string) => {
    const snapshot = await observe(page, goal);
    const request = createDecisionRequest(snapshot, goal);
    return {
      snapshot,
      request,
      facts: request.body.state.facts as Array<Record<string, unknown>>,
    };
  };
  const selectCriteria = (request: ReturnType<typeof createDecisionRequest>) =>
    Object.values(
      request.body.questions.select_target?.criteria ?? {},
    ) as Array<Record<string, unknown>>;

  it('keeps selected native fields as facts while preserving their alternative options', async () => {
    await page.goto(fixture.url('flights', randomUUID()));
    await page.locator('select[name="origin"]').selectOption('Zurich');
    await page.locator('select[name="destination"]').selectOption('London');

    const { snapshot, request, facts } = await factsFor(
      'Select Zurich as origin, London as destination, and One-way as trip type',
    );
    expect(snapshot.facts).toContainEqual(
      expect.objectContaining({ label: 'From', currentValue: 'Zurich' }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({ label: 'From', current_value: 'Zurich' }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({ label: 'To', current_value: 'London' }),
    );
    expect(
      Object.values(request.targets.SELECT ?? {}).some(
        (action) =>
          action.label === 'From → Choose origin' && action.value === '',
      ),
    ).toBe(true);
    expect(selectCriteria(request)).toContainEqual(
      expect.objectContaining({
        element: 'From → Choose origin',
        current_value: 'Zurich',
        target_value: '',
      }),
    );
    for (const criterion of selectCriteria(request)) {
      expect(criterion).not.toHaveProperty('task_alignment');
      expect(criterion).not.toHaveProperty('matched_goal_terms');
    }
    expect(
      Object.values(request.targets.CLICK ?? {}).some(
        (action) => action.label === 'Round trip',
      ),
    ).toBe(true);
    const clickCriteria = Object.values(
      request.body.questions.click_target?.criteria ?? {},
    ) as Array<Record<string, unknown>>;
    expect(
      clickCriteria.find((criterion) => criterion.element === 'Round trip'),
    ).toHaveProperty('task_alignment');
  });

  it('shows a numeric target value without claiming goal alignment from the field name', async () => {
    const longValue = 'v'.repeat(620);
    await page.setContent(`
      <main>
        <label>Adults
          <select aria-label="Adults">
            <option value="1">1 adult</option>
            <option value="2">2 adults</option>
            <option value="${longValue}">Extended choice</option>
          </select>
        </label>
        <button type="button">Continue to review</button>
      </main>`);
    const { request, facts } = await factsFor(
      'Keep 1 adult and continue to review',
    );

    expect(facts).toContainEqual(
      expect.objectContaining({ label: 'Adults', current_value: '1' }),
    );
    expect(selectCriteria(request)).toContainEqual(
      expect.objectContaining({
        element: 'Adults → 2 adults',
        current_value: '1',
        target_value: '2',
      }),
    );
    for (const criterion of selectCriteria(request)) {
      expect(criterion).not.toHaveProperty('task_alignment');
      expect(criterion).not.toHaveProperty('matched_goal_terms');
    }
    expect(
      selectCriteria(request).find(
        (criterion) => criterion.element === 'Adults → Extended choice',
      )?.target_value,
    ).toBe(longValue.slice(0, 500));
    expect(
      Object.values(request.targets.CLICK ?? {}).some(
        (action) => action.label === 'Continue to review',
      ),
    ).toBe(true);
  });

  it('retains checked and expanded controls while deduplicating a stateless action', async () => {
    await page.setContent(`
      <main>
        <label><input type="checkbox" checked> Receive updates</label>
        <button type="button" aria-expanded="false">Show details</button>
        <button type="button">Help</button>
      </main>`);
    const { request, facts } = await factsFor(
      'Turn off updates and show details',
    );

    expect(request.targets.CLICK).toBeDefined();
    expect(facts).toContainEqual(
      expect.objectContaining({ label: 'Receive updates', checked: 'true' }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({ label: 'Show details', expanded: 'false' }),
    );
    expect(facts.some((fact) => fact.label === 'Help')).toBe(false);
  });

  it('keeps empty current state and allows an enabled clearing option', async () => {
    await page.setContent(`
      <main><label>Region
        <select aria-label="Region">
          <option value="">No region</option>
          <option value="east">East</option>
          <option value="west">West</option>
        </select>
      </label></main>`);
    const region = page.getByLabel('Region');
    await region.selectOption('east');
    const selected = await factsFor('Clear the region selection');
    expect(selected.facts).toContainEqual(
      expect.objectContaining({ label: 'Region', current_value: 'east' }),
    );
    expect(
      Object.values(selected.request.targets.SELECT ?? {}).some(
        (action) =>
          action.label === 'Region → No region' && action.value === '',
      ),
    ).toBe(true);
    expect(selectCriteria(selected.request)).toContainEqual(
      expect.objectContaining({
        element: 'Region → No region',
        current_value: 'east',
        target_value: '',
      }),
    );

    const clearAction = Object.values(
      selected.request.targets.SELECT ?? {},
    ).find((action) => action.label === 'Region → No region');
    if (!clearAction) throw new Error('Missing clear selection action');
    expect(
      await executeAction(page, clearAction, new AbortController().signal),
    ).toBe(true);
    expect(await region.inputValue()).toBe('');
    const cleared = await factsFor('Choose East as the region');
    expect(cleared.facts).toContainEqual(
      expect.objectContaining({ label: 'Region', current_value: '' }),
    );
    expect(
      Object.values(cleared.request.targets.SELECT ?? {}).some(
        (action) => action.label === 'Region → East' && action.value === 'east',
      ),
    ).toBe(true);
    expect(selectCriteria(cleared.request)).toContainEqual(
      expect.objectContaining({
        element: 'Region → East',
        current_value: '',
        target_value: 'east',
      }),
    );
  });
});
