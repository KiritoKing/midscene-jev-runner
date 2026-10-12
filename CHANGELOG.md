# Changelog

## [0.2.0] - 2026-10-12

### Stable promotion and compatibility

- Promote the beta series to stable, integrating the previously separate solution and realistic-fixture PRs, plus the latest `main`/`next` release policy history.
- Relative to 0.1.2, add public assertion/wait APIs and nodes, scoped semantic/geometry observation and public Midscene Agent composition alongside the existing runner integration.
- **Pre-1.0 breaking changes:** remove `TYPE_TEXT`/`CLEAR`, `JevTextUsage` and `JevRunResult.textUsage`; use caller-registered native Midscene `aiInput` instead. `JevNodeOptions.getPage` now accepts execution contexts for act/assert/wait nodes. Consumers should review the updated README composition and result types before upgrading.
- Keep `@midscene/test` and `playwright` as peer dependencies. The caller owns its Page and native text input; JEV does not fill/clear fields or own navigation, authentication, routes or cleanup.

### Fixed

- Keep weak nearby labels inside the current semantic group; preserve explicit cross-group ARIA naming.
- Keep nonmodal editable-combobox suggestions from hiding uncovered actions; retain modal and hit-test constraints.
- Guard Escape against clearing focused caller-owned search text, including open shadow roots and frames.
- Give operation selection the same bounded candidate facts as target selection without keyword-based action filters.
- Retry only recognized transient observations once and permit independent completion reconciliation of uncertain actions without replaying them.
- Preserve assertion fact identity, group and layer evidence, including hidden counterevidence.
- Explain caller-specified action order and prerequisites in both decision questions without business-specific sequences or intent-keyword action bans; suppress independently rejected terminal judgments only in the same observed state while preserving delayed completion reconciliation.

### Validation and release

- Add structurally varied regression cases, realistic local server/Chromium fixtures, independent state/side-effect checks, and sanitized decision-wire diagnostics.
- Require an atomic custom model key/base/model triple in the live harness. Retain JEV as the default after a text-only comparison; no alternative-model production adapter is introduced.
- Compose segmented native date input through public caller-side Midscene keyboard/input nodes in the explicit en-US fixture; other locales/widgets remain unverified.
- A reviewed stable version bump merged into `main` now authorizes automatic release. Actions verifies the exact commit, version/channel, checks, legacy tests, package and mandatory real-model scenes before creating the GitHub Release and publishing the verified tarball with npm provenance. Read-back verifies registry integrity and dist-tag; uncertain publication is never blindly replayed. Beta releases retain human Publish Release approval.

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

## [0.1.2] - 2026-09-22

- Add generic runner workflow recovery and reorganize the implementation into modules.
- See the [v0.1.1...v0.1.2 comparison](https://github.com/KiritoKing/midscene-jev-runner/compare/v0.1.1...v0.1.2) for the full historical change set.
