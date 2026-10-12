import { describe, expect, it } from 'vitest';
import { resolveLiveModelConfig } from '../../scripts/live-model-config.mjs';

const midscene = {
  MIDSCENE_MODEL_NAME: 'synthetic-vision',
  MIDSCENE_MODEL_API_KEY: 'synthetic-midscene-key',
  MIDSCENE_MODEL_BASE_URL: 'http://127.0.0.1:9001/v1',
  MIDSCENE_MODEL_FAMILY: 'synthetic',
};
const jev = {
  MIDSCENE_JEV_API_KEY: 'synthetic-custom-key',
  MIDSCENE_JEV_BASE_URL: 'http://127.0.0.1:9002/v1/systemone',
  MIDSCENE_JEV_MODEL_NAME: 'synthetic-decision',
};
describe('live model provider configuration', () => {
  it('uses OpenRouter only when there is no explicit JEV override', () => {
    const result = resolveLiveModelConfig({
      ...midscene,
      OPENROUTER_API_KEY: ' synthetic-router-key ',
    });
    expect(result.missing).toEqual([]);
    expect(result.jev).toEqual({
      apiKey: 'synthetic-router-key',
      baseUrl: 'https://openrouter.ai/api/alpha/decisions',
      modelName: '~typesafe/jev-latest',
    });
  });
  for (const omitted of Object.keys(jev)) {
    it(`rejects an incomplete override missing ${omitted}`, () => {
      const partial: NodeJS.ProcessEnv = {
        ...midscene,
        ...jev,
        OPENROUTER_API_KEY: 'unrelated-router-key',
        [omitted]: ' ',
      };
      expect(resolveLiveModelConfig(partial).missing).toEqual([omitted]);
    });
  }
  it('rejects a key-only override instead of borrowing a fallback endpoint', () => {
    expect(
      resolveLiveModelConfig({
        ...midscene,
        MIDSCENE_JEV_API_KEY: jev.MIDSCENE_JEV_API_KEY,
      }).missing,
    ).toEqual(['MIDSCENE_JEV_BASE_URL', 'MIDSCENE_JEV_MODEL_NAME']);
  });
  it('accepts a full custom triple without OpenRouter credentials', () => {
    const result = resolveLiveModelConfig({ ...midscene, ...jev });
    expect(result.missing).toEqual([]);
    expect(result.jev.modelName).toBe('synthetic-decision');
    expect(result.jev.apiKey).toBe('synthetic-custom-key');
    expect(result.jev.baseUrl).toBe(jev.MIDSCENE_JEV_BASE_URL);
  });
  it('reports missing names, not values, including whitespace-only Midscene entries', () => {
    const result = resolveLiveModelConfig({
      ...midscene,
      ...jev,
      MIDSCENE_MODEL_API_KEY: ' ',
    });
    expect(result.missing).toEqual(['MIDSCENE_MODEL_API_KEY']);
  });
});
