# Releasing the npm package

`main` is the stable channel and `next` is the beta channel. Both branches require a pull request and the `check` CI job. Release decisions and changes to source files happen in a local checkout; npm publishing happens only in GitHub Actions.

1. Compare the target branch with its last published tag. Review public API and compatibility changes, then propose the SemVer version and changelog entries with commit or PR evidence. The `npm-publish` Codex skill can assist with this judgment; commit prefixes alone do not decide the version.
2. Update `package.json` and `CHANGELOG.md` together in a release commit. Add a `## [X.Y.Z]` or `## [X.Y.Z-beta.N]` changelog heading. Submit the commit to `next` for beta or `main` for stable. Merge only after the required checks pass.
3. Sync the merged branch locally. The agent verifies the exact version, branch, changelog, package contents, and release commit, then creates `v<package.json version>` on that commit. Push the tag only when explicitly authorized. Tag push alone does not publish the package.
4. A release draft may be prepared for review after the tag exists. A person checks its tag, notes, and pre-release setting (`-beta.N` is a pre-release; stable `X.Y.Z` is regular), then clicks **Publish release**. This is the release approval and the only publication trigger. Saving a draft does not trigger npm publishing. The agent must not publish the GitHub Release.
5. GitHub Actions checks the Release tag against the committed version and event commit, checks the pre-release flag, changelog entry, and target branch, runs `pnpm check`, packs the verified source, and publishes that tarball with provenance. `-beta.N` goes to the npm `beta` dist-tag; stable `X.Y.Z` goes to `latest`.
6. Read back the exact version and dist-tag from npm after CI finishes. A successful Actions job alone does not prove registry availability. If the result is uncertain, inspect registry state before retrying any release action.

The release workflow accepts only stable `X.Y.Z` and `X.Y.Z-beta.N` versions. A different prerelease channel requires a reviewed workflow change. The repository has not yet defined an automatic `0.x` breaking-change bump policy; the release proposal must state the compatibility judgment for review.

The Release event points to the tagged commit. Include the release workflow and verification script in that commit; synchronize release-policy changes to both `main` and `next` before their next releases.
