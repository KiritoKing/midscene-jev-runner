export function resolveLiveModelConfig(env: NodeJS.ProcessEnv): {
  missing: string[];
  jev: { apiKey: string; baseUrl: string; modelName: string };
};
