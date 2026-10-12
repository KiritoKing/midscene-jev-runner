import { type Browser, type Page, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeAction } from '../../src/browser/execute';
import { observe } from '../../src/browser/observe';
import { createDecisionRequest } from '../../src/decision';

const signal = () => new AbortController().signal;
describe('generic naming and popup safety boundaries', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });
  afterAll(async () => {
    await browser?.close();
  });

  for (const layout of ['card', 'list'] as const) {
    it(`does not borrow an adjacent ${layout} identity for an empty link`, async () => {
      const item = (title: string, id: string) =>
        layout === 'card'
          ? `<article class="card"><div><a id="${id}" href="#${id}" style="display:block;width:80px;height:40px"></a></div><h2>${title}</h2></article>`
          : `<li><section><a id="${id}" href="#${id}" style="display:block;width:80px;height:40px"></a></section><strong>${title}</strong></li>`;
      await page.setContent(
        `<main>${layout === 'list' ? '<ul>' : ''}${item('Cedar', 'cedar')}${item('Maple', 'maple')}${layout === 'list' ? '</ul>' : ''}</main>`,
      );
      const snapshot = await observe(page, 'Open Cedar');
      const maple = snapshot.actions.find((a) =>
        a.selector?.includes('#maple'),
      );
      expect(maple).toBeDefined();
      expect(maple?.label).not.toContain('Cedar');
      expect(maple?.localContext).toContain('Maple');
      if (!maple) throw new Error('Missing link');
      expect(await executeAction(page, maple, signal())).toBe(true);
      expect(new URL(page.url()).hash).toBe('#maple');
    });
  }
  it('keeps an explicit cross-group accessible name and a local ungrouped caption', async () => {
    await page.setContent(
      '<h2 id="shared">Shared command</h2><article class="card"><button aria-labelledby="shared"></button></article><div><label>Nearby caption</label><div><button id="nearby"></button></div></div>',
    );
    const snapshot = await observe(page, 'Shared command');
    expect(
      snapshot.actions.some(
        (a) => a.label === 'Shared command' && a.nameSource === 'aria',
      ),
    ).toBe(true);
    expect(snapshot.actions.some((a) => a.label === 'Nearby caption')).toBe(
      true,
    );
  });
  for (const shadow of [false, true]) {
    it(`keeps an associated nonmodal suggestion list from hiding uncovered submit (${shadow ? 'shadow' : 'light'} DOM)`, async () => {
      const html =
        '<input type="search" role="combobox" aria-controls="suggestions" value="Cedar"><button id="submit">Search</button><div id="suggestions" role="listbox"><button role="option">Cedar details</button></div>';
      await page.setContent(shadow ? '<div id="host"></div>' : html);
      if (shadow)
        await page.locator('#host').evaluate((host, content) => {
          host.attachShadow({ mode: 'open' }).innerHTML = content;
        }, html);
      await page.locator('input').focus();
      const snapshot = await observe(page, 'Search for Cedar');
      expect(snapshot.layers.find((l) => l.kind === 'listbox')?.blocking).toBe(
        false,
      );
      const submit = snapshot.actions.find((a) => a.label === 'Search');
      expect(submit).toBeDefined();
      if (!submit) throw new Error('Submit hidden by nonmodal popup');
      expect(await executeAction(page, submit, signal())).toBe(true);
      expect(await page.locator('input').inputValue()).toBe('Cedar');
    });
  }
  for (const layout of ['suggestion', 'table'] as const) {
    it(`supplies observed target scope when choosing among operation types (${layout})`, async () => {
      const navigation =
        '<nav><button>Home</button><button>Help</button><button>Settings</button><button>Contact</button></nav>';
      await page.setContent(
        navigation +
          (layout === 'suggestion'
            ? '<input role="combobox" aria-controls="options"><div id="options" role="listbox"><button role="option">Cedar station</button></div><label>Delivery<select><option>Standard</option><option>Express</option></select></label>'
            : '<table><tr><td>Cedar</td><td><button>Open</button></td></tr><tr><td>Maple</td><td><button>Open</button></td></tr></table><label>Delivery<select><option>Standard</option><option>Express</option></select></label>'),
      );
      const snapshot = await observe(page, 'Open Cedar');
      const request = createDecisionRequest(snapshot, 'Open Cedar');
      expect(request.operations.CLICK).toContain('Cedar');
      expect(request.operations.SELECT).toContain('Express');
      // The unrelated select remains legal; the model chooses, not a keyword filter.
      expect(
        Object.values(request.targets.SELECT || {}).some(
          (a) => a.value === 'Express',
        ),
      ).toBe(true);
      const selectRequest = createDecisionRequest(
        await observe(page, 'Change delivery to Express'),
        'Change delivery to Express',
      );
      expect(selectRequest.operations.SELECT).toContain('Express');
      expect(selectRequest.targets.CLICK).toBeDefined();
    });
  }
  for (const layout of ['form', 'table'] as const) {
    it(`keeps operation evidence consistent with all offered targets without lexical ranking (${layout})`, async () => {
      await page.setContent(
        `<nav><button>首页</button><button>帮助</button><button>设置</button><button>联系</button></nav>${
          layout === 'form'
            ? '<form><input aria-label="名称" value="Cedar"><button>下一步</button></form>'
            : '<table><tr><td>甲</td><td><button>打开</button></td></tr><tr><td>乙</td><td><button>打开</button></td></tr></table>'
        }<label>配送<select><option>标准</option><option>加急</option></select></label>`,
      );
      const goal =
        layout === 'form' ? 'Advance toward preview' : 'Open the second record';
      const snapshot = await observe(page, goal);
      // No English goal token appears in these Chinese control labels.
      expect(
        snapshot.actions
          .filter((a) => a.kind === 'click')
          .every((a) => a.matchedGoalTerms === 0),
      ).toBe(true);
      const request = createDecisionRequest(snapshot, goal);
      for (const [operation, candidates] of Object.entries(request.targets)) {
        const evidence = JSON.parse(
          request.operations[operation].split('Available target evidence: ')[1],
        );
        const criteria =
          request.body.questions[`${operation.toLowerCase()}_target`].criteria;
        if (!criteria) throw new Error('Missing offered target evidence');
        const targetEvidence = Object.values(criteria);
        expect(evidence).toHaveLength(targetEvidence.length);
        expect(evidence).toEqual(expect.arrayContaining(targetEvidence));
        expect(evidence).toHaveLength(Object.keys(candidates).length);
      }
      expect(request.operations.CLICK).toContain(
        layout === 'form' ? '下一步' : '打开',
      );
      // Even without lexical relevance, a different operation stays available.
      expect(request.operations.SELECT).toContain('加急');
      expect(request.targets.SELECT).toBeDefined();
    });
  }
  it('still excludes uncovered page controls behind a modal containing a combobox', async () => {
    await page.setContent(
      '<button id="background">Search</button><dialog open aria-modal="true"><input role="combobox" aria-controls="options"><div id="options" role="listbox"><button role="option">Cedar</button></div></dialog>',
    );
    const snapshot = await observe(page, 'Search');
    expect(snapshot.actions.some((a) => a.label === 'Search')).toBe(false);
    expect(snapshot.actions.some((a) => a.label === 'Cedar')).toBe(true);
  });
  it('does not offer or execute Escape when it would clear caller-owned search text', async () => {
    await page.setContent(
      '<input type="search" value="Cedar"><div role="dialog"><p>Details</p></div>',
    );
    await page.locator('input').focus();
    const snapshot = await observe(page, 'Dismiss Details');
    expect(snapshot.actions.some((a) => a.kind === 'dismiss')).toBe(false);
    expect(
      await executeAction(
        page,
        { id: 'old-dismiss', kind: 'dismiss', label: 'Dismiss' },
        signal(),
      ),
    ).toBe(false);
    expect(await page.locator('input').inputValue()).toBe('Cedar');
  });
  for (const embedded of ['shadow', 'iframe'] as const) {
    it(`refuses untargeted Escape with a focused search inside ${embedded}`, async () => {
      await page.setContent(
        embedded === 'shadow'
          ? '<div id="host"></div>'
          : '<iframe srcdoc="<input type=search value=Cedar>"></iframe>',
      );
      if (embedded === 'shadow')
        await page.locator('#host').evaluate((host) => {
          host.attachShadow({ mode: 'open' }).innerHTML =
            '<input type="search" value="Cedar">';
        });
      const input =
        embedded === 'shadow'
          ? page.locator('input')
          : page.frameLocator('iframe').locator('input');
      await input.focus();
      expect(
        await executeAction(
          page,
          { id: 'dismiss', kind: 'dismiss', label: 'Dismiss' },
          signal(),
        ),
      ).toBe(false);
      expect(await input.inputValue()).toBe('Cedar');
      // A previously focused but now blurred search must not prohibit safe keys.
      await page.evaluate(() => {
        const button = document.createElement('button');
        button.textContent = 'Focus';
        document.body.append(button);
        button.focus();
      });
      expect(
        await executeAction(
          page,
          { id: 'dismiss', kind: 'dismiss', label: 'Dismiss' },
          signal(),
        ),
      ).toBe(true);
      expect(await input.inputValue()).toBe('Cedar');
    });
  }
  it('allows Escape with a text input and an explicit close with a search input', async () => {
    await page.setContent(
      '<input value="Cedar"><div role="dialog"><p>Details</p></div>',
    );
    await page.locator('input').focus();
    let snapshot = await observe(page, 'Dismiss');
    const dismissal = snapshot.actions.find((a) => a.kind === 'dismiss');
    expect(dismissal).toBeDefined();
    if (!dismissal) throw new Error('Missing safe dismissal');
    expect(await executeAction(page, dismissal, signal())).toBe(true);
    expect(await page.locator('input').inputValue()).toBe('Cedar');
    await page.setContent(
      '<input type="search" value="Maple"><div role="dialog"><button aria-label="Close details" onclick="this.parentElement.remove()">×</button></div>',
    );
    await page.locator('input').focus();
    snapshot = await observe(page, 'Close details');
    const close = snapshot.actions.find((a) => a.kind === 'dismiss');
    expect(close).toBeDefined();
    if (!close) throw new Error('Missing explicit close');
    expect(await executeAction(page, close, signal())).toBe(true);
    expect(await page.locator('input').inputValue()).toBe('Maple');
    expect(await page.locator('[role="dialog"]').count()).toBe(0);
  });
});
