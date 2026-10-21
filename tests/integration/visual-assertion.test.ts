import { type Browser, type Page, chromium } from 'playwright';
import sharp from 'sharp';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { evaluateJevAssertion } from '../../src/assertion';
import { prepareVisualImage } from '../../src/visual';
import { waitForJevAssertion } from '../../src/wait-for';

const answer = (truth = 0.99, evidence = 0.99) =>
  new Response(
    JSON.stringify({
      answers: {
        condition_satisfied: { type: 'noul', noul: truth },
        evidence_sufficient: { type: 'noul', noul: evidence },
      },
      usage: { input_tokens: 1, output_tokens: 2, cost: 0.001 },
    }),
  );

describe('opt-in screenshot-only assertions', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  afterAll(async () => {
    await browser?.close();
  });
  beforeEach(async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'test-secret');
    vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', 'jev-1.14.0');
    page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(
      '<input type="password" value="secret"><div id="private" style="position:absolute;left:100px;top:100px;width:100px;height:100px;background:red">PRIVATE</div><canvas></canvas>',
    );
  });
  afterEach(async () => {
    await page?.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps legacy DOM default free of screenshots, assets and image headers', async () => {
    const shot = vi.spyOn(page, 'screenshot');
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.assets).toBeUndefined();
      expect(init?.headers).not.toHaveProperty('TypeSafe-Danger-Zone-Images');
      return answer();
    }) as typeof globalThis.fetch;
    expect(
      (await evaluateJevAssertion(page, { prompt: 'A canvas exists', fetch }))
        .pass,
    ).toBe(true);
    expect(shot).not.toHaveBeenCalled();
  });

  it('uploads a referenced PNG with dual Noul, image header and no masked DOM leakage', async () => {
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(init?.headers).toHaveProperty(
        'TypeSafe-Danger-Zone-Images',
        'true',
      );
      const [reference] = Object.keys(body.assets);
      expect(reference).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.state.browser_evidence).toEqual({
        viewport_image: reference,
      });
      const bytes = Buffer.from(body.assets[reference].data_base64, 'base64');
      const pixel = await sharp(bytes)
        .extract({ left: 150, top: 150, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      expect([...pixel]).toEqual([0, 0, 0]);
      body.assets = undefined;
      expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(
        40_000,
      );
      expect(JSON.stringify(body)).not.toContain('PRIVATE');
      expect(Object.keys(body.questions)).toEqual([
        'condition_satisfied',
        'evidence_sufficient',
      ]);
      return answer(0.99, 0.2);
    }) as typeof globalThis.fetch;
    const result = await evaluateJevAssertion(page, {
      prompt: 'The canvas is red',
      visual: { maskSelectors: ['#private'] },
      fetch,
    });
    expect(result.verdict).toBe('indeterminate');
    expect(JSON.stringify(result)).not.toMatch(/base64|PRIVATE|test-secret/);
  });

  it('masks passwords and nested frame content in actual pixels', async () => {
    await page.setContent(
      `<input type="password" style="position:absolute;left:20px;top:20px;width:100px;height:60px" value="secret"><iframe style="position:absolute;left:200px;top:20px;width:300px;height:200px;border:0" srcdoc='<div id="private" style="position:absolute;left:20px;top:20px;width:100px;height:60px;background:red">private</div>'></iframe>`,
    );
    await page.frameLocator('iframe').locator('#private').waitFor();
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const image = Buffer.from(
        (Object.values(body.assets)[0] as { data_base64: string }).data_base64,
        'base64',
      );
      for (const [left, top] of [
        [50, 40],
        [250, 60],
      ]) {
        const pixel = await sharp(image)
          .extract({ left, top, width: 1, height: 1 })
          .removeAlpha()
          .raw()
          .toBuffer();
        expect([...pixel]).toEqual([0, 0, 0]);
      }
      return answer();
    }) as typeof globalThis.fetch;
    await evaluateJevAssertion(page, {
      prompt: 'Ready',
      visual: { maskSelectors: ['#private'] },
      fetch,
    });
  });

  it('fails closed on an invalid mask selector', async () => {
    const fetch = vi.fn();
    await expect(
      evaluateJevAssertion(page, {
        prompt: 'Ready',
        visual: { maskSelectors: ['['] },
        fetch,
      }),
    ).rejects.toThrow('no image was submitted');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('captures a new image and reference for every wait attempt', async () => {
    const refs: string[] = [];
    const shot = vi.spyOn(page, 'screenshot');
    const fetch = vi.fn(async (_url, init) => {
      refs.push(Object.keys(JSON.parse(String(init?.body)).assets)[0]);
      return answer(refs.length === 1 ? 0.01 : 0.99);
    }) as typeof globalThis.fetch;
    const result = await waitForJevAssertion(page, {
      prompt: 'Ready',
      visual: {},
      timeoutMs: 3000,
      checkIntervalMs: 1,
      fetch,
    });
    expect(result.pass).toBe(true);
    expect(shot).toHaveBeenCalledTimes(2);
    expect(new Set(refs).size).toBe(2);
  });

  it('rejects unsupported models before capture or transmission', async () => {
    vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', 'unknown');
    const shot = vi.spyOn(page, 'screenshot');
    const fetch = vi.fn();
    await expect(
      evaluateJevAssertion(page, { prompt: 'Ready', visual: {}, fetch }),
    ).rejects.toThrow('image-capable');
    expect(shot).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['jev-latest', 'jev-1.13.0'])(
    'accepts image-capable control %s',
    async (model) => {
      vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', model);
      expect(
        (
          await evaluateJevAssertion(page, {
            prompt: 'Ready',
            visual: {},
            fetch: vi.fn(async () => answer()),
          })
        ).pass,
      ).toBe(true);
    },
  );

  it('aborts a pending screenshot without transmitting or leaking call logs', async () => {
    vi.spyOn(page, 'screenshot').mockImplementation(
      () => new Promise(() => {}),
    );
    const controller = new AbortController();
    const fetch = vi.fn();
    const pending = evaluateJevAssertion(page, {
      prompt: 'Ready',
      visual: {},
      signal: controller.signal,
      fetch,
    });
    controller.abort(new Error('cancelled'));
    await expect(pending).rejects.toThrow('cancelled');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds a hanging visual capture by the assertion timeout', async () => {
    vi.spyOn(page, 'screenshot').mockImplementation(
      () => new Promise(() => {}),
    );
    await expect(
      evaluateJevAssertion(page, {
        prompt: 'Ready',
        visual: {},
        requestTimeoutMs: 10,
      }),
    ).rejects.toThrow('timed out');
  });

  it('redacts screenshot failures and rejects malformed images', async () => {
    vi.spyOn(page, 'screenshot').mockRejectedValue(
      new Error('secret PRIVATE selector'),
    );
    await expect(
      evaluateJevAssertion(page, { prompt: 'Ready', visual: {} }),
    ).rejects.toThrow('capture failed; no image');
    await expect(
      prepareVisualImage(Buffer.from('not an image')),
    ).rejects.toThrow('valid still PNG/JPEG');
    await expect(
      prepareVisualImage(Buffer.alloc(16 * 1024 * 1024 + 1)),
    ).rejects.toThrow('16 MiB');
  });

  it('normalizes differently shaped images without stretching and pads small sides', async () => {
    for (const [width, height] of [
      [2000, 100],
      [100, 2000],
      [300, 400],
    ]) {
      const input = await sharp({
        create: { width, height, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer();
      const metadata = await sharp(await prepareVisualImage(input)).metadata();
      expect(metadata.width).toBeGreaterThanOrEqual(280);
      expect(metadata.height).toBeGreaterThanOrEqual(280);
      expect(metadata.width).toBeLessThanOrEqual(1568);
      expect(metadata.height).toBeLessThanOrEqual(1568);
    }
  });
});
