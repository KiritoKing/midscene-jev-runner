import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createOfficialVisualModelConfig } from '../../example/official-visual-profile';
import { evaluateJevAssertion } from '../../src/assertion';
import { prepareVisualImage } from '../../src/visual';

vi.mock('@midscene/web/playwright', () => ({ PlaywrightAgent: class {} }));

const png = await sharp({
  create: { width: 320, height: 320, channels: 3, background: 'blue' },
})
  .png()
  .toBuffer();
const fakePage = () =>
  ({
    screenshot: vi.fn(async () => png),
    frames: () => [
      { locator: (s: string) => s },
      { locator: (s: string) => `frame:${s}` },
    ],
  }) as unknown as Page;
const ok = () =>
  new Response(
    JSON.stringify({
      answers: {
        condition_satisfied: { type: 'noul', noul: 0.99 },
        evidence_sufficient: { type: 'noul', noul: 0.99 },
      },
    }),
  );
beforeEach(() => {
  vi.stubEnv('MIDSCENE_JEV_API_KEY', 'TEST_SECRET');
  vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', 'jev-1.14.0');
  vi.stubEnv('MIDSCENE_JEV_BASE_URL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

it('uses TypeSafe asset references and masks all frames without image output', async () => {
  const page = fakePage();
  const fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const ref = body.state.browser_evidence.viewport_image;
    expect(body.assets[ref]).toMatchObject({ format: 'png', type: 'image' });
    expect(Object.keys(body.assets)).toEqual([ref]);
    expect(init?.headers).toHaveProperty('TypeSafe-Danger-Zone-Images', 'true');
    expect(body.questions).toHaveProperty('evidence_sufficient.type', 'noul');
    return ok();
  }) as typeof globalThis.fetch;
  const result = await evaluateJevAssertion(page, {
    prompt: 'Blue square',
    visual: { maskSelectors: ['#private'] },
    fetch,
  });
  expect(page.screenshot).toHaveBeenCalledWith(
    expect.objectContaining({
      mask: [
        'input[type="password"]',
        '#private',
        'frame:input[type="password"]',
        'frame:#private',
      ],
    }),
  );
  expect(result.pass).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/TEST_SECRET|base64|assets/);
});

