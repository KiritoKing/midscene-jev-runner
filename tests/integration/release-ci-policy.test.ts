import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const ci = read('.github/workflows/ci.yml');
const release = read('.github/workflows/publish.yml');
const verifyJob = release.split('\n  publish:\n')[0];
const publishJob = release.split('\n  publish:\n')[1];
const step = (name: string) => {
  const block = verifyJob.split(`      - name: ${name}\n`)[1];
  expect(block, `missing verify step: ${name}`).toBeDefined();
  return block?.split('      - name: ')[0] ?? '';
};
const needsRelease =
  "if: steps.registry_preflight.outputs.should_publish == 'true'";

describe('release-only paid regression policy', () => {
  it('keeps ordinary push, PR and manual CI offline with the same free gate', () => {
    for (const event of ['push', 'pull_request', 'workflow_dispatch'])
      expect(ci).toContain(`  ${event}:`);
    expect(ci).toContain('run: pnpm check');
    expect(ci).toContain('pnpm exec commitlint');
    expect(ci).toContain('pnpm exec playwright install --with-deps chromium');
    expect(ci).not.toMatch(/test:e2e|test:models|secrets\.|live-model-e2e/);
    expect(ci.match(/^ {2}[\w-]+:\n {4}runs-on:/gm)).toHaveLength(1);
  });

  it('keeps release events serialized and the existing approval and OIDC boundary', () => {
    expect(release).toContain('branches: [main]\n    paths: [package.json]');
    expect(release).toContain('release:\n    types: [published]');
    expect(release).not.toContain('workflow_dispatch:');
    expect(release).toContain(
      'group: npm-publish\n  cancel-in-progress: false',
    );
    expect(verifyJob).not.toMatch(/contents: write|id-token: write/);
    expect(publishJob).toContain('needs: verify');
    expect(publishJob).toContain(
      "if: needs.verify.outputs.should_publish == 'true'",
    );
    expect(publishJob).toContain('environment: npm');
    expect(publishJob).toContain('contents: write\n      id-token: write');
    expect(publishJob).toContain('GH_TOKEN: ${{ github.token }}');
    expect(publishJob).toContain('npm publish ./release-artifact/*.tgz');
  });

  it('reconciles the exact packed artifact after free checks and before one live gate', () => {
    const names = [
      'Verify release version',
      'Verify release branch',
      'Run checks',
      'Pack release candidate',
      'Reconcile candidate before paid regression',
      'Run real-model release gate',
      'Upload package artifact',
    ];
    const offsets = names.map((name) => verifyJob.indexOf(`- name: ${name}\n`));
    expect(offsets.every((offset) => offset >= 0)).toBe(true);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(step('Run checks')).toContain('pnpm check && pnpm test:legacy');
    expect(step('Pack release candidate')).toContain(
      'pnpm pack --pack-destination release-artifact',
    );
    expect(step('Reconcile candidate before paid regression')).toContain(
      'node scripts/registry-release.mjs plan',
    );
    expect(step('Reconcile candidate before paid regression')).toContain(
      'DIST_TAG: ${{ steps.verify_release.outputs.dist_tag }}',
    );
    expect(release.match(/run: pnpm test:e2e/g)).toHaveLength(1);
    expect(publishJob).toContain('node scripts/registry-release.mjs plan');
    expect(publishJob).toContain('node scripts/registry-release.mjs verify');
  });

  it('skips both live and publish for an exact already-published package, not just a matching version', () => {
    expect(verifyJob).toContain(
      'should_publish: ${{ steps.registry_preflight.outputs.should_publish }}',
    );
    expect(step('Run real-model release gate')).toContain(needsRelease);
    expect(step('Upload package artifact')).toContain(needsRelease);
  });

  it('never turns a missing or failed live gate into a publishable artifact', () => {
    expect(release).not.toContain('continue-on-error');
    for (const name of [
      'Run real-model release gate',
      'Upload package artifact',
    ]) {
      expect(step(name)).toContain(needsRelease);
      expect(step(name)).not.toMatch(/always\(\)|failure\(\)|!cancelled\(\)/);
    }
    expect(publishJob).not.toMatch(/always\(\)|failure\(\)|!cancelled\(\)/);
    expect(step('Upload sanitized release evidence')).toContain(
      `if: always() && steps.registry_preflight.outputs.should_publish == 'true'`,
    );
  });
});

