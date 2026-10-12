# Releasing

The canonical process is in [docs/releasing.md](docs/releasing.md).

- **Stable:** merge a reviewed increasing stable version/changelog PR into `main`. This authorizes automatic publication only after exact-commit checks, legacy tests, mandatory live-model scenes and package verification pass. Do not create a second manual stable Release or publish locally.
- **Beta:** merge a reviewed `X.Y.Z-beta.N` PR into `next`, prepare the exact tag/draft with authorization, then a person clicks **Publish release** with the pre-release flag. The same publication gates apply.
- Always verify npm version, integrity and dist-tag. A GitHub Release alone is not npm publication proof. Inspect uncertain results before retrying.

## Trusted publishing configuration

The npm-side GitHub Actions publisher must retain these exact values:

- Organization or user: `KiritoKing`
- Repository: `midscene-jev-runner`
- Workflow filename: `publish.yml`
- Environment: `npm`
- Allowed action: direct publish

No persistent npm token is required. The GitHub-hosted Node 24 publish job uses `id-token: write` for OIDC/provenance and `contents: write` for the approved stable GitHub Release. The verification job has read-only repository permissions and no npm publishing identity.

The live gate requires the repository's model Secrets and Variables listed in the canonical process. Missing model configuration fails closed. Branch protection and any `npm` environment reviewers must be configured by the repository owner; the workflow does not itself establish PR review enforcement.
