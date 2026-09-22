import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestDecision } from '../src/decision-client';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requestDecision', () => {
  it('requires the runner-owned API key even when an OpenRouter key exists', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'must-not-be-used');

    await expect(
      requestDecision({}, new AbortController().signal, {
        fetch: vi.fn<typeof globalThis.fetch>(),
      }),
    ).rejects.toThrow('MIDSCENE_JEV_API_KEY is required.');
  });

  it('sends the documented TypeSafe System One request and preserves its body', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'runner-key');
    vi.stubEnv('MIDSCENE_JEV_BASE_URL', '');
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response({ answers: {} }),
    );
    const body = {
      model: 'jev-latest',
      state: { page: 'current' },
      questions: { operation: { type: 'choice' } },
    };

    await expect(
      requestDecision(body, new AbortController().signal, { fetch }),
    ).resolves.toEqual({ answers: {} });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer runner-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
  });

  it('uses OpenRouter System One when its API root replaces the base URL', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'runner-key');
    vi.stubEnv('MIDSCENE_JEV_BASE_URL', 'https://openrouter.ai');
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response({ answers: {} }),
    );

    await requestDecision(
      { model: 'jev-latest' },
      new AbortController().signal,
      { fetch },
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/systemone',
      expect.any(Object),
    );
  });

  it('accepts an explicit compatible gateway endpoint without appending a path', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'runner-key');
    vi.stubEnv(
      'MIDSCENE_JEV_BASE_URL',
      'https://openrouter.ai/api/alpha/decisions?ignored=value',
    );
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response({ answers: {} }),
    );

    await requestDecision({}, new AbortController().signal, { fetch });

    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/alpha/decisions',
      expect.any(Object),
    );
  });

  it('retries the documented TypeSafe overload response once', async () => {
    vi.stubEnv('MIDSCENE_JEV_API_KEY', 'runner-key');
    vi.stubEnv('MIDSCENE_JEV_BASE_URL', 'https://api.typesafe.ai/v1');
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ error: {} }, 529))
      .mockResolvedValueOnce(response({ answers: {} }));

    await requestDecision({}, new AbortController().signal, { fetch });

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
