import { DEFAULT_JEV_BASE_URL, DEFAULT_REQUEST_TIMEOUT_MS } from './constants';
import { requestJson } from './http';
import { endpoint, isRecord, waitForAbortable } from './utils';

export interface JevDecisionClientOptions {
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
}

const isTransientDecisionError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message === 'JEV request timed out.' ||
    /JEV request failed with HTTP (?:408|429|500|502|503|504|529)\./u.test(
      error.message,
    ));

const systemOneEndpoint = (baseUrl: string): string => {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error('Invalid JEV base URL configuration.');
  }
  url.search = '';
  url.hash = '';
  // A full provider endpoint is accepted unchanged. This retains explicit
  // compatibility with gateways that expose the legacy Decisions route.
  if (/\/(?:systemone|decisions)\/?$/u.test(url.pathname))
    return url.toString();
  return endpoint(url.toString(), 'systemone');
};

/** Send one logical Decisions request, retrying one transient transport failure. */
export const requestDecision = async (
  body: Record<string, unknown>,
  signal: AbortSignal,
  options: JevDecisionClientOptions = {},
): Promise<unknown> => {
  const apiKey = process.env.MIDSCENE_JEV_API_KEY;
  if (!apiKey) throw new Error('MIDSCENE_JEV_API_KEY is required.');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function')
    throw new Error('No fetch implementation is available.');
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0)
    throw new Error('JEV request timeout must be a positive number.');
  const baseUrl = process.env.MIDSCENE_JEV_BASE_URL || DEFAULT_JEV_BASE_URL;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await requestJson(
        fetchImpl,
        systemOneEndpoint(baseUrl),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        signal,
        requestTimeoutMs,
      );
      if (!isRecord(result) || !isRecord(result.answers))
        throw new Error(
          'JEV endpoint returned an incompatible response shape. MIDSCENE_JEV_BASE_URL must resolve to a compatible /systemone or /decisions endpoint.',
        );
      return result;
    } catch (error) {
      if (attempt === 2 || !isTransientDecisionError(error)) throw error;
      await waitForAbortable(250, signal);
    }
  }
  throw new Error('JEV decision request failed.');
};
