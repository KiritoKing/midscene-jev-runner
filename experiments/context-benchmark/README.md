# JEV context benchmark

This directory contains controlled, local-only comparisons of browser context
strategies. Every strategy runs against the same Playwright pages, goals, JEV
model, action executor, and completion oracle. No fixture contacts an external
website or business system.

The benchmark separates three questions:

1. Did the context retain the required browser fact?
2. Did JEV select the correct operation and target from that context?
3. Did deterministic execution reach the independent completion oracle?

`oracleId` exists only in the in-process benchmark representation and is never
included in a model request.

The canonical experiment evidence and selected design are summarized in
[`results/comparison.md`](./results/comparison.md). Optional live tests are
disabled during normal `pnpm test` runs:

```sh
RUN_LIVE_JEV_BENCHMARK=1 pnpm vitest run tests/context-benchmark.live.test.ts
RUN_LIVE_PRODUCTION_CONTEXT_BENCHMARK=1 pnpm vitest run tests/production-context.live.test.ts
```

## Scope after the Test-node boundary change

The standalone production benchmark now covers only non-text `jevAct` tasks.
Fixtures requiring `TYPE_TEXT` are explicitly listed in `excludedFixtures`, not
counted as passes or included in its completion-rate denominator. Multi-node
input/action/assertion composition is tested separately in the local test suite.
Historical results predate this boundary and must not be presented as current
package coverage. The strategy comparison harness retains its own deterministic
text-input executor as an experiment; it is not exported by this package.
