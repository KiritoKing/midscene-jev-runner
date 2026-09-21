# Releasing

Publishing is triggered only when a GitHub Release is published. The release
tag must exactly match `v` plus the version in `package.json`.

## Trusted publishing

The package uses npm Trusted Publishing. The npm-side GitHub Actions publisher
must use these exact values:

- Organization or user: `KiritoKing`
- Repository: `midscene-jev-runner`
- Workflow filename: `publish.yml`
- Environment: `npm`
- Allowed action: direct publish

No npm token or GitHub secret is required. The publish job runs on a
GitHub-hosted runner and grants only `contents: read` and `id-token: write`.
npm exchanges the workflow identity for a short-lived publishing credential
and generates provenance for the public package.

The workflow runs the complete check suite without publishing credentials,
packs a single verified tarball, and only then enters the `npm` GitHub
Environment to publish it.

## Prepare a release

Update the version without creating a local tag, validate it, and push the
commit before publishing the GitHub Release:

```sh
pnpm version patch --no-git-tag-version
pnpm check
git add package.json
git commit -m "chore(release): prepare vX.Y.Z"
git push
gh release create vX.Y.Z --target main --generate-notes
```