const archive = Buffer.from('synthetic immutable package bytes');
const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
const packageName = '@chlrc/midscene-jev-runner';

function registryPlan(
  responses: Array<{ status?: number; body?: unknown; error?: string }>,
  version = '0.2.0',
) {
  const cwd = mkdtempSync(join(tmpdir(), 'jev-release-policy-'));
  const output = join(cwd, 'github-output');
  const script = fileURLToPath(
    new URL('../../scripts/registry-release.mjs', import.meta.url),
  );
  try {
    mkdirSync(join(cwd, 'release-artifact'));
    writeFileSync(join(cwd, 'release-artifact', 'candidate.tgz'), archive);
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ name: packageName, version }),
    );
    const mock = join(cwd, 'mock-fetch.mjs');
    writeFileSync(
      mock,
      `
const responses = ${JSON.stringify(responses)};
globalThis.fetch = async () => {
  const result = responses.shift();
  if (!result) throw new Error('Unexpected request; network is never used');
  if (result.error) throw new Error(result.error);
  return new Response(JSON.stringify(result.body ?? {}), {status: result.status ?? 200});
};
`,
    );
    const result = spawnSync(
      process.execPath,
      ['--import', mock, script, 'plan'],
      {
        cwd,
        encoding: 'utf8',
        env: {
          GITHUB_OUTPUT: output,
          DIST_TAG: version.includes('-beta.') ? 'beta' : 'latest',
        },
      },
    );
    return {
      status: result.status,
      stderr: result.stderr,
      output: existsSync(output) ? readFileSync(output, 'utf8') : '',
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe('pre-live registry CLI decision (no provider or network calls)', () => {
  for (const version of ['0.2.0', '0.3.0-beta.1']) {
    it(`requires the live gate for an absent ${version} release`, () => {
      expect(registryPlan([{ status: 404 }], version)).toMatchObject({
        status: 0,
        output: 'should_publish=true\n',
      });
    });
    it(`does not repeat a paid run for an exact published ${version} release`, () => {
      expect(
        registryPlan(
          [
            { body: { name: packageName, version, dist: { integrity } } },
            {
              body: {
                'dist-tags': {
                  [version.includes('-beta.') ? 'beta' : 'latest']: version,
                },
              },
            },
          ],
          version,
        ),
      ).toMatchObject({ status: 0, output: 'should_publish=false\n' });
    });
  }
  for (const status of [401, 429, 500]) {
    it(`blocks before spending when registry state is unknown (${status})`, () => {
      const result = registryPlan([{ status }]);
      expect(result.status).not.toBe(0);
      expect(result.output).toBe('');
      expect(result.stderr).toContain('publication state is unknown');
    });
  }
  it('blocks on a network failure rather than treating it as an absent version', () => {
    const result = registryPlan([{ error: 'synthetic network timeout' }]);
    expect(result.status).not.toBe(0);
    expect(result.output).toBe('');
  });
  for (const patch of [
    { name: 'other-package' },
    { version: '0.1.2' },
    { dist: { integrity: 'sha512-other' } },
  ]) {
    it(`rejects existing-artifact mismatch ${JSON.stringify(patch)}`, () => {
      const result = registryPlan([
        {
          body: {
            name: packageName,
            version: '0.2.0',
            dist: { integrity },
            ...patch,
          },
        },
      ]);
      expect(result.status).not.toBe(0);
      expect(result.output).toBe('');
      expect(result.stderr).toContain('never overwrite or blindly retry');
    });
  }
  it('fails closed when an identical artifact is not on the expected dist-tag', () => {
    const result = registryPlan([
      { body: { name: packageName, version: '0.2.0', dist: { integrity } } },
      { body: { 'dist-tags': { latest: '0.1.2' } } },
    ]);
    expect(result.status).not.toBe(0);
    expect(result.output).toBe('');
    expect(result.stderr).toContain('different dist-tag');
  });
});
