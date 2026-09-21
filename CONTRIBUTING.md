# Contributing

This is a community-maintained integration built on Midscene Test's public
extension APIs. Contributions should remain portable and avoid relying on
Midscene monorepo internals.

## Development

Requirements: Node.js `^20.19.0 || ^22.12.0 || >=24.0.0` and pnpm `>=9.3.0`.

```sh
pnpm install --frozen-lockfile
pnpm check
```

Tests use local, deterministic model responses. Real model credentials and
business-system fixtures must not be committed.

## Changes

- Add or update the nearest test when behavior changes.
- Keep `@midscene/test` and Playwright integration on their public APIs.
- Use Conventional Commits with the `runner`, `docs`, or `workflow` scope.
- Include the exact validation commands in pull request descriptions.

Maintainers should follow [`RELEASING.md`](./RELEASING.md) for versioning and
the automated npm release process.
