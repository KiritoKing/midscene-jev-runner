# Releasing the npm package

`main` is the stable channel and `next` is the beta channel. Prepare version and changelog changes in a pull request. npm publishing happens only in GitHub Actions, never from a local checkout.

## Stable: review and merge once

1. Compare with the last published stable tag and document API/compatibility changes, the proposed SemVer version and validation evidence. Commit prefixes alone do not decide compatibility. Pre-1.0 minor changes may include breaking changes and require an explicit migration assessment.
2. Update `package.json` and a matching `## [X.Y.Z]` changelog entry together. The PR must target `main` and propose a strictly increasing stable version. **Merging this reviewed version PR is authorization to publish that version automatically**, replacing the previous second manual Publish Release step for stable releases. Agents must not merge the PR on the reviewer's behalf without separate authorization.
3. The version-changing `main` push triggers `publish.yml`. An unchanged version skips publication; a downgrade, beta version or unverifiable previous commit fails closed. Tag pushes alone do not publish.
4. Actions checks out the exact push SHA, checks version/channel/changelog and main ancestry, runs `pnpm check`, `pnpm test:legacy` and mandatory `pnpm test:e2e`, then packs that verified source. Failed or infrastructure-blocked live scenes prevent publication; there is no optional live-gate fallback. Sanitized live evidence is retained for 30 days and the package artifact for seven days.
5. After these gates, the `npm` environment job inspects the registry, creates/verifies `vX.Y.Z` and its regular GitHub Release at the exact verified SHA, and publishes the same tarball to `latest` with provenance. An existing tag at a different SHA is rejected. This uses the workflow's `GITHUB_TOKEN`, not a personal access token; GitHub Release creation does not need to trigger another workflow run.
6. Registry read-back must confirm the exact package/version, tarball SHA-512 integrity and `latest` dist-tag. A GitHub Release existing is **not** proof that npm publication completed. If publication fails or becomes uncertain, inspect the workflow and registry before rerunning: the workflow skips an already published identical artifact, but rejects an integrity or channel mismatch. It retries bounded read-back only, not `npm publish`.

## Beta: retain human publication approval

1. Prepare `X.Y.Z-beta.N` and matching changelog notes in a PR to `next`.
2. After review/merge, verify the exact merged commit and create/push its matching tag only with authorization. A draft GitHub Release may be prepared for review; saving a draft does not publish to npm.
3. A person checks the exact tag/commit, notes and **pre-release** flag, then clicks **Publish release**. That release event runs the same checks, mandatory real-model gate and verified-tarball publication, targeting npm `beta` rather than `latest`.

Only stable `X.Y.Z` and `X.Y.Z-beta.N` are supported. The published Release fallback also validates the committed version, pre-release flag and branch ancestry. Release-policy changes must be present on the tagged commit and synchronized to `next` before its next beta release; this stable consolidation does not move `next` automatically.

## Repository configuration

The real-model gate requires Actions Secrets `OPENROUTER_API_KEY`, `MIDSCENE_MODEL_API_KEY` and Variables `MIDSCENE_MODEL_NAME`, `MIDSCENE_MODEL_BASE_URL`, `MIDSCENE_MODEL_FAMILY`. Never include credential values in source, logs or artifacts. Custom JEV overrides require a complete key/base/model triple; the workflow uses the default OpenRouter JEV endpoint.

npm Trusted Publishing must remain configured for `KiritoKing/midscene-jev-runner`, workflow **`publish.yml`**, environment **`npm`**. Node 24/npm uses OIDC (`id-token: write`); no persistent npm token is used. Only the publish job has `contents: write` to create the approved stable Release; verification has read-only repository permissions. See [the configuration reference](https://github.com/KiritoKing/midscene-jev-runner/blob/main/RELEASING.md).

Branch protections/rulesets and environment reviewers are repository-owner controls, not established merely by documentation. Configure the intended required PR checks and review policy so a direct version-changing main push cannot bypass the review requirement.
