# Repository guidance

This repository is an independent, community-maintained Midscene Test runner.
It is not part of the Midscene monorepo and must integrate through public
`@midscene/test` APIs only.

- Use pnpm.
- Keep `@midscene/test` and `playwright` as peer dependencies.
- Do not add private or internal URLs, credentials, production fixtures, or
  non-public benchmark artifacts.
- Preserve the caller-owned `Page`: do not create, navigate, route, or close it.
- Add tests for behavior changes and run `pnpm check` before committing.
- Do not publish, push, or create a pull request without explicit authorization.
