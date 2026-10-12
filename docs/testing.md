# Scene testing

The maintained test gate has two layers. `pnpm check` runs static checks, the
offline Chromium scene integration suite, the build, and the package smoke test.
`pnpm test:e2e` runs four local workflows through real JEV and Midscene model
requests, plus four real-JEV ordered-action variants/counterexamples, when
credentials are configured. The legacy unit and experimental tests remain available through
`pnpm test:legacy`, but are outside the maintained gate.

| Command | Model requests | What passing means |
| --- | --- | --- |
| `pnpm test:integration` (also `pnpm test`) | None | Real Chromium observations, candidate selection, action execution, stale-state guards, and independent readback work on controlled local pages. The decision transport is deterministic. |
| `pnpm check` | None | Lint, types, scene integration, build, and package smoke pass. It does not establish model accuracy. |
| `pnpm test:e2e` | Real JEV and Midscene requests | All configured local workflows passed in that run with independent state and visible page assertions. A passing run is not a reliability or speed estimate. |
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

The maintained offline suite exercises hidden stale copies, weak semantic
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
request construction, and action execution path across local workflows:
a marketing clone through four validated forms, difference confirmation and
warning configuration landing; encyclopedia document navigation; a flight
search with calendar selection; and filtered hotel navigation. The marketing
cases also check prerequisite `409` rejection, an exactly once clone committed
before a `503` response, preserved source data, cached tab behavior, and
independent run state. Text inputs in this offline suite are supplied by
the caller; no test presents them as JEV `aiInput` behavior. Browser requests
outside the fixture origin are aborted by the test context.

## Review recovery regressions

The maintained review regressions cover three generic mechanisms: bounded WAIT
candidates after unchanged successful dispatch readback without loading markup,
visible numeric-only progress, and cycle/failure suppression scoped to actual
node/frame/document identity rather than a shared label signature. Variants use
ordinary buttons and ARIA tabs, numeric headings and outputs, and identical
cards and table rows. Counterexamples keep idle/stale/failed/old-epoch waiting
unavailable, reject permanent no-ops without replay or false completion, exclude
hidden numeric churn, and retain untried duplicate controls across identities.

Delayed callbacks are controlled deterministically beyond the dispatch settle;
this does not measure network latency. WAIT remains bounded and model-selected,
not completion proof. Numeric progress evidence is still text-budgeted and may
include volatile visible timers; overall step/time budgets and independent
verification remain mandatory. These offline tests do not establish model accuracy.

## Real-model scenes and boundaries

The live suite composes Midscene Test's public `createMidsceneNodes()` and
`createCaseRunner()` with this package's `createJevNodes()`. Midscene's native
`aiInput` supplies text; JEV handles bounded non-text actions. Each case has a
unique run ID, local server state, JEV decision events, verifier calls, and
final exact assertions. A `DONE` decision or a successful Step alone cannot
pass the case.

