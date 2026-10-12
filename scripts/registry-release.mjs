import { createHash } from 'node:crypto';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function inspectRegistry({
  name,
  version,
  integrity,
  distTag,
  fetch = globalThis.fetch,
}) {
  if (
    name !== '@chlrc/midscene-jev-runner' ||
    !/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version)
  )
    throw new Error('Unexpected package identity.');
  if (distTag !== (version.includes('-beta.') ? 'beta' : 'latest'))
    throw new Error('Unexpected npm release channel.');
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (response.status === 404) return { exists: false, tagged: false };
  if (!response.ok)
    throw new Error(
      `Registry lookup failed: HTTP ${response.status}; publication state is unknown.`,
    );
  const metadata = await response.json();
  if (
    metadata.name !== name ||
    metadata.version !== version ||
    metadata.dist?.integrity !== integrity
  )
    throw new Error(
      'Registry version does not match the verified tarball; never overwrite or blindly retry.',
    );
  const rootResponse = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!rootResponse.ok)
    throw new Error(
      `Registry dist-tag lookup failed: HTTP ${rootResponse.status}.`,
    );
  const root = await rootResponse.json();
  return { exists: true, tagged: root['dist-tags']?.[distTag] === version };
}

async function main() {
  const mode = process.argv[2];
  if (!['plan', 'verify'].includes(mode))
    throw new Error('Use plan or verify.');
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const archives = (await readdir('release-artifact')).filter((file) =>
    file.endsWith('.tgz'),
  );
  if (archives.length !== 1)
    throw new Error('Exactly one verified package artifact is required.');
  const integrity = `sha512-${createHash('sha512')
    .update(await readFile(join('release-artifact', archives[0])))
    .digest('base64')}`;
  const input = {
    name: manifest.name,
    version: manifest.version,
    integrity,
    distTag: process.env.DIST_TAG,
  };
  if (mode === 'plan') {
    const state = await inspectRegistry(input);
    if (state.exists && !state.tagged)
      throw new Error(
        'Existing version has a different dist-tag; inspect before changing registry state.',
      );
    if (!process.env.GITHUB_OUTPUT)
      throw new Error('GITHUB_OUTPUT is required.');
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `should_publish=${!state.exists}\n`,
    );
    console.log(
      state.exists
        ? 'Exact verified package already published; publish skipped.'
        : 'Package version is absent; publication may proceed.',
    );
    return;
  }
  // Only read-back is retried, never npm publish. Allow bounded registry propagation.
  for (let i = 0; i < 6; i += 1) {
    const state = await inspectRegistry(input);
    if (state.exists && state.tagged) {
      console.log(
        `Registry verified ${manifest.name}@${manifest.version} on ${input.distTag}, including tarball integrity.`,
      );
      return;
    }
    if (i < 5) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(
    'Registry version or dist-tag not yet verified; inspect state before rerunning.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
