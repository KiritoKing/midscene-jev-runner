import type { Page } from 'playwright';
import { evaluateJevAssertion } from './assertion';
import type {
  JevAssertionOptions,
  JevAssertionResult,
  JevUsage,
  JevWaitForResult,
} from './types';

export interface JevWaitForOptions extends JevAssertionOptions {
  timeoutMs?: number;
  checkIntervalMs?: number;
}

const pause = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(signal?.reason);
    }
    signal?.addEventListener('abort', abort, { once: true });
  });

/** Recheck an observable condition without taking browser actions. */
export const waitForJevAssertion = async (
  page: Page,
  options: JevWaitForOptions,
): Promise<JevWaitForResult> => {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const checkIntervalMs = options.checkIntervalMs ?? 3_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error('JEV wait timeout must be a positive number.');
  if (!Number.isFinite(checkIntervalMs) || checkIntervalMs <= 0)
    throw new Error('JEV wait check interval must be a positive number.');

  const startedAt = performance.now();
  const usage: JevUsage = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
  };
  let lastAssertion: JevAssertionResult | undefined;
  let attempts = 0;
  while (true) {
    options.signal?.throwIfAborted();
    const checkStartedAt = performance.now();
    lastAssertion = await evaluateJevAssertion(page, options);
    attempts += 1;
    usage.calls += lastAssertion.usage.calls;
    usage.inputTokens += lastAssertion.usage.inputTokens;
    usage.outputTokens += lastAssertion.usage.outputTokens;
    usage.cost += lastAssertion.usage.cost;
    if (lastAssertion.pass || performance.now() - startedAt >= timeoutMs)
      return {
        pass: lastAssertion.pass,
        attempts,
        elapsedMs: Math.round(performance.now() - startedAt),
        lastAssertion,
        usage,
      };
    const remainingMs = timeoutMs - (performance.now() - startedAt);
    await pause(
      Math.min(
        remainingMs,
        Math.max(0, checkIntervalMs - (performance.now() - checkStartedAt)),
      ),
      options.signal,
    );
    if (performance.now() - startedAt >= timeoutMs)
      return {
        pass: false,
        attempts,
        elapsedMs: Math.round(performance.now() - startedAt),
        lastAssertion,
        usage,
      };
  }
};
