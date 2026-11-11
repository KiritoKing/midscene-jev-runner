const withAbort = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise((resolve, reject) => {
    const abort = () =>
      reject(signal.reason ?? new Error('JEV request aborted.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });

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
    const response = await withAbort(
      fetchImpl(url, {
        ...init,
        signal: controller.signal,
      }),
      controller.signal,
    );
    if (!response.ok)
      throw new Error(`JEV request failed with HTTP ${response.status}.`);
    const raw = await withAbort(response.text(), controller.signal);
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      const contentType = response.headers.get('content-type') || 'unknown';
      throw new Error(
        `JEV endpoint returned a non-JSON response (content-type: ${contentType}). MIDSCENE_JEV_BASE_URL must resolve to a compatible /systemone or /decisions endpoint.`,
      );
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? new Error('JEV run aborted.');
    if (timedOut) throw new Error('JEV request timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
};
