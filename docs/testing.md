# Scene testing

The maintained test gate has two layers. `pnpm check` runs static checks, the
offline Chromium scene integration suite, the build, and the package smoke test.
`pnpm test:e2e` runs four local scenes through real JEV and Midscene model
requests. The legacy unit and experimental tests remain available through
`pnpm test:legacy`, but are outside the maintained gate.

| Command | Model requests | What passing means |
| --- | --- | --- |
| `pnpm test:integration` (also `pnpm test`) | None | Real Chromium observations, candidate selection, action execution, stale-state guards, and independent readback work on controlled local pages. The decision transport is deterministic. |
| `pnpm check` | None | Lint, types, scene integration, build, and package smoke pass. It does not establish model accuracy. |
| `pnpm test:e2e` | Real JEV and Midscene requests | The four current local scene workflows pass with the configured providers and independent fixture-state assertions. This is a single configured run, not a reliability or speed estimate. |
| `pnpm test:legacy` | Normally none; historical live benchmarks opt in separately | Existing unit and experimental suites can still be inspected during migration. Their result is not the default acceptance gate. |

Install the locked dependencies and Chromium before either browser suite:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
```

## Adding a behavior change with Red → Green evidence

1. State the observed failure mechanism and the general browser behavior it
   exposes. Use a local fixture with public, synthetic names and data. Do not
   branch the runner on a fixture, site, route, benchmark, or task phrase.
2. Add a failing scene that exercises the original structure. Add a second
   scene with a different control or layout structure that has the same
   mechanism, plus a counterexample that the proposed rule must leave usable.
   Record the initial failing assertion, then change the shared observation,
   candidate, decision, execution, or verification mechanism.
3. Assert the observable outcome independently. For side effects, use the
   fixture's run ID to read its state and event ledger, including exact count
   and final data. For uncertain actions, read back first; never replay a
   possibly committed action solely because transport returned an error.
4. Run `pnpm test:integration`, then `pnpm check`. For a model-facing change,
   run `pnpm test:e2e` with a configured provider and retain its run artifacts.
   Report the variant, counterexample, failed and passed assertions, and any
   browser or provider behavior still untested.

The maintained offline suite currently contains 27 Chromium integration cases.
They exercise hidden stale copies, weak semantic
targets, portalled listboxes, iframe and shadow targets, rerendered row identity,
background tabs, early `DONE`, lost action responses, and caller-owned `Page`
navigation. They use real Chromium and local deterministic decision responses;
they do not claim live model performance.

The observation regressions cover two shared visibility rules. Page text and
action-local context traverse open shadow roots and assigned slots while
excluding hidden, inert, script, style, and template content; they respect
inherited visibility and the text budget. The decision request includes only
visible facts, while a visible disabled control remains available as a fact
without becoming an action. Shadow and ordinary DOM variants, plus a visible
disabled counterexample, guard these rules.

The decision request also keeps visible controls' current values and states as
facts when their alternative actions are offered. Native selects retain their
selected value alongside available options; checked and expanded controls
retain their state. An enabled empty option remains a valid clearing action,
and an empty current value remains observable. Stateless action duplicates are
still omitted from facts.

For `SELECT`, each offered option exposes its `target_value` separately from
its display label, including the empty string used by a legitimate clearing
option; the value is bounded to 500 characters. Weak label-only task alignment
and matched-term counts are omitted for these options, so they do not present
an empty placeholder as a goal match. Current field values remain visible in
facts, and the clearing option remains available when enabled.

The HTTP fixture integration additionally runs the production observation,
request construction, and action execution path across four local workflows:
campaign draft creation through three visible stages, encyclopedia document
navigation, a flight search with calendar selection, and filtered hotel
navigation. The campaign cases also check prerequisite `409` rejection, an
exactly once clone committed before a `503` response, preserved source data,
and independent run state. Text inputs in this offline suite are supplied by
the caller; no test presents them as JEV `aiInput` behavior. Browser requests
outside the fixture origin are aborted by the test context.

## Real-model scenes and boundaries

The live suite composes Midscene Test's public `createMidsceneNodes()` and
`createCaseRunner()` with this package's `createJevNodes()`. Midscene's native
`aiInput` supplies text; JEV handles bounded non-text actions. Each case has a
unique run ID, local server state, JEV decision events, verifier calls, and
final exact assertions. A `DONE` decision or a successful Step alone cannot
pass the case.

The four local scenes are an encyclopedia search and article open, a
three-stage campaign draft clone, a one-way Zurich → London flight search with
an interactive calendar date selection, one adult and economy results, and a Lisbon hotel search with Design and
Free cancellation filters ending at Casa Flora. The encyclopedia, flight, and
hotel task shapes are adapted from the public
[jev-ultrafast examples](https://github.com/browser-use/jev-ultrafast) and
[performance notes](https://github.com/browser-use/jev-ultrafast/blob/main/docs/performance.md).
The campaign clone is a synthetic local workflow for layered navigation,
dialog stages, preserved source data, and exactly-once creation. These fixtures
use no live business site, private data, or booking flow. Flight dates and
fixture content are local test data; this project does not reproduce the
upstream timing measurements.

The latest complete local real-model run on 2026-09-23 passed the encyclopedia,
campaign clone, and hotel cases. The flight case failed before form submission:
repeated `SELECT` decisions changed or cleared previously chosen fields, and
the fixture recorded zero result events. A prior isolated flight pass does not
count as a pass for the complete four-case run. This is one observed run, not a
statistical success rate. The live CI job remains a failing gate until all four
cases pass; the case and its independent state assertion remain enabled.

All business pages, assets, and state APIs are served from the local fixture
origin. Playwright aborts page requests to every other origin; only the model
SDK's own provider calls leave the process. This checks the intended browser
network boundary, not host-wide egress isolation. The fixture and model
processes run locally; the JEV node receives the caller-owned `Page` and does
not create, route, navigate, or close it. The calling test owns setup,
navigation, browser request blocking, and cleanup.

The flight case uses a calendar picker that JEV can operate. Native
`input[type=date]` entry through the two public Midscene `aiInput` strategies
has not yet produced a correct value in this harness; retain it as an
uncovered variant rather than recording an expected failure as a pass.

The suite does not establish success on arbitrary sites, live booking, broad
language coverage, canvas controls, untested authentication, or statistical
reliability. A fixture pass proves only the asserted state for that fixture
and provider run. Keep unsupported cases visible as failing tests or explicit
limitations; do not convert a failed or missing-config run into a skip.

## Provider setup and evidence

`pnpm test:e2e` requires the following nonempty process environment entries:
`OPENROUTER_API_KEY`, `MIDSCENE_MODEL_NAME`,
`MIDSCENE_MODEL_API_KEY`, `MIDSCENE_MODEL_BASE_URL`, and
`MIDSCENE_MODEL_FAMILY`. Supply credentials through an approved secret store or
runtime injection; never commit them or write their values to a test report.
The live harness maps the supplied OpenRouter key to JEV in the test process
and selects the compatible Decisions endpoint and `~typesafe/jev-latest` model.
The `MIDSCENE_MODEL_*` entries configure the separate Midscene text-input
model. Both JEV and Midscene must be reachable for these cases.

The command checks names before starting Vitest, sets `RUN_LIVE_MODEL_E2E=1`,
and fails with `INFRA_BLOCKED` and the *names* of missing entries if any are
absent. It never treats zero collected or skipped tests as a successful live
run. Vitest runs one worker with no retries; each case has a four-minute cap.
The CI live job has a 25-minute total cap. Each case writes sanitized JSON
evidence under `tests/e2e/.artifacts/` and writes a screenshot on failure;
preflight also writes a status JSON. The directory and Midscene's local
`midscene_run/` reports are git-ignored. Review generated reports before
sharing them outside the local workspace; CI uploads only the controlled E2E
artifact directory for seven days, even when the job fails.

The GitHub workflow runs the offline gate and a separate live job for `push`,
`pull_request`, and manual dispatch. Configure repository secrets
`OPENROUTER_API_KEY` and `MIDSCENE_MODEL_API_KEY`, plus
repository variables `MIDSCENE_MODEL_NAME`, `MIDSCENE_MODEL_BASE_URL`, and
`MIDSCENE_MODEL_FAMILY`. Fork pull requests receive no repository secrets, so
the live job fails with a visible missing-configuration result. Repository
admins must decide which required checks and trusted branches should receive
model credentials; this repository workflow alone does not configure branch
protection. A checked-in workflow is not evidence that remote CI has run.
