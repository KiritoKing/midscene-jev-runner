import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function planRelease({
  event,
  ref,
  version,
  previousVersion,
  tag,
  prerelease,
}) {
  if (event === 'release') {
    if (
      tag !== `v${version}` ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/.test(
        version,
      ) ||
      prerelease !== String(version.includes('-beta.'))
    )
      throw new Error(
        'A matching published Release tag and explicit channel are required.',
      );
    return { should_publish: 'true', release_tag: tag, prerelease };
  }
  if (event !== 'push' || ref !== 'refs/heads/main')
    throw new Error('Automatic publication is only allowed on a main push.');
  if (version === previousVersion) return { should_publish: 'false' };
  const parts = (value) => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value || ''))
      throw new Error(
        'Automatic publication requires stable versions before and after the push.',
      );
    return value.split('.').map(BigInt);
  };
  const current = parts(version);
  const previous = parts(previousVersion);
  const first = current.findIndex((part, i) => part !== previous[i]);
  if (first < 0 || current[first] < previous[first])
    throw new Error(
      'Automatic publication requires an increasing stable version.',
    );
  return {
    should_publish: 'true',
    release_tag: `v${version}`,
    prerelease: 'false',
  };
}

async function main() {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  let previousVersion;
  if (process.env.EVENT_NAME === 'push') {
    const before = process.env.PUSH_BEFORE || '';
    if (!/^[a-f0-9]{40}$/.test(before) || /^0+$/.test(before))
      throw new Error('A verifiable prior main commit is required.');
    previousVersion = JSON.parse(
      execFileSync('git', ['show', `${before}:package.json`], {
        encoding: 'utf8',
      }),
    ).version;
  }
  const plan = planRelease({
    event: process.env.EVENT_NAME,
    ref: process.env.GITHUB_REF,
    version: manifest.version,
    previousVersion,
    tag: process.env.RELEASE_TAG,
    prerelease: process.env.RELEASE_PRERELEASE,
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(plan)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
  console.log(
    plan.should_publish === 'true'
      ? `Release gate planned for ${plan.release_tag}.`
      : 'No version change; publication skipped.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
