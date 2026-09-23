import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const required = [
  'OPENROUTER_API_KEY',
  'MIDSCENE_MODEL_NAME',
  'MIDSCENE_MODEL_API_KEY',
  'MIDSCENE_MODEL_BASE_URL',
  'MIDSCENE_MODEL_FAMILY',
];
const missing = required.filter((name) => !process.env[name]?.trim());
const artifactDir = resolve('tests/e2e/.artifacts');
mkdirSync(artifactDir, { recursive: true });
writeFileSync(
  resolve(artifactDir, `preflight-${randomUUID()}.json`),
  `${JSON.stringify(
    {
      kind: 'live-model-preflight',
      status: missing.length > 0 ? 'INFRA_BLOCKED' : 'ready',
      missing,
    },
    null,
    2,
  )}\n`,
);

if (missing.length > 0) {
  console.error(`INFRA_BLOCKED: live model E2E requires ${missing.join(', ')}`);
  process.exitCode = 2;
} else {
  const child = spawn(
    'pnpm',
    ['exec', 'vitest', 'run', '--config', 'vitest.e2e.config.ts'],
    {
      env: { ...process.env, RUN_LIVE_MODEL_E2E: '1' },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('error', (error) => {
    console.error(
      `INFRA_BLOCKED: unable to start live model E2E: ${error.message}`,
    );
    process.exitCode = 2;
  });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 2);
  });
}
