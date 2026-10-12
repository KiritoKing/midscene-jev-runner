# JEV context strategy comparison

## Scope and controls

The comparison uses ten local Playwright fixtures and a real JEV decision
endpoint. Every strategy receives the same goal, page, viewport, execution
logic, completion oracle, model route, candidate rendering limit, and retry
policy. The fixtures cover weak semantics, duplicate labels, more than 300
visible controls, repeated cards, a portalled listbox, blocking-layer recovery,
disabled and covered controls, dynamic rerendering, iframe plus open Shadow DOM,
and a nested scroll container.

No fixture contacts an external website or business system. `oracleId` is used
only by the benchmark verifier and is never rendered into a model request.

## Phase 1: four strategies, one paired run per fixture

Source: [`phase1-v4.json`](./phase1-v4.json)

| Strategy | Runs passed | Target recall | Target top-1 | Recovery success | Avg context bytes | Avg calls | Avg input tokens | Avg latency | Provider-reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frozen v0.1.2 flat DOM | 6/10 | 60.0% | 28.3% | 66.7% | 5,265.4 | 1.5 | 2,402.0 | 707.6 ms | $0.001008840 |
| Ranked high-recall DOM | 7/10 | 80.0% | 73.3% | 66.7% | 8,988.6 | 1.4 | 4,369.1 | 586.7 ms | $0.001835022 |
| Hybrid, flat decision | 10/10 | 100% | 83.3% | 100% | 8,479.8 | 1.9 | 3,959.2 | 828.8 ms | $0.001662864 |
| Hybrid, adaptive two-stage | 10/10 | 100% | 83.3% | 100% | 8,479.8 | 2.1 | 3,983.0 | 959.5 ms | $0.001672860 |

The frozen baseline missed weak semantics, targets after the flat candidate
budget, iframe/open-shadow targets, and nested scrolling. Ranking alone fixed
the large-page and repeated-label cases but still lacked non-actionable facts,
frame/shadow traversal, and container recovery.

## Finalists: three paired repeats

Source: [`finalists-3x.json`](./finalists-3x.json)

| Strategy | Runs passed | Recall | Top-1 | Recovery | Avg calls | Avg input tokens | Avg latency | Provider-reported cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Hybrid, flat decision | 30/30 | 100% | 83.3% | 100% | 1.9 | 3,959.2 | 815.9 ms | $0.004988592 |
| Hybrid, adaptive two-stage | 30/30 | 100% | 83.3% | 100% | 2.1 | 3,983.0 | 891.0 ms | $0.005018580 |

The two-stage selector did not improve correctness on this matrix. It added a
model call on ambiguous/large pages, so the default winner is the hybrid
perception model with a single globally ranked decision request. Two-stage
selection remains an experiment, not a production default.

## Production integration

The winning strategy was reimplemented in the production runner rather than
shipping the benchmark adapter. The production path now provides:

- a fact layer separate from executable actions, retaining disabled and covered
  controls without allowing the model to execute them;
- DOM semantic fallbacks with name source and confidence, local form/card/row
  context, CJK-aware goal ranking, and a hard 24-candidate decision budget;
- explicit page/dialog/popover/menu/listbox layer paths, including portal
  ownership through `aria-controls` and `aria-owns`;
- every Playwright frame plus open Shadow DOM, with frame-local selectors and a
  freshness/hit-test check immediately before execution;
- nested scroll-container actions and progress markers that include container
  scroll positions;
- stable semantic action signatures, same-state cycle suppression, and
  verifier-gated `DONE`/`BLOCKED`;
- `WAIT` only when observable loading state exists;
- page-summary copies stripped of scripts, styles, templates, and hidden or
  `aria-hidden` content before model submission.

Final production source: [`production-final-v4-3x.json`](./production-final-v4-3x.json)

| Metric | Result |
| --- | ---: |
| Completed | 30/30 |
| Decision calls | 48 total, 1.6 per run |
| Action errors | 0 |
| Stale executions | 0 |
| Rejected `DONE` / `BLOCKED` | 0 / 0 |
| Input / output tokens | 177,183 / 4,677 |
| Average elapsed time | 1,373.5 ms |
| Provider-reported cost | $0.007441686 total |

All three repeats used the minimum task action count for every fixture: 1 step
for weak semantics, duplicate labels, the 300+ candidate page, repeated cards,
and frame/shadow; 2 for disabled-state transition, rerender, layer recovery,
and nested scroll; 3 for the nested portal workflow.

## Decision and limits

The selected production solution is **hybrid DOM semantics + geometry/hit-test
+ layer stack + global goal-aware ranking + a single JEV decision**.

These results are controlled evidence, not a universal success-rate claim. The
matrix does not cover closed Shadow DOM, canvas-only controls, OCR/visual
grounding, file upload, new-window coordination, or arbitrary cross-origin
frame restrictions. It also does not replace a future real-site/BOE acceptance
run. Latency and provider-reported cost are route- and time-dependent; the
paired correctness comparison is the stronger result.
