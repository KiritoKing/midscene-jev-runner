import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function verifyReleaseIdentity(metadata, object, tag, sha) {
  if (metadata.tag_name !== tag || metadata.draft || metadata.prerelease)
    throw new Error(
      'Existing GitHub Release has a different identity or channel.',
    );
  if (object.type !== 'commit' || object.sha !== sha)
    throw new Error(
      'Release tag does not point to the exact verified main commit.',
    );
}

async function main() {
  const { version, name } = JSON.parse(await readFile('package.json', 'utf8'));
  const tag = `v${version}`;
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  if (
    process.env.GITHUB_EVENT_NAME !== 'push' ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    name !== '@chlrc/midscene-jev-runner' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
    !/^[\w.-]+\/[\w.-]+$/.test(repo || '') ||
    !/^[a-f0-9]{40}$/.test(sha || '')
  )
    throw new Error('Invalid stable main release identity.');

  function gh(args, allowMissing = false) {
    const result = spawnSync('gh', args, { encoding: 'utf8' });
    if (result.status === 0) return result.stdout;
    if (allowMissing && /HTTP 404\b/.test(result.stderr)) return undefined;
    throw new Error(
      `GitHub release operation failed (exit ${result.status}); no blind retry.`,
    );
  }
  function tagObject(ref) {
    let object = JSON.parse(ref).object;
    for (let i = 0; object.type === 'tag' && i < 4; i += 1)
      object = JSON.parse(
        gh(['api', `repos/${repo}/git/tags/${object.sha}`]),
      ).object;
    return object;
  }
  const tagEndpoint = `repos/${repo}/git/ref/tags/${tag}`;
  const priorTag = gh(['api', tagEndpoint], true);
  if (priorTag)
    verifyReleaseIdentity(
      { tag_name: tag, draft: false, prerelease: false },
      tagObject(priorTag),
      tag,
      sha,
    );
  const endpoint = `repos/${repo}/releases/tags/${tag}`;
  let release = gh(['api', endpoint], true);
  if (!release) {
    const changelog = await readFile('CHANGELOG.md', 'utf8');
    const entry = changelog.split(`## [${version}]`)[1]?.split('\n## [')[0];
    if (!entry) throw new Error('Versioned release notes are missing.');
    gh([
      'release',
      'create',
      tag,
      '--repo',
      repo,
      '--target',
      sha,
      '--title',
      tag,
      '--notes',
      `Release ${name}@${version}\n\n${entry.trim()}`,
    ]);
    release = gh(['api', endpoint]);
  }
  verifyReleaseIdentity(
    JSON.parse(release),
    tagObject(gh(['api', tagEndpoint])),
    tag,
    sha,
  );
  console.log(`Verified GitHub Release ${tag} at ${sha}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