The four local scenes are an encyclopedia search and article open, a
six-stage marketing clone process ending at warning configuration, a one-way
Zurich → London flight search with an interactive calendar date selection, and
a Lisbon hotel search with Design and Free cancellation filters ending at Casa
Flora. The encyclopedia, flight, and
hotel task shapes are adapted from the public
[jev-ultrafast examples](https://github.com/browser-use/jev-ultrafast) and
[performance notes](https://github.com/browser-use/jev-ultrafast/blob/main/docs/performance.md).
The campaign clone is a synthetic local workflow for layered navigation,
cached tabs, table operations, validated form stages, preserved source data,
and exactly-once creation. These fixtures
use no live business site, private data, or booking flow. Flight dates and
fixture content are local test data; this project does not reproduce the
upstream timing measurements.

An earlier 2026-09-23 real-model run used the previous, simpler fixture: its
flight case failed before submission after repeated `SELECT` decisions changed
or cleared prior fields. That result does not validate the rebuilt fixtures.
Keep any failure and its independent zero-write/readback evidence visible; do
not turn it into a skip or claim a passing suite from a previous fixture
revision.

The 2026-09-23 full live run against the rebuilt fixtures failed all four
cases; it is retained under `tests/e2e/.artifacts/`. In encyclopedia, JEV
dismissed a nonexistent overlay and then returned `BLOCKED` without a search
event. In marketing, JEV opened the clone wizard, but Midscene `aiInput`
entered invalid values into the native date controls; repeated Next clicks
left the wizard at step 1 with zero copies. In hotel, JEV searched before
selecting the two filters, then selected them on the results page and returned
`DONE`; the independent server state still had both filters false, so
completion verification rejected it. The flight case was interrupted by a
test verifier selector that expected an input instead of the fixture's cabin
select. After correcting that test selector, one targeted live flight rerun
passed with four independently verified JEV nodes, exact ZRH–LHR one-way
criteria, five results, one search event, and zero blocked browser requests.
The targeted pass does not turn the four-case full run green. Evidence files:
`encyclopedia-6022332c-851d-44f1-ba58-1a47507c021a.json`,
`marketing-clone-b74d8acc-9fd6-47be-afc7-4ccb0b9ceca7.json`,
`hotel-868d71a8-e9b6-46aa-a774-4cdd83ba5bab.json`, and targeted success
`flights-6f7c9dcc-6210-496b-8d07-5a44bc0d9b70.json` in that directory.

All business pages, assets, and state APIs are served from the local fixture
origin. Playwright aborts page requests to every other origin; only the model
SDK's own provider calls leave the process. This checks the intended browser
network boundary, not host-wide egress isolation. The fixture and model
processes run locally; the JEV node receives the caller-owned `Page` and does
not create, route, navigate, or close it. The calling test owns setup,
navigation, browser request blocking, and cleanup.

The flight case uses Midscene `aiInput` for city text, then JEV selects the
observed airport suggestions and operates the calendar. The marketing caller
now uses public `aiKeyboardPress` nodes to focus the month segment and public
`aiInput` with `mode: 'typeOnly'` to enter month/day/year values. Its location
hint is a caller-provided XPath and its Chromium locale is explicitly `en-US`.
JEV neither fills nor clears these inputs. This verifies that public-node
composition profile, **not** a fix to Midscene's ISO-date typing or proof that
vision-only location, every locale, or other browsers work.

On 2026-10-12 the full four-case live gate passed in two consecutive independent
runs with JEV `~typesafe/jev-latest` and Midscene
`deepseek-v4-flash-vision-exp`. Exact event ledgers, preserved source
configuration, date values, and exactly-once clone assertions were retained.
The caller goal now explicitly requests preserving inherited settings,
matching the pre-existing assertion contract. These two successful runs do not
establish a measured reliability rate. Earlier failures above remain evidence;
the [local release-readiness report](https://github.com/KiritoKing/midscene-jev-runner/blob/main/docs/release-readiness-2026-10-12.md) records
mechanisms, regression variants, and current boundaries. A later full stable
consolidation run at 20:07–20:08 passed only 3/4: hotel searched before applying
filters and repeated `DONE` despite independent negative verification. This
pre-fix model failure is retained in that report; it was not converted to a
skip or a successful release gate.

The follow-up shared decision context explains explicit temporal intent to
operation and target selection without hard-filtering actions by task wording.
Independent rejection of `DONE`/`BLOCKED` suppresses only that terminal judgment
in the same observed state; changed state restores it, and delayed independent
completion is checked before replanning. The full local gate at approximately
20:31–20:32 passed **8/8** cases. The added real-model cases use native checkboxes
and an ARIA-pressed toolbar, plus reversed order and an already-enabled default;
exact event ledgers reject early/duplicate submissions and unrelated toggles.
They are caller-owned synthetic pages, not native text-input tests. No original
workflow assertion was weakened, and these passes do not estimate statistical
reliability.

The suite does not establish success on arbitrary sites, live booking, broad
language coverage, canvas controls, untested authentication, or statistical
reliability. A fixture pass proves only the asserted state for that fixture
and provider run. Keep unsupported cases visible as failing tests or explicit
limitations; do not convert a failed or missing-config run into a skip.

## Provider setup and evidence

`pnpm test:e2e` always requires nonempty `MIDSCENE_MODEL_NAME`,
`MIDSCENE_MODEL_API_KEY`, `MIDSCENE_MODEL_BASE_URL`, and
`MIDSCENE_MODEL_FAMILY`. Without a JEV override it also requires
`OPENROUTER_API_KEY` and selects OpenRouter Decisions with
`~typesafe/jev-latest`. To test another JEV provider, explicitly supply the
complete triple `MIDSCENE_JEV_API_KEY`, `MIDSCENE_JEV_BASE_URL`, and
`MIDSCENE_JEV_MODEL_NAME`. Any nonempty member activates the override;
partial triples fail preflight, even if an OpenRouter key is also present.
This avoids sending one provider's key to another provider's fallback endpoint.
Quote model names beginning with `~` in shells that expand them.

Supply credentials through an approved secret store or runtime injection;
never commit them or write their values to a test report. The separate
`MIDSCENE_MODEL_*` entries configure native text-input nodes. Both models must
be reachable. Explicit configuration does not prove protocol compatibility:
the current runner wire has structured target criteria and instructions.
`pnpm test:models` screens text-only models separately; see the
[benchmark methodology and results](https://github.com/KiritoKing/midscene-jev-runner/blob/main/experiments/model-benchmark/README.md).

The command checks names before starting Vitest, sets `RUN_LIVE_MODEL_E2E=1`,
and fails with `INFRA_BLOCKED` and the *names* of missing entries if any are
absent. It never treats zero collected or skipped tests as a successful live
run. Vitest runs one worker with no retries; the marketing case has a bounded
seven-minute cap and each other case has a bounded five-minute cap, consistent
with their JEV node budgets and Midscene text-input steps.
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
