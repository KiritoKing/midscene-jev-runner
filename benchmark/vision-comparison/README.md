# Reproducible vision comparison (not measured results)

This public synthetic corpus contains no real user data or business fixtures.
No live result is claimed by adding these files. Credential readiness is required
before running either script. Neither script creates credentials or accounts.
Do not commit results, secrets, reports, environment files, or provider bodies
without reviewing them. Result paths are caller supplied; prefer the existing
ignored `tests/e2e/.artifacts` directory.

## What can be compared

1. `probe.mjs`: matched screenshot Noul decisions. Four assertion tasks × three
   fixed layout/state seeds × each configured model, plus one excluded positive
   smoke per model. Every model receives the exact same PNG and question. This
   isolates evidence and question, not provider hardware or network. It is **not
   a runner comparison**. The independent binary threshold is 0.5.
2. `system.mjs`: public runner API comparison on eight tasks × three seeds, plus
   one excluded smoke. Each side gets a fresh identical Chromium page, viewport,
   goal and independent completion oracle. Our actions use DOM context; visual
   assertions use screenshot-only evidence; official visual APIs use screenshots.
   This is an **end-to-end system comparison**, not an isolated model ranking.
   Never combine DOM and screenshot rows into a single capability score.
3. Canvas action is an extension cell: our runner has no visual action API in
   this change. Record unsupported, never failure or success. Jev 1.13 supports
   image Noul but not Box. Official action profiles using that version must use
   an explicitly recorded generic Locate model or exclude Box-dependent tasks.
   Generic model calls, latency and cost belong in the total.
4. Clef is valid in the direct screenshot probe and in our explicit OpenRouter
   visual transport. It is NOT a supported official native
   visual cell merely by setting family `jev`: official v1.16.0 puts image parts
   in a nested state object, whereas Clef requires top-level array image parts.
   A patched adapter would be a separately labelled experiment, not official.

## Tasks and gold

`fixtures.mjs` defines DOM identity, prerequisite, unchanged-state and condition
cases; canvas presence, absence, conditional color and click-target cases. Seeds
17, 29 and 43 change positions/order/state, not model random seeds. Gold is fixed
in the harness before calls. Assertions compare against fixture truth. Actions
must satisfy the independent event oracle; model DONE is not completion. Wrong
record opens, toggles and canvas hit-tests record misclicks. Never pass fixture
source, expected truth, oracle functions or gold coordinates to model inputs.
These tiny fixtures test mechanisms, not arbitrary-site generalization.

## Reproduce

Install the repository's pinned dependencies and Chromium using its documented
setup, then build. Use existing securely injected credentials only.

```sh
node --test benchmark/vision-comparison/fixtures.test.mjs
pnpm build
RUN_VISION_BENCHMARK=1 node benchmark/vision-comparison/probe.mjs \
  benchmark/vision-comparison/profiles.example.json tests/e2e/.artifacts/probe.json
RUN_VISION_BENCHMARK=1 node benchmark/vision-comparison/system.mjs \
  benchmark/vision-comparison/system.example.json tests/e2e/.artifacts/system.json
node benchmark/vision-comparison/report.mjs tests/e2e/.artifacts/probe.json
```

Copy system.example.json per cell, retain only env **names** for secrets, and use
`runner: "official"` for the installed public PlaywrightAgent. Its env map must
contain the complete generic MIDSCENE_MODEL_{NAME,API_KEY,BASE_URL,FAMILY} and
explicit complete MIDSCENE_{PLANNING,LOCATE,INSIGHT}_MODEL_* role settings used
by that cell. Jev role family is `jev`, direct base is
`https://api.typesafe.ai/v1`. Default model must be a supported generic model;
Jev cannot be the default. Pin official package version 1.16.0 in the manifest
for Jev roles; the historical 1.13.0 install is not a Jev baseline. Do not silently
inherit a different role or credential from the shell. Set profile rates by
**resolved model name** for every generic and decision model or total estimated
cost remains unknown. Exclusions are an explicit `excludeTasks` reason map.

