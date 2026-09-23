# Changelog

## [0.2.0-beta.5] - 2026-09-23

### Changed

- Add Conventional Commit checks to the required CI job for pull request titles and commit messages.
- Document the `main` stable and `next` beta release process. Local release preparation now records the version, changelog, and tag before a person publishes the GitHub Release.
- Verify the Release tag, prerelease setting, changelog entry, target branch, and tagged commit before GitHub Actions publishes the npm package. Beta versions use the npm `beta` dist-tag.

### Runtime

- No runner API or runtime behavior changes since `0.2.0-beta.4`.

## [0.2.0-beta.4] - 2026-09-23

- Add maintained local Chromium scene tests and a separate real-model CI job.
- Improve observation through open shadow roots and slots, preserve current control values, and expose SELECT option target values.
- See the [beta.4 release notes](https://github.com/KiritoKing/midscene-jev-runner/releases/tag/v0.2.0-beta.4) for validation details and known limitations.
