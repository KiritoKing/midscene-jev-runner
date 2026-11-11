import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import sharp from 'sharp';
import type { JevVisualOptions } from './types';

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MODELS = new Set(['jev-1.13.0', 'jev-1.14.0', 'jev-latest']);

/** Experimental TypeSafe image support, deliberately separate from DOM actions. */
export const validateVisualModel = (
  model: string,
  transport: 'typesafe' | 'openrouter' = 'typesafe',
): void => {
  if (transport === 'openrouter') {
    if (model !== 'cloudflare/clef')
      throw new Error('OpenRouter visual assertions require cloudflare/clef.');
    return;
  }
  if (!MODELS.has(model))
    throw new Error(
      'Visual assertions require a documented image-capable model (jev-1.13.0, jev-1.14.0, jev-latest).',
    );
};

/** Decode before upload; reject corrupt/animated input and normalize image limits. */
export const prepareVisualImage = async (bytes: Buffer): Promise<Buffer> => {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new Error(
      'JEV visual image exceeds the 16 MiB input budget or is empty.',
    );
  try {
    const metadata = await sharp(bytes, {
      animated: true,
      limitInputPixels: 40_000_000,
    }).metadata();
    if (
      !['png', 'jpeg'].includes(metadata.format ?? '') ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error('Unsupported image.');
    const resized = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: 1568,
        height: 1568,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    const image = await sharp(resized.data)
      .extend({
        top: 0,
        left: 0,
        right: Math.max(0, 280 - resized.info.width),
        bottom: Math.max(0, 280 - resized.info.height),
        background: '#ffffff',
      })
      .png()
      .toBuffer();
    if (image.length > MAX_IMAGE_BYTES) throw new Error('Image too large.');
    return image;
  } catch {
    throw new Error(
      'JEV visual image must be a valid still PNG/JPEG within the image budget.',
    );
  }
};

/** Clef's gateway estimates base64 against a 65k-token limit. */
const prepareClefImage = async (image: Buffer): Promise<Buffer> => {
  for (const size of [1024, 768, 512]) {
    const jpeg = await sharp(image)
      .flatten({ background: '#ffffff' })
      .resize({
        width: size,
        height: size,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75, progressive: false })
      .toBuffer();
    if (jpeg.length <= 180 * 1024) return jpeg;
  }
  throw new Error(
    'JEV OpenRouter image exceeded its conservative 180 KiB budget.',
  );
};

export const abortable = <T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new Error('JEV visual capture aborted.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });

export const captureVisualEvidence = async (
  page: Page,
  options: JevVisualOptions,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{
  reference: string;
  assets: Record<
    string,
    { type: 'image'; format: 'png' | 'jpeg'; data_base64: string }
  >;
}> => {
  signal.throwIfAborted();
  const selectors = [
    'input[type="password"]',
    ...(options.maskSelectors ?? []),
  ];
  if (
    selectors.some(
      (selector) => typeof selector !== 'string' || !selector.trim(),
    )
  )
    throw new Error('JEV visual mask selectors must be non-empty strings.');
  let bytes: Buffer;
  try {
    bytes = await abortable(
      page.screenshot({
        type: 'png',
        fullPage: false,
        scale: 'css',
        timeout: timeoutMs,
        mask: page
          .frames()
          .flatMap((frame) =>
            selectors.map((selector) => frame.locator(selector)),
          ),
        maskColor: '#000000',
      }),
      signal,
    );
  } catch {
    signal.throwIfAborted();
    // Do not expose Playwright call logs: these may contain selectors or page data.
    throw new Error('JEV visual capture failed; no image was submitted.');
  }
  signal.throwIfAborted();
  const image = await abortable(prepareVisualImage(bytes), signal);
  signal.throwIfAborted();
  const encoded =
    options.transport === 'openrouter'
      ? await abortable(prepareClefImage(image), signal)
      : image;
  signal.throwIfAborted();
  const reference = randomUUID();
  return {
    reference,
    assets: {
      [reference]: {
        type: 'image',
        format: options.transport === 'openrouter' ? 'jpeg' : 'png',
        data_base64: encoded.toString('base64'),
      },
    },
  };
};
