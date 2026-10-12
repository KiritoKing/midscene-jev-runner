const jevNames = [
  'MIDSCENE_JEV_API_KEY',
  'MIDSCENE_JEV_BASE_URL',
  'MIDSCENE_JEV_MODEL_NAME',
];
const midsceneNames = [
  'MIDSCENE_MODEL_NAME',
  'MIDSCENE_MODEL_API_KEY',
  'MIDSCENE_MODEL_BASE_URL',
  'MIDSCENE_MODEL_FAMILY',
];

// A provider override is an atomic triple. Never send one provider's key to
// another provider's fallback endpoint because only part of it was configured.
export function resolveLiveModelConfig(env) {
  const value = (name) => env[name]?.trim() || '';
  const custom = jevNames.some((name) => value(name));
  const required = [
    ...(custom ? jevNames : ['OPENROUTER_API_KEY']),
    ...midsceneNames,
  ];
  const missing = required.filter((name) => !value(name));
  return {
    missing,
    jev: custom
      ? {
          apiKey: value('MIDSCENE_JEV_API_KEY'),
          baseUrl: value('MIDSCENE_JEV_BASE_URL'),
          modelName: value('MIDSCENE_JEV_MODEL_NAME'),
        }
      : {
          apiKey: value('OPENROUTER_API_KEY'),
          baseUrl: 'https://openrouter.ai/api/alpha/decisions',
          modelName: '~typesafe/jev-latest',
        },
  };
}
