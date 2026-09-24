import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../scripts/verify-release.mjs', import.meta.url),
);

function verify(
  version: string,
  tag: string,
  prerelease?: boolean,
  changelog = true,
) {
  const cwd = mkdtempSync(join(tmpdir(), 'midscene-release-'));
  const outputPath = join(cwd, 'github-output');

  try {
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ name: '@chlrc/midscene-jev-runner', version }),
    );
    if (changelog) {
      writeFileSync(
        join(cwd, 'CHANGELOG.md'),
        `# Changelog\n\n## [${version}] - 2026-09-23\n`,
      );
    }
    const result = spawnSync(process.execPath, [script], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        RELEASE_TAG: tag,
        RELEASE_PRERELEASE:
          prerelease === undefined ? undefined : String(prerelease),
        GITHUB_OUTPUT: outputPath,
      },
    });
    return {
      status: result.status,
      stderr: result.stderr,
      output: existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '',
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe('release tag verification', () => {
  it('routes a matching beta tag to next and the beta dist-tag', () => {
    expect(verify('0.2.0-beta.4', 'v0.2.0-beta.4', true)).toMatchObject({
      status: 0,
      output: 'dist_tag=beta\ntarget_branch=next\n',
    });
  });

  it('routes a matching stable tag to main and the latest dist-tag', () => {
    expect(verify('0.2.0', 'v0.2.0', false)).toMatchObject({
      status: 0,
      output: 'dist_tag=latest\ntarget_branch=main\n',
    });
  });

  it('rejects mismatched and unsupported release versions before publishing', () => {
    const mismatch = verify('0.2.0-beta.4', 'v0.2.0');
    const unsupported = verify('0.2.0-rc.1', 'v0.2.0-rc.1');

    expect(mismatch.status).not.toBe(0);
    expect(mismatch.output).toBe('');
    expect(unsupported.status).not.toBe(0);
    expect(unsupported.output).toBe('');
  });

  it('rejects a beta release marked stable or missing its changelog entry', () => {
    const wrongChannel = verify('0.2.0-beta.4', 'v0.2.0-beta.4', false);
    const missingChangelog = verify(
      '0.2.0-beta.4',
      'v0.2.0-beta.4',
      true,
      false,
    );

    expect(wrongChannel.status).not.toBe(0);
    expect(wrongChannel.output).toBe('');
    expect(missingChangelog.status).not.toBe(0);
    expect(missingChangelog.output).toBe('');
  });
});