Run system profiles in rotated order across repetitions for serious comparison;
the standalone script groups one profile, so sequential invocations can confound
provider time/load. Preserve commit, lockfile hash, package versions, UTC time,
profile ID, resolved model/provider, hardware region and screenshot hashes with
reported results. An alias may move: split results when resolved version changes.

## Budgets and interpretation

Concurrency is one; actions have eight steps/replanning cycles and 60 seconds;
individual requests have 30 seconds where the public API allows. Our transport
may retry once; probe does not retry. Disable caches and configure official retry
count at most one and timeout 30000 in each complete role config. Stop a cell
on smoke failure or authentication/payment/provider failure; do not fill remaining
rows as accuracy failures, and do not keep retrying. Keep task errors in the
measured denominator. Unsupported cells are excluded and listed separately.

Report numerator/denominator, unknown/indeterminate count, negative count and
false-positive count, task success, misclicks, all requests and delegations,
request-wall and end-to-end p50/p95, input/output tokens, image/request bytes,
actual provider-reported cost separately from rate-card estimate. Missing metrics
are null, never zero. Request wall time and official totalTimeCostMs are NOT
pure inference time; inference is unavailable without provider timing. Our
request instrumentation includes retry attempts; official metrics can omit
failed-request usage and do not expose delegation counts, so those totals need
provider reconciliation before a cost superiority claim. Small-sample p95 is
nearly the maximum; three seeds are not a confidence interval or reliability SLA.
Native assertion policy (confidence/evidence thresholds) differs from official
boolean policy: report native behavior and use the matched probe for 0.5-threshold
model accuracy rather than changing thresholds to improve scores.

## Verified provider facts (2026-10-21)

- [TypeSafe models](https://docs.typesafe.ai/models): direct IDs `jev-1.14.0`
  and `jev-1.13.0`; `jev-latest` currently documented as 1.13.0, but resolve at
  run time. Both $0.042/M input, output free. TypeSafe lists Jev, not Clef.
- [TypeSafe images](https://docs.typesafe.ai/images) and
  [Box](https://docs.typesafe.ai/primitives/box): both versions accept experimental
  images with the image header; only 1.14 supports Box. Assets/reference encoding
  is direct-TypeSafe protocol. Box alone is not a presence test.
- [Cloudflare Clef](https://developers.cloudflare.com/workers-ai/models/clef/):
  hosted ID `@cf/cloudflare/clef`, body selector `clef`; 27B multimodal model,
  65,536 context, $0.24/M input, output free. Media becomes input tokens, not
  base64-text tokens. This is Clef, not Clef-flash or Clef-omni.
- [OpenRouter Clef](https://openrouter.ai/cloudflare/clef): model
  `cloudflare/clef`; rates differ by provider (Cloudflare $0.24/M, Prime Intellect
  $0.042/M at inspection). Pin provider and record the returned route.
- [OpenRouter image wire](https://openrouter.ai/docs/guides/community/multimodal-decisions):
  Decisions endpoint accepts image_url data parts; Clef needs top-level state
  array, TypeSafe assets are ignored. Native-format body reuse would be invalid. The route documents a roughly 300 KB image ceiling and roughly 2k text-state truncation for Cloudflare Clef; keep corpus inputs below these limits and record payload bytes.
- [Official role configuration](https://v1.midscenejs.com/model-common-config)
  and [v1.16.0 transport source](https://github.com/web-infra-dev/midscene/blob/v1.16.0/packages/core/src/ai-model/service-caller/system-one.ts)
  establish the generic default requirement and nested-image limitation above.

## Existing benchmark fit

`experiments/model-benchmark` is text-only provider screening, not visual or
end-to-end evidence. `experiments/context-benchmark` isolates observation/context
with its own executor; older input support is not current package coverage.
Reuse their methodological separation, not their historical numbers as current
baseline results. This folder deliberately keeps the new corpus independent.
