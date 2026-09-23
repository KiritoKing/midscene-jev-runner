import { type Browser, type Page, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { observe } from '../../src/browser/observe';
import { createDecisionRequest } from '../../src/decision';

describe('decision facts reflect visible browser state', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('keeps hidden future controls out of model facts in an open shadow root', async () => {
    await page.setContent('<main><task-panel></task-panel></main>');
    await page.evaluate(() => {
      const host = document.querySelector('task-panel');
      if (!host) throw new Error('Missing test host');
      host.attachShadow({ mode: 'open' }).innerHTML = `
        <div class="card">
          <span>Current item: Cedar</span>
          <button type="button">More actions</button>
          <div hidden>
            <button type="button">Approve pending item</button>
            <input aria-label="Future approval code">
          </div>
          <script>window.futureStep = 'Approve pending item'</script>
        </div>`;
    });

    const snapshot = await observe(page, 'Approve Cedar pending item');
    const request = createDecisionRequest(
      snapshot,
      'Approve Cedar pending item',
    );
    const facts = request.body.state.facts as Array<Record<string, unknown>>;
    const clickTargets = Object.values(request.targets.CLICK ?? {});
    const more = clickTargets.find((action) => action.label === 'More actions');

    expect(more).toBeDefined();
    expect(snapshot.facts).toContainEqual(
      expect.objectContaining({
        label: 'Approve pending item',
        visible: false,
      }),
    );
    expect(facts.some((fact) => fact.label === 'Approve pending item')).toBe(
      false,
    );
    expect(facts.some((fact) => fact.label === 'Future approval code')).toBe(
      false,
    );
    expect(more?.localContext).toContain('Current item: Cedar');
    expect(more?.localContext).not.toContain('Approve pending item');
    expect(more?.localContext).not.toContain('futureStep');
  });

  it('excludes CSS-hidden and aria-hidden controls but retains a visible disabled control as context', async () => {
    await page.setContent(`
      <main>
        <div class="card">
          <span>Current request: Maple</span>
          <button type="button">Open options</button>
          <button type="button" disabled>Retry request</button>
          <div style="display:none"><button type="button">Submit hidden request</button></div>
          <div aria-hidden="true"><button type="button">Confirm hidden request</button></div>
          <script>window.futureState = 'Submit hidden request'</script>
        </div>
      </main>`);

    const snapshot = await observe(page, 'Submit Maple request');
    const request = createDecisionRequest(snapshot, 'Submit Maple request');
    const facts = request.body.state.facts as Array<Record<string, unknown>>;
    const open = Object.values(request.targets.CLICK ?? {}).find(
      (action) => action.label === 'Open options',
    );

    expect(snapshot.facts).toContainEqual(
      expect.objectContaining({
        label: 'Submit hidden request',
        visible: false,
      }),
    );
    expect(snapshot.facts).toContainEqual(
      expect.objectContaining({
        label: 'Retry request',
        visible: true,
        disabled: true,
      }),
    );
    expect(facts.some((fact) => fact.label === 'Submit hidden request')).toBe(
      false,
    );
    expect(facts.some((fact) => fact.label === 'Confirm hidden request')).toBe(
      false,
    );
    expect(facts).toContainEqual(
      expect.objectContaining({
        label: 'Retry request',
        actionable: false,
        visible: true,
      }),
    );
    expect(open?.localContext).toContain('Current request: Maple');
    expect(open?.localContext).not.toContain('Submit hidden request');
    expect(open?.localContext).not.toContain('futureState');
  });
});
