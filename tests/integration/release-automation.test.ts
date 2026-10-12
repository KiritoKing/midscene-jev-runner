import { describe, expect, it, vi } from 'vitest';
import { verifyReleaseIdentity } from '../../scripts/ensure-github-release.mjs';
import { inspectRegistry } from '../../scripts/registry-release.mjs';
import { planRelease } from '../../scripts/release-plan.mjs';

const push = {
  event: 'push',
  ref: 'refs/heads/main',
  previousVersion: '0.1.2',
  version: '0.2.0',
};
const registry = {
  name: '@chlrc/midscene-jev-runner',
  version: '0.2.0',
  integrity: 'sha512-synthetic',
  distTag: 'latest',
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const fetcher = (...responses: Response[]) => {
  const mock = vi.fn<typeof fetch>();
  for (const item of responses) mock.mockResolvedValueOnce(item);
  return mock;
};

describe('reviewed release planning', () => {
  it('publishes an increasing stable main version and skips ordinary unchanged updates', () => {
    expect(planRelease(push)).toEqual({
      should_publish: 'true',
      release_tag: 'v0.2.0',
      prerelease: 'false',
    });
    expect(planRelease({ ...push, version: '0.1.2' })).toEqual({
      should_publish: 'false',
    });
    expect(
      planRelease({ ...push, version: '1.0.0', previousVersion: '0.99.99' })
        .should_publish,
    ).toBe('true');
    expect(
      planRelease({ ...push, version: '0.10.0', previousVersion: '0.9.99' })
        .should_publish,
    ).toBe('true');
  });
  for (const patch of [
    { ref: 'refs/heads/next' },
    { event: 'pull_request' },
    { version: '0.1.1' },
    { version: '0.2.0-beta.1' },
    { previousVersion: '0.2.0-beta.5' },
    { version: '00.2.0' },
    { version: '0.2.0\nshould_publish=true' },
  ]) {
    it(`rejects unauthorized or invalid automatic identity ${JSON.stringify(patch)}`, () => {
      expect(() => planRelease({ ...push, ...patch })).toThrow();
    });
  }
  it('keeps manually approved beta releases separate from stable merge publication', () => {
    expect(
      planRelease({
        event: 'release',
        version: '0.3.0-beta.1',
        tag: 'v0.3.0-beta.1',
        prerelease: 'true',
      }),
    ).toEqual({
      should_publish: 'true',
      release_tag: 'v0.3.0-beta.1',
      prerelease: 'true',
    });
    expect(() =>
      planRelease({
        event: 'release',
        version: '0.3.0-beta.1',
        tag: 'v0.3.0-beta.1',
        prerelease: 'false',
      }),
    ).toThrow();
    expect(() =>
      planRelease({
        event: 'release',
        version: '0.2.0',
        tag: 'v0.1.2',
        prerelease: 'false',
      }),
    ).toThrow();
  });
});

describe('registry reconciliation without blind publication retries', () => {
  it('only treats a confirmed HTTP 404 as absent', async () => {
    const fetch = fetcher(response({}, 404));
    expect(await inspectRegistry({ ...registry, fetch })).toEqual({
      exists: false,
      tagged: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const status of [401, 429, 500]) {
      await expect(
        inspectRegistry({ ...registry, fetch: fetcher(response({}, status)) }),
      ).rejects.toThrow('unknown');
    }
  });
  it('reads exact version, tarball integrity and channel for an already published artifact', async () => {
    const fetch = fetcher(
      response({
        name: registry.name,
        version: registry.version,
        dist: { integrity: registry.integrity },
      }),
      response({ 'dist-tags': { latest: registry.version } }),
    );
    expect(await inspectRegistry({ ...registry, fetch })).toEqual({
      exists: true,
      tagged: true,
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://registry.npmjs.org/%40chlrc%2Fmidscene-jev-runner/0.2.0',
      'https://registry.npmjs.org/%40chlrc%2Fmidscene-jev-runner',
    ]);
  });
  it('does not confuse an existing package with an updated dist-tag', async () => {
    const fetch = fetcher(
      response({
        name: registry.name,
        version: registry.version,
        dist: { integrity: registry.integrity },
      }),
      response({ 'dist-tags': { latest: '0.1.2' } }),
    );
    expect(await inspectRegistry({ ...registry, fetch })).toEqual({
      exists: true,
      tagged: false,
    });
  });
  it('rejects artifact mismatches and dist-tag lookup failures instead of overwriting', async () => {
    await expect(
      inspectRegistry({
        ...registry,
        fetch: fetcher(
          response({
            name: registry.name,
            version: registry.version,
            dist: { integrity: 'sha512-other' },
          }),
        ),
      }),
    ).rejects.toThrow('never overwrite');
    await expect(
      inspectRegistry({
        ...registry,
        fetch: fetcher(
          response({
            name: registry.name,
            version: registry.version,
            dist: { integrity: registry.integrity },
          }),
          response({}, 500),
        ),
      }),
    ).rejects.toThrow('dist-tag lookup failed');
  });
  it('keeps beta and stable channel identities distinct', async () => {
    const fetch = fetcher(response({}, 404));
    await expect(
      inspectRegistry({ ...registry, distTag: 'beta', fetch }),
    ).rejects.toThrow('channel');
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await inspectRegistry({
        ...registry,
        version: '0.3.0-beta.1',
        distTag: 'beta',
        fetch,
      }),
    ).toEqual({ exists: false, tagged: false });
  });
});

describe('GitHub Release exact-commit identity', () => {
  const tag = 'v0.2.0';
  const sha = 'a'.repeat(40);
  const metadata = { tag_name: tag, draft: false, prerelease: false };
  const object = { type: 'commit', sha };
  it('accepts only a published stable release pointing to the verified commit', () => {
    expect(() =>
      verifyReleaseIdentity(metadata, object, tag, sha),
    ).not.toThrow();
    for (const patch of [
      { tag_name: 'v0.1.2' },
      { draft: true },
      { prerelease: true },
    ])
      expect(() =>
        verifyReleaseIdentity({ ...metadata, ...patch }, object, tag, sha),
      ).toThrow();
    expect(() =>
      verifyReleaseIdentity(
        metadata,
        { ...object, sha: 'b'.repeat(40) },
        tag,
        sha,
      ),
    ).toThrow();
    expect(() =>
      verifyReleaseIdentity(metadata, { ...object, type: 'tree' }, tag, sha),
    ).toThrow();
  });
});
