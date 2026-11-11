import { PlaywrightAgent } from '@midscene/web/playwright';
import type { Page } from 'playwright';

// Derive the configuration from the public constructor, not internal packages.
type AgentOptions = NonNullable<
  ConstructorParameters<typeof PlaywrightAgent>[1]
>;
export type OfficialVisualModelConfig = NonNullable<
  AgentOptions['modelConfig']
>;

export interface OfficialVisualProfileOptions {
  /** General-purpose vision model for planning and unsupported JEV tasks. */
  generic: {
    modelName: string;
    modelFamily: string;
    baseURL: string;
    apiKey: string;
  };
  /** System One service base URL (origin or ending in /v1, not /systemone). */
  jev: {
    baseURL: string;
    apiKey: string;
  };
  /** Experimental JEV-first planning; a general-purpose fallback remains. */
  allJevPlanning?: boolean;
}

/** Pure configuration builder: no environment mutation, browser or model calls. */
export function createOfficialVisualModelConfig(
  options: OfficialVisualProfileOptions,
): OfficialVisualModelConfig {
  const { generic, jev, allJevPlanning = false } = options;
  if (generic.modelFamily.trim().toLowerCase() === 'jev') {
    throw new Error(
      'The default model must be a general-purpose non-JEV model.',
    );
  }
  for (const [group, values] of Object.entries({ generic, jev })) {
    for (const [key, value] of Object.entries(values)) {
      if (!value.trim()) throw new Error(`${group}.${key} is required.`);
    }
  }

  const config: OfficialVisualModelConfig = {
    MIDSCENE_MODEL_NAME: generic.modelName,
    MIDSCENE_MODEL_FAMILY: generic.modelFamily,
    MIDSCENE_MODEL_BASE_URL: generic.baseURL,
    MIDSCENE_MODEL_API_KEY: generic.apiKey,
    MIDSCENE_PLANNING_MODEL_NAME: generic.modelName,
    MIDSCENE_PLANNING_MODEL_FAMILY: generic.modelFamily,
    MIDSCENE_PLANNING_MODEL_BASE_URL: generic.baseURL,
    MIDSCENE_PLANNING_MODEL_API_KEY: generic.apiKey,
  };

  for (const slot of [
    'LOCATE',
    'INSIGHT',
    ...(allJevPlanning ? ['PLANNING'] : []),
  ]) {
    config[`MIDSCENE_${slot}_MODEL_NAME`] = 'jev-1.14.0';
    config[`MIDSCENE_${slot}_MODEL_FAMILY`] = 'jev';
    config[`MIDSCENE_${slot}_MODEL_BASE_URL`] = jev.baseURL;
    config[`MIDSCENE_${slot}_MODEL_API_KEY`] = jev.apiKey;
  }
  return config;
}

/** Wrap the caller's existing Page without navigating or taking its ownership. */
export function createOfficialVisualAgent(
  page: Page,
  options: OfficialVisualProfileOptions,
  agentOptions: Omit<AgentOptions, 'modelConfig'> = {},
): PlaywrightAgent {
  return new PlaywrightAgent(page, {
    ...agentOptions,
    modelConfig: createOfficialVisualModelConfig(options),
  });
}
