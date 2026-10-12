# Release-readiness evidence — 2026-10-12

## Stable consolidation follow-up

The sections below retain the original local beta.5 checkpoint. The later
owner-authorized consolidation integrates `origin/main` (`f07d22f`) and
`origin/next` (`26839d8`), preserving both previous PR heads in history, and
prepares stable `0.2.0`. Repository model Secrets/Variables were configured
with explicit permission; credential values were not committed or printed.

The owner approved replacing the second manual stable publication step with
publication after a reviewed version PR is merged into `main`, **only if**
all exact-commit/package/offline/legacy/live gates pass. No main merge or npm
publication has been performed. See [release policy](releasing.md).

### CI-green follow-up

The hotel failure below also reproduced in remote push run
[38247978879](https://github.com/KiritoKing/midscene-jev-runner/actions/runs/38247978879).
The shared decision context now explains caller-specified ordering and
prerequisites to both operation and target selection, without parsing business
steps or removing browser actions based on task wording. A terminal `DONE` or
`BLOCKED` rejected by independent verification is omitted only for that exact
observed progress marker; a changed state restores it. Independent completion
is still checked before the next decision, including delayed hidden-state
completion, and no uncertain action is replayed.

The full local gate at approximately **20:31–20:32 Asia/Shanghai** passed
**8/8 real-model cases**: all four original workflows plus native-checkbox and
ARIA-pressed toolbar ordering, reversed submit-before-toggle intent, and an
already-enabled default. Exact event order/count and the original server
assertions remain intact; no retry or maintained-suite skip was added.
`pnpm check` passed **89/89** maintained offline tests plus lint, types, build
and package smoke; legacy remains **85 passed / two historical opt-in skips**.
These are bounded regression proofs, not a statistical model reliability claim.
Latest remote CI must also pass before review/merge.

### Review-comment follow-up

Three review findings in PR #6 are addressed by shared mechanisms, not fixture
branches:

| Finding | Change | Variants and counterexamples |
| --- | --- | --- |
| Async actions without loading markup lose every settling candidate after the fixed dispatch delay | Offer WAIT for an unchanged, non-error dispatch in the current recovery epoch; use existing attempt/step/time caps and independent readback | Ordinary button and ARIA tab with a delayed callback; no idle WAIT, no settling after stale/failed/changed/old-epoch evidence, and a permanent no-op still fails without replay |
| Global number masking erases page/counter progress | Preserve exact visible text within the existing 1,200-character progress evidence budget | Numeric heading and output outside action scope; hidden numeric churn stays excluded and visible round trips retain cycle identity |
| Same-name controls share cycle/failure bans | Key edges by operation, signature and stable node plus frame/document identity | Identical cards and table rows; only the tried edge is suppressed, untried duplicates and other frame/document identities remain available |

The initial eight regressions failed on the previous implementation, then passed
after the fixes. Two additional evidence-boundary tests also pass. At approximately
**20:58–21:00 Asia/Shanghai**, the current source passed `pnpm check` (**99/99**
maintained offline tests, lint, types, build and package smoke), legacy (**85
passed / two historical opt-in skips**), and the full real-model gate (**8/8**,
no retries or scene skips). The live gate preserves all original independent
server state and exact ledger assertions.

The async regressions deliberately hold a callback beyond dispatch readback;
they are not a latency-distribution test. WAIT is a model-selectable recovery
candidate, not proof of pending work or guaranteed completion of arbitrarily long
requests. Numeric evidence remains bounded; visible volatile timers can count as
state changes, while total step/time budgets and independent verification still
bound execution. Frame/document isolation is additionally checked at candidate
construction; these tests do not claim exhaustive browser transition coverage.
Latest remote CI must be reviewed for the new commit before merging; no merge
or publication is performed here.

### Retained pre-fix consolidation evidence

A full integrated `0.2.0` live run at approximately 20:07–20:08 Asia/Shanghai
passed encyclopedia, marketing and flights but **failed hotel (3/4 overall)**.
The model searched before applying filters, then checked them only on the
results page and repeatedly returned `DONE`; the server ledger still recorded
both search filters as false. Independent completion validation rejected all
five `DONE` decisions and the recovery budget stopped the node. No hotel detail
was opened. This was a real-model reliability failure, not a passing
release gate or a fixture assertion to weaken. Evidence remains local:
[hotel failure](../tests/e2e/.artifacts/hotel-fee13dd4-80ed-4b2f-9974-d178e4a73d3d.json).
The earlier two green runs remain historical evidence, not a guarantee that a
post-merge release gate will pass. Remote CI must be reviewed before merging;
failed publication gates leave the package unpublished.

Pre-fix consolidation offline validation passed: `pnpm check` **83/83** (including
15 release-automation safety tests), `pnpm test:legacy` **85 passed / two
historical opt-in skips**, `release:verify` for `v0.2.0`, commit-message checks
and `git diff --check`. The live result above remains failing independently of
these offline passes.

Read-only repository ruleset verification found an active `main`/`next` policy:
PR required, strict `check` required, linear history (squash/rebase), no bypass
actors and no deletion/non-fast-forward updates. The live check is not currently
a required pre-merge ruleset context; review it manually before merging. The new
post-merge publication workflow nevertheless requires the full live gate.

## Original local checkpoint

Branch: `fix/0.2-release-readiness`, based on beta.5 commit `f1bd066`.
Version remains `0.2.0-beta.5`. This checkpoint is local validation, not a
merge, push, release, remote CI result, or stable-release certification.

## General mechanisms and regression scope

| Failure mechanism | Shared change | Variants and counterexamples |
| --- | --- | --- |
| Weak nearby naming climbed into a previous record and borrowed its identity | Bound ancestor lookup by the current semantic group and mirror the rule in stale-action validation | Empty links in cards and lists; explicit cross-group ARIA naming and ungrouped nearby captions remain valid |
| Associated editable-combobox suggestions were treated as a modal overlay, hiding uncovered submit actions | Nonmodal listbox association stays nonblocking; hit testing and modal ancestor constraints still apply | Ordinary and open-shadow DOM suggestions; a containing modal still excludes background controls |
| Untargeted Escape could clear caller-owned search text | Suppress unsafe dismissal evidence and recheck focused nonempty search inputs at dispatch, including frames/shadow roots | Search in ordinary DOM, shadow roots and iframes; blurred search, ordinary text input and explicit close controls remain usable |
| Operation selection lacked the target evidence available to target selection; top-three evidence could omit valid actions without lexical relevance | Operation criteria include evidence for every target in the same bounded request; no intent-keyword operation filter | Suggestions and duplicate table rows with distracting navigation; cross-language form/table targets; unrelated selects remain legal in both directions |
| Navigation/detachment invalidated observation or an uncertain action prevented independent reconciliation | One bounded retry for recognized transient observation errors only; independent completion verifier can reconcile failed post-action readback without replaying an action | Destroyed context and detached frame; closed pages, nontransient failures, cancellation, repeated failure and negative verification remain failures |
| Identically labeled assertion facts lost identity/scope in model evidence | Carry fact IDs, group IDs and layer paths alongside existing frame/visibility/coverage evidence | Separate groups/layers and child frames; hidden/covered/disabled counterevidence is not blindly removed and insufficient evidence remains indeterminate |
| Partial model override could mix another endpoint with fallback credentials | Live harness requires an atomic key/base/model triple whenever any override member is supplied | Default OpenRouter path, each partial override, complete local override without OpenRouter and whitespace-only required inputs |

Regression sources:
[semantic boundaries](../tests/integration/semantic-boundaries.test.ts),
[readback and assertion identity](../tests/integration/readback-recovery.test.ts),
[provider configuration](../tests/integration/live-model-config.test.ts).
The readback failure injections are deterministic mocks, not a claim that all
browser transition races have been reproduced. Existing real Chromium and
HTTP fixture suites additionally exercise uncertain committed responses,
independent readback and caller-owned pages.

No business-specific execution branch, fill/clear support, browser lifecycle
ownership, peer-dependency change, threshold reduction, or weakened final
assertion was added.

## Caller-side native date composition

The previous marketing caller passed ISO strings to Midscene's segmented native
date control. One typing strategy produced invalid years; another left empty
values. Public `aiKeyboardPress` nodes now focus the month segment, followed by
public `aiInput` using `typeOnly`, a caller-provided XPath hint and month/day/year
text in explicit `en-US` Chromium. No direct DOM value assignment or Playwright
fill substitutes for a native Midscene input node.

This is a scoped caller composition, **not a runner feature or a fix to the
Midscene input implementation**. Vision-only location failed for a border hit;
other locales, browser engines and date widgets remain unverified. The advance
goal explicitly asks to preserve the source defaults, as already required by
the original exact final assertions.

## Acceptance evidence

- `pnpm check`: lint, types, **68/68 maintained offline tests**, ESM/CJS/types
  build and package smoke passed.
- `pnpm test:legacy`: **85 passed, two historical opt-in live suites skipped**;
  these skips are outside the maintained real-model gate.
- Full `pnpm test:e2e`: **4/4 passed in two consecutive independent runs**,
  approximately 19:09–19:10 and 19:16–19:17 Asia/Shanghai, using JEV
  `~typesafe/jev-latest` and Midscene `deepseek-v4-flash-vision-exp`
  (family `deepseek`). No retries or scenario skips.
  Each scene recorded zero blocked outside-origin browser requests and checked
  independent server state plus visible page state. This is not host-wide
  egress isolation.

First complete green run, git-ignored local synthetic evidence:

- [Encyclopedia](../tests/e2e/.artifacts/encyclopedia-e69ad738-af78-416b-8068-6139c0a61f01.json)
- [Marketing clone](../tests/e2e/.artifacts/marketing-clone-04e2a97c-b010-40cb-b9a0-002aba7a08a7.json)
- [Flights](../tests/e2e/.artifacts/flights-5fdc5496-2e2e-40a9-8d0b-689cd6a5b86d.json)
- [Hotel](../tests/e2e/.artifacts/hotel-b5de9682-ec38-4ab7-83c1-bd0fdaf13896.json)

Second independent green run:
[Encyclopedia](../tests/e2e/.artifacts/encyclopedia-662a1116-df3c-484d-97ad-115627382954.json),
[Marketing clone](../tests/e2e/.artifacts/marketing-clone-6bc1323d-4868-4d56-8ad7-a9c74eacead1.json),
[Flights](../tests/e2e/.artifacts/flights-bbcadfe2-d729-4188-a6b0-adbfc45a9466.json),
[Hotel](../tests/e2e/.artifacts/hotel-50cec422-5750-4475-baf8-8aa8031aef60.json).
Two passes still do not establish a statistical reliability rate.

The marketing ledger asserts exactly one committed clone, exact dates and all
inherited settings, unchanged source, four validated stages and warning
configuration landing. Hotel and encyclopedia ledgers reject extra wrong-record
navigation. Flight asserts exact criteria and search count. Model `DONE` alone
cannot pass these assertions.

Earlier failure artifacts remain local, including
[operation-summary truncation](../tests/e2e/.artifacts/marketing-clone-247c7202-099f-407b-9865-b5eda6a0bafc.json):
target selection found the enabled next button while operation selection
repeatedly returned `BLOCKED`; the date fields were already correct. Retaining
this evidence avoids attributing the eventual pass to a date workaround alone.

## Models and remaining external steps

[The current-wire text-only comparison](../experiments/model-benchmark/README.md)
retains 360 measured attempts including failures. JEV remains the default;
neither clef variant improved runner results, and local laya rejects the
structured target criteria despite fast small-text decisions. No multimodal
comparison or production provider adapter was introduced.

Local gates are evidence for review of this patch, not a broad success-rate
estimate. Candidate context remains bounded; unoffered controls, arbitrary
sites, closed shadow roots, unsupported canvas controls, and other input
profiles are outside these proofs. Operation evidence duplicates target facts
within the existing 40 KB budget; budget pruning can reduce the shared
shortlist, so it does not promise all controls on a dense page are offered.

Remote CI credentials, latest integration-branch synchronization, PR conflicts,
branch protection, and human release approval still require the repository
owner's authorized integration process. No secret, credential value, private
fixture, production data, push, PR or npm publication was made by this patch.
