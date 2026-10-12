# Text-only model screening — 2026-10-12

## Reproduce

```sh
# Approved runtime injection supplies OPENROUTER_API_KEY.
# laya must already be installed and served by local Ollama.
pnpm test:models
```

This is an opt-in experiment, not a default acceptance gate. It makes no
screenshots or multimodal model requests and changes no production defaults.
The user-confirmed model is `laya:latest`, not `llava`; the installed artifact
was 846 MB, digest prefix `aaba5574a1e1`.

All hosted models use OpenRouter's public Decisions endpoint. Local laya uses
Ollama's `/v1/systemone`. Every provider receives the same sample body except
for its explicit model field. No provider-specific prompt or schema rewriting,
retries, or discarded error attempts are used.

The corpus contains 12 common-text samples (10 choices and two Noul truth
questions) and three current-runner-wire samples built by real Chromium
observation: duplicate record identity, a prerequisite checkbox, and a modal
cancel action. Gold answers are fixed before model calls. Each sample runs
three times, at concurrency 1 and 4, across four providers: 360 measured
attempts and four unmeasured warmups. Providers run sequentially, with rotated
sample order between repetitions. Concurrency is the number of in-flight
client requests, not a promised provider throughput tier.

## Current-wire result

Run completed at 2026-10-12 19:12:48 Asia/Shanghai. Corpus SHA-256:
`acc373fbcab6bcee0ecc5efc27a8c87a8899c3b2830331a10cd3b460a4530c56`.
Raw synthetic evidence remains local and git-ignored at
[1791803568839.json](../../tests/e2e/.artifacts/model-benchmark/1791803568839.json).
This supersedes the earlier screening whose operation summaries used a
smaller target subset.

Latency is rounded client wall time in milliseconds for **valid** responses,
not model-only inference time. Correctness denominators include HTTP and schema
failures. A runner sample is correct only if both operation and target match
gold. Mixed valid requests/second is calculated over the entire timed batch;
it is not runner-only throughput or correctly executed browser actions/second.

| Model | Concurrency | Common correct / 36 | Common p50 / p95 ms | Runner valid / correct / 9 | Runner p50 / p95 ms | Mixed valid req/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| JEV latest | 1 | 36 | 373 / 455 | 9 / 9 | 382 / 442 | 2.50 |
| JEV latest | 4 | 36 | 390 / 506 | 9 / 9 | 385 / 422 | 9.63 |
| clef | 1 | 36 | 540 / 1505 | 7 / 6 | 560 / 720 | 1.54 |
| clef | 4 | 36 | 558 / 1355 | 7 / 6 | 551 / 719 | 5.21 |
| clef-flash | 1 | 36 | 513 / 1670 | 7 / 2 | 552 / 582 | 1.67 |
| clef-flash | 4 | 36 | 481 / 640 | 7 / 1 | 505 / 574 | 7.33 |
| laya | 1 | 30 | 21 / 32 | 0 / 0 | unavailable | 41.39 |
| laya | 4 | 30 | 67 / 81 | 0 / 0 | unavailable | 56.98 |

All common-text responses were valid. Each clef/flash batch had two HTTP 422
failures on the modal runner sample. Laya rejected all nine runner requests per
batch with HTTP 400. A separate diagnostic of the identical synthetic request
returned `choice criteria must map option keys to descriptions or null`:
current structured target facts are not accepted by that local endpoint.
Its fast common-text latency is **not evidence of a drop-in runner speedup**.
A future portable schema/adapter would need its own explicit equivalence,
accuracy, and browser-side acceptance tests; none is installed here.

## Decision and limitations

Keep JEV as the default. Neither clef variant improved measured runner latency,
throughput, and correctness together; laya is promising for small supported
text questions but is not wire-compatible with the current runner. The
experiment intentionally succeeds when all batches are recorded, even when a
model fails: its green test is not an accuracy acceptance assertion.

Only three runner task shapes and three repetitions are screened. Results are
not statistically independent because repetitions reuse samples. No confidence
interval, hardware-normalized inference comparison, subscription-cost claim,
multimodal ranking, arbitrary-site reliability, or provider-wide capacity
claim follows from this run. Network latency and sequential provider timing
can confound comparisons. Review raw synthetic payloads before sharing;
credentials and request headers are not written to the artifact.
