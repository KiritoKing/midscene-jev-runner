export const requestJson = async (
  fetchImpl: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<unknown> => {
  if (signal.aborted) throw signal.reason ?? new Error('JEV run aborted.');
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('JEV request timed out.'));
  }, timeoutMs);
  const abort = () =>
    controller.abort(signal.reason ?? new Error('JEV run aborted.'));
  signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`JEV request failed with HTTP ${response.status}.`);
    return await response.json();
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? new Error('JEV run aborted.');
    if (timedOut) throw new Error('JEV request timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
};