it('uses explicitly selected OpenRouter top-level image state and no TypeSafe assets/header', async () => {
  vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', 'cloudflare/clef');
  const fetch = vi.fn(async (url, init) => {
    expect(url).toBe('https://openrouter.ai/api/alpha/decisions');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('cloudflare/clef');
    expect(body.assets).toBeUndefined();
    expect(body.state[0]).toContain('Blue square');
    expect(body.state[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(init?.headers).not.toHaveProperty('TypeSafe-Danger-Zone-Images');
    return ok();
  }) as typeof globalThis.fetch;
  expect(
    (
      await evaluateJevAssertion(fakePage(), {
        prompt: 'Blue square',
        visual: { transport: 'openrouter' },
        fetch,
      })
    ).pass,
  ).toBe(true);
});

it('does not infer OpenRouter protocol from a URL or accept unknown models', async () => {
  vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', 'cloudflare/clef');
  vi.stubEnv(
    'MIDSCENE_JEV_BASE_URL',
    'https://openrouter.ai/api/alpha/decisions',
  );
  const page = fakePage();
  const fetch = vi.fn();
  await expect(
    evaluateJevAssertion(page, { prompt: 'Blue square', visual: {}, fetch }),
  ).rejects.toThrow('image-capable');
  expect(page.screenshot).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('bounds uncooperative fetch and preserves cancellation', async () => {
  const fetch = vi.fn(() => new Promise<Response>(() => {}));
  await expect(
    evaluateJevAssertion(fakePage(), {
      prompt: 'Blue square',
      visual: {},
      fetch,
      requestTimeoutMs: 50,
    }),
  ).rejects.toThrow('timed out');
  const controller = new AbortController();
  const pending = evaluateJevAssertion(fakePage(), {
    prompt: 'Blue square',
    visual: {},
    fetch,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(new Error('cancelled')), 50);
  await expect(pending).rejects.toThrow('cancelled');
});

it('fails closed on mask/capture errors without sending secrets', async () => {
  const page = fakePage();
  vi.mocked(page.screenshot).mockRejectedValue(new Error('TEST_SECRET'));
  const fetch = vi.fn();
  await expect(
    evaluateJevAssertion(page, { prompt: 'Blue square', visual: {}, fetch }),
  ).rejects.toThrow('no image was submitted');
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects invalid, animated and oversized image inputs', async () => {
  await expect(prepareVisualImage(Buffer.from('bad'))).rejects.toThrow(
    'valid still PNG/JPEG',
  );
  await expect(
    prepareVisualImage(Buffer.alloc(16 * 1024 * 1024 + 1)),
  ).rejects.toThrow('16 MiB');
  const gif = await sharp(png).gif().toBuffer();
  await expect(prepareVisualImage(gif)).rejects.toThrow('valid still PNG/JPEG');
});

it('pins official JEV roles while preserving generic default and planning fallback', () => {
  const options = {
    generic: {
      modelName: 'generic-vision',
      modelFamily: 'gemini',
      baseURL: 'https://example.test/v1',
      apiKey: 'generic-test',
    },
    jev: { baseURL: 'https://api.typesafe.ai/v1', apiKey: 'jev-test' },
  };
  const normal = createOfficialVisualModelConfig(options);
  expect(normal.MIDSCENE_MODEL_NAME).toBe('generic-vision');
  expect(normal.MIDSCENE_PLANNING_MODEL_NAME).toBe('generic-vision');
  expect(normal.MIDSCENE_LOCATE_MODEL_NAME).toBe('jev-1.14.0');
  const all = createOfficialVisualModelConfig({
    ...options,
    allJevPlanning: true,
  });
  expect(all.MIDSCENE_MODEL_NAME).toBe('generic-vision');
  expect(all.MIDSCENE_PLANNING_MODEL_NAME).toBe('jev-1.14.0');
  expect(() =>
    createOfficialVisualModelConfig({
      ...options,
      generic: { ...options.generic, modelFamily: 'jev' },
    }),
  ).toThrow('non-JEV');
});

it('keeps assets outside the text budget even when the image exceeds 40KB', async () => {
  const { randomBytes } = await import('node:crypto');
  const large = await sharp(randomBytes(512 * 512 * 3), {
    raw: { width: 512, height: 512, channels: 3 },
  })
    .png()
    .toBuffer();
  expect(large.length).toBeGreaterThan(40_000);
  const page = fakePage();
  vi.mocked(page.screenshot).mockResolvedValue(large);
  const fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(
      body.assets[Object.keys(body.assets)[0]].data_base64.length,
    ).toBeGreaterThan(40_000);
    body.assets = undefined;
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(40_000);
    return ok();
  }) as typeof globalThis.fetch;
  expect(
    (
      await evaluateJevAssertion(page, {
        prompt: 'Blue square',
        visual: {},
        fetch,
      })
    ).pass,
  ).toBe(true);
});

it('keeps visual YAML opt-in strict and permits explicit DOM overrides', async () => {
  const { jevAssertInputSchema, jevWaitForInputSchema } = await import(
    '../../src/schema'
  );
  expect(
    jevAssertInputSchema.parse({ prompt: 'Ready', options: { visual: false } })
      .options?.visual,
  ).toBe(false);
  expect(
    jevWaitForInputSchema.parse({
      prompt: 'Ready',
      options: { visual: { transport: 'openrouter' } },
    }).options?.visual,
  ).toEqual({ transport: 'openrouter' });
  expect(
    jevAssertInputSchema.safeParse({
      prompt: 'Ready',
      options: { visual: { transport: 'unknown' } },
    }).success,
  ).toBe(false);
});

it('re-captures every wait and returns indeterminate for insufficient evidence', async () => {
  const { waitForJevAssertion } = await import('../../src/wait-for');
  const page = fakePage();
  const refs: string[] = [];
  const fetch = vi.fn(async (_url, init) => {
    refs.push(Object.keys(JSON.parse(String(init?.body)).assets)[0]);
    if (refs.length === 1)
      return new Response(
        JSON.stringify({
          answers: {
            condition_satisfied: { type: 'noul', noul: 0.99 },
            evidence_sufficient: { type: 'noul', noul: 0.1 },
          },
        }),
      );
    return ok();
  }) as typeof globalThis.fetch;
  const result = await waitForJevAssertion(page, {
    prompt: 'Ready',
    visual: {},
    fetch,
    checkIntervalMs: 1,
    timeoutMs: 2000,
  });
  expect(result.pass).toBe(true);
  expect(result.attempts).toBe(2);
  expect(new Set(refs).size).toBe(2);
  expect(page.screenshot).toHaveBeenCalledTimes(2);
});

it('rejects excessive Clef text before transmission instead of accepting truncation', async () => {
  vi.stubEnv('MIDSCENE_JEV_MODEL_NAME', 'cloudflare/clef');
  const fetch = vi.fn();
  await expect(
    evaluateJevAssertion(fakePage(), {
      prompt: 'Ready',
      context: '漢'.repeat(2000),
      visual: { transport: 'openrouter' },
      fetch,
    }),
  ).rejects.toThrow('4000-byte');
  expect(fetch).not.toHaveBeenCalled();
});
