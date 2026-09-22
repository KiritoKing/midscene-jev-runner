import type { JevRecentAction } from './internal-types';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const tokenCount = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

export const sanitizedUrl = (value: string): string => {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return 'about:blank';
  }
};

export const endpoint = (base: string, path: string): string => {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error('Invalid JEV base URL configuration.');
  }
  url.search = '';
  url.hash = '';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path}`;
  return url.toString();
};

export const recentActionsForModel = (
  actions: JevRecentAction[],
): Array<
  Omit<
    JevRecentAction,
    'fromProgressMarker' | 'toProgressMarker' | 'signature' | 'recoveryEpoch'
  >
> =>
  actions.map(
    ({ operation, target, label, outcome, error, feedback, group }) => ({
      operation,
      ...(target !== undefined ? { target } : {}),
      ...(label !== undefined ? { label } : {}),
      outcome,
      ...(error !== undefined ? { error } : {}),
      ...(feedback !== undefined ? { feedback } : {}),
      ...(group !== undefined ? { group } : {}),
    }),
  );

export const waitForAbortable = (
  duration: number,
  signal: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('JEV run aborted.'));
      return;
    }
    const timer = setTimeout(done, duration);
    const abort = () => done(signal.reason ?? new Error('JEV run aborted.'));
    function done(error?: unknown) {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    }
    signal.addEventListener('abort', abort, { once: true });
  });
