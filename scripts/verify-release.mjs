import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const releaseTag = process.env.RELEASE_TAG;
const expectedTag = `v${manifest.version}`;

if (manifest.name !== '@chlrc/midscene-jev-runner') {
  throw new Error(`Unexpected package name: ${manifest.name}`);
}

if (!releaseTag) {
  throw new Error('RELEASE_TAG is required.');
}

if (releaseTag !== expectedTag) {
  throw new Error(
    `Release tag ${releaseTag} does not match package version ${expectedTag}.`,
  );
}

console.log(`${manifest.name}@${manifest.version} is ready to publish.`);
