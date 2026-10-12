export function inspectRegistry(input: {
  name: string;
  version: string;
  integrity: string;
  distTag: string;
  fetch?: typeof globalThis.fetch;
}): Promise<{ exists: boolean; tagged: boolean }>;
