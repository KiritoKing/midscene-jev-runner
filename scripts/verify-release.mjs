import { appendFile, readFile } from 'node:fs/promises';

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

const baseVersion = '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)';
const stableVersion = new RegExp(`^${baseVersion}$`);
const betaVersion = new RegExp(`^${baseVersion}-beta\\.(?:0|[1-9]\\d*)$`);
const isBeta = betaVersion.test(manifest.version);

if (!isBeta && !stableVersion.test(manifest.version)) {
  throw new Error(`Unsupported release version: ${manifest.version}.`);
}

const prerelease = process.env.RELEASE_PRERELEASE;
if (prerelease !== undefined && prerelease !== String(isBeta)) {
  throw new Error(
    `GitHub Release prerelease=${prerelease} does not match package version ${manifest.version}.`,
  );
}

const changelog = await readFile('CHANGELOG.md', 'utf8');
const releaseHeading = `## [${manifest.version}]`;
if (!changelog.split(/\r?\n/).some((line) => line.startsWith(releaseHeading))) {
  throw new Error(`CHANGELOG.md is missing a ${releaseHeading} entry.`);
}

const distTag = isBeta ? 'beta' : 'latest';
const targetBranch = isBeta ? 'next' : 'main';

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `dist_tag=${distTag}\ntarget_branch=${targetBranch}\n`,
  );
}

console.log(
  `${manifest.name}@${manifest.version} targets ${distTag} from ${targetBranch}.`,
);
