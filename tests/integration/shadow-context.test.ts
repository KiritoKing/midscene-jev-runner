import { type Browser, type Page, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { observe } from '../../src/browser/observe';

describe('visible text in composed browser trees', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('includes the current stage in an open shadow root while excluding hidden future stages', async () => {
    await page.setContent(
      '<main><h1>Workspace overview</h1><wizard-panel></wizard-panel></main>',
    );
    await page.evaluate(() => {
      const host = document.querySelector('wizard-panel');
      if (!host) throw new Error('Missing test host');
      host.attachShadow({ mode: 'open' }).innerHTML = `
        <section>
          <h2>Choose delivery method</h2>
          <p>Current selection: Courier</p>
          <button type="button">Continue</button>
          <div hidden>Payment confirmation</div>
          <div style="display:none">Dispatch complete</div>
          <div aria-hidden="true">Internal stage marker</div>
        </section>`;
    });

    const snapshot = await observe(page, 'Continue delivery setup');
    expect(snapshot.text).toContain('Workspace overview');
    expect(snapshot.text).toContain('Choose delivery method');
    expect(snapshot.text).toContain('Current selection: Courier');
    expect(snapshot.text).not.toContain('Payment confirmation');
    expect(snapshot.text).not.toContain('Dispatch complete');
    expect(snapshot.text).not.toContain('Internal stage marker');
    expect(snapshot.actions.some((action) => action.label === 'Continue')).toBe(
      true,
    );
  });

  it('reads nested shadow content and assigned slot text inside the active layer', async () => {
    await page.setContent(
      '<p>Background inventory</p><overlay-panel></overlay-panel>',
    );
    await page.evaluate(() => {
      const host = document.querySelector('overlay-panel');
      if (!host) throw new Error('Missing test host');
      host.attachShadow({ mode: 'open' }).innerHTML = `
        <section role="dialog" aria-label="Route confirmation">
          <h2>Confirm delivery route</h2>
          <route-summary>
            <span slot="selected">Selected route: Express</span>
            <span>Unslotted stale route</span>
          </route-summary>
        </section>`;
      const summary = host.shadowRoot?.querySelector('route-summary');
      if (!summary) throw new Error('Missing nested test host');
      summary.attachShadow({ mode: 'open' }).innerHTML = `
        <slot name="selected">No route selected</slot>
        <p>Ready to confirm</p>`;
    });

    const snapshot = await observe(page, 'Confirm Express route');
    expect(snapshot.text).toContain('Confirm delivery route');
    expect(snapshot.text).toContain('Selected route: Express');
    expect(snapshot.text.match(/Selected route: Express/gu)).toHaveLength(1);
    expect(snapshot.text).toContain('Ready to confirm');
    expect(snapshot.text).not.toContain('No route selected');
    expect(snapshot.text).not.toContain('Unslotted stale route');
    expect(snapshot.text).not.toContain('Background inventory');
  });

  it('keeps ordinary text and excludes text under hidden shadow hosts', async () => {
    await page.setContent(`
      <main><p>Ordinary page details</p></main>
      <hidden-panel hidden></hidden-panel>
      <concealed-panel style="display:none"></concealed-panel>`);
    await page.evaluate(() => {
      for (const [selector, content] of [
        ['hidden-panel', 'Hidden host details'],
        ['concealed-panel', 'CSS hidden host details'],
      ]) {
        const host = document.querySelector(selector);
        if (!host) throw new Error(`Missing ${selector}`);
        host.attachShadow({ mode: 'open' }).innerHTML = `<p>${content}</p>`;
      }
    });

    const snapshot = await observe(page, 'Read page details');
    expect(snapshot.text).toContain('Ordinary page details');
    expect(snapshot.text).not.toContain('Hidden host details');
    expect(snapshot.text).not.toContain('CSS hidden host details');
  });

  it('respects inherited visibility for direct shadow and slot text while allowing visible descendants', async () => {
    await page.setContent(`
      <main><p>Visible lead</p></main>
      <div style="visibility:hidden">Hidden light text <span style="visibility:visible">Restored light text</span></div>
      <direct-host style="visibility:hidden"></direct-host>
      <slot-host></slot-host>
      <fallback-host></fallback-host>`);
    await page.evaluate(() => {
      const direct = document.querySelector('direct-host');
      const slotted = document.querySelector('slot-host');
      const fallback = document.querySelector('fallback-host');
      if (!direct || !slotted || !fallback)
        throw new Error('Missing test hosts');
      direct.attachShadow({ mode: 'open' }).innerHTML =
        'Hidden direct shadow text <span style="visibility:visible">Restored shadow text</span>';
      slotted.attachShadow({ mode: 'open' }).innerHTML =
        '<slot style="visibility:hidden">Hidden slot fallback</slot>';
      slotted.append(document.createTextNode('Hidden assigned slot text'));
      fallback.attachShadow({ mode: 'open' }).innerHTML =
        '<slot>Visible slot fallback</slot>';
    });

    const snapshot = await observe(page, 'Read visible details');
    expect(snapshot.text).toContain('Visible lead');
    expect(snapshot.text).toContain('Restored light text');
    expect(snapshot.text).toContain('Restored shadow text');
    expect(snapshot.text).toContain('Visible slot fallback');
    expect(snapshot.text).not.toContain('Hidden light text');
    expect(snapshot.text).not.toContain('Hidden direct shadow text');
    expect(snapshot.text).not.toContain('Hidden assigned slot text');
    expect(snapshot.text).not.toContain('Hidden slot fallback');
  });

  it('keeps the text budget when a shadow tree contains a long passage', async () => {
    await page.setContent('<long-panel></long-panel>');
    await page.evaluate(() => {
      const host = document.querySelector('long-panel');
      if (!host) throw new Error('Missing test host');
      host.attachShadow({
        mode: 'open',
      }).innerHTML = `<p>${'A'.repeat(6000)}</p><p>Tail marker</p>`;
    });

    const snapshot = await observe(page, 'Read long passage');
    expect(snapshot.text).toHaveLength(6000);
    expect(snapshot.textTruncated).toBe(true);
    expect(snapshot.text).not.toContain('Tail marker');
  });
});
