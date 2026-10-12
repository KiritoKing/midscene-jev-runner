import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { observe } from '../../src/browser/observe';
import { createDecisionRequest } from '../../src/decision';

interface Sample {
  id: string;
  track: 'common-text' | 'runner-wire';
  body: { state: unknown; questions: Record<string, unknown> };
  gold: Record<string, string | boolean>;
}
interface Result {
  sample: string;
  track: string;
  ms: number;
  status: number;
  valid: boolean;
  correct: boolean;
  answers?: Record<string, unknown>;
  error?: string;
}

// Gold is fixed before calling any model. No provider-specific prompt adaptation.
const samples: Sample[] = [
  [
    'identity',
    'Open Cedar, not Maple.',
    { A: 'Maple details', B: 'Cedar details' },
    'B',
  ],
  [
    'negation',
    'Turn notifications off. They are currently on.',
    { A: 'Enable notifications', B: 'Disable notifications' },
    'B',
  ],
  [
    'scope',
    'Remove the draft, not the published item.',
    { A: 'Delete; group: Published', B: 'Delete; group: Draft' },
    'B',
  ],
  [
    'state',
    'Select Express. Express is already selected.',
    { A: 'Click Express (selected)', B: 'Done; no change needed' },
    'B',
  ],
  [
    'disabled',
    'Submit is disabled until consent is selected. Consent is unchecked.',
    { A: 'Click disabled Submit', B: 'Select Consent', C: 'Done' },
    'B',
  ],
  [
    'dependency',
    'Continue requires an account. An account picker is available; Continue is disabled.',
    { A: 'Open account picker', B: 'Click disabled Continue', C: 'Done' },
    'A',
  ],
  [
    'modal',
    'A modal covers the page. Close it without submitting.',
    { A: 'Confirm modal', B: 'Close modal', C: 'Click covered page Search' },
    'B',
  ],
  [
    'direction',
    'The checkbox is checked. Keep it checked.',
    { A: 'Toggle checkbox off', B: 'Done; leave unchanged' },
    'B',
  ],
  [
    'zh-scope',
    '打开杉木条目，不要打开枫木条目。',
    { A: '枫木详情', B: '杉木详情' },
    'B',
  ],
  [
    'zh-negation',
    '不要提交，只关闭对话框。',
    { A: '确认并提交', B: '关闭对话框' },
    'B',
  ],
].map(([id, state, criteria, gold]) => ({
  id: String(id),
  track: 'common-text',
  body: {
    state,
    questions: {
      target: {
        type: 'choice',
        instructions:
          'Choose the safe next action satisfying the user goal and observed state.',
        criteria,
      },
    },
  },
  gold: { target: String(gold) },
}));
for (const [id, state, gold] of [
  ['true', 'The Subscribe checkbox is visibly checked.', true],
  ['false', 'The Subscribe checkbox is visibly unchecked.', false],
] as const)
  samples.push({
    id: `assert-${id}`,
    track: 'common-text',
    body: {
      state,
      questions: {
        truth: {
          type: 'noul',
          instructions: 'Is Subscribe checked?',
          criteria: {
            true: 'Subscribe is checked',
            false: 'Subscribe is not checked',
          },
        },
      },
    },
    gold: { truth: gold },
  });

it('measures text-only decision models without changing production defaults', async () => {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error('OPENROUTER_API_KEY required');
  const repetitions = Number(process.env.MODEL_BENCH_REPEATS || 3);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20)
    throw new Error('Invalid repetitions');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [id, html, goal, target] of [
      [
        'duplicate',
        '<ul><li>Cedar <button>Open</button></li><li>Maple <button>Open</button></li></ul>',
        'Open Cedar',
        'Cedar',
      ],
      [
        'dependency',
        '<label>Consent<input type="checkbox"></label><button disabled>Submit</button>',
        'Select Consent before submitting',
        'Consent',
      ],
      [
        'layer',
        '<button>Search</button><dialog open aria-modal="true"><button>Cancel</button><button>Confirm</button></dialog>',
        'Cancel the dialog without confirming',
        'Cancel',
      ],
    ]) {
      await page.setContent(html);
      const snapshot = await observe(page, goal);
      const request = createDecisionRequest(snapshot, goal);
      const entry = Object.entries(request.targets.CLICK || {}).find(
        ([, action]) =>
          action.label.includes(target) ||
          action.localContext?.includes(target),
      );
      if (!entry) throw new Error(`Missing gold target ${id}`);
      samples.push({
        id: `runner-${id}`,
        track: 'runner-wire',
        body: request.body,
        gold: { operation: 'CLICK', click_target: entry[0] },
      });
    }
  } finally {
    await browser.close();
  }
  const providers = [
    {
      model: '~typesafe/jev-latest',
      url: 'https://openrouter.ai/api/alpha/decisions',
      key: process.env.OPENROUTER_API_KEY,
    },
    {
      model: 'cloudflare/clef',
      url: 'https://openrouter.ai/api/alpha/decisions',
      key: process.env.OPENROUTER_API_KEY,
    },
    {
      model: 'cloudflare/clef-flash',
      url: 'https://openrouter.ai/api/alpha/decisions',
      key: process.env.OPENROUTER_API_KEY,
    },
    {
      model: 'laya',
      url: 'http://localhost:11434/v1/systemone',
      key: 'ollama',
    },
  ];
  const call = async (
    provider: (typeof providers)[number],
    sample: Sample,
  ): Promise<Result> => {
    const start = performance.now();
    let status = 0;
    try {
      const response = await fetch(provider.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.key}`,
        },
        body: JSON.stringify({ ...sample.body, model: provider.model }),
        signal: AbortSignal.timeout(60_000),
      });
      status = response.status;
      if (!response.ok)
        return {
          sample: sample.id,
          track: sample.track,
          ms: performance.now() - start,
          status,
          valid: false,
          correct: false,
          error: 'http-error',
        };
      const result = await response.json();
      const answers = result.answers;
      const valid = Object.entries(sample.gold).every(([name, gold]) => {
        const a = answers?.[name];
        if (typeof gold === 'boolean')
          return (
            a?.type === 'noul' &&
            Number.isFinite(a.noul) &&
            a.noul >= 0 &&
            a.noul <= 1
          );
        const question = sample.body.questions[name] as {
          criteria: Record<string, unknown>;
        };
        return (
          a?.type === 'choice' &&
          typeof a.choice === 'string' &&
          Object.hasOwn(question.criteria, a.choice)
        );
      });
      const correct =
        valid &&
        Object.entries(sample.gold).every(([name, gold]) =>
          typeof gold === 'boolean'
            ? answers[name].noul >= 0.5 === gold
            : answers[name].choice === gold,
        );
      return {
        sample: sample.id,
        track: sample.track,
        ms: performance.now() - start,
        status,
        valid,
        correct,
        answers,
      };
    } catch (error) {
      return {
        sample: sample.id,
        track: sample.track,
        ms: performance.now() - start,
        status,
        valid: false,
        correct: false,
        error: error instanceof Error ? error.name : 'unknown',
      };
    }
  };
  const runs = [];
  // Sequential providers avoid local load cross-contamination. Rotate case order
  // across repetitions; every error stays in the attempted denominator. No retry.
  for (const provider of providers) {
    const warmup = await call(provider, samples[0]);
    for (const concurrency of [1, 4]) {
      const results: Result[] = [];
      const queue = Array.from({ length: repetitions }, (_, r) => [
        ...samples.slice(r),
        ...samples.slice(0, r),
      ]).flat();
      let next = 0;
      const start = performance.now();
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (next < queue.length) {
            const sample = queue[next++];
            results.push(await call(provider, sample));
          }
        }),
      );
      const elapsedMs = performance.now() - start;
      const summary = ['common-text', 'runner-wire'].map((track) => {
        const subset = results.filter((r) => r.track === track);
        const latency = subset
          .filter((r) => r.valid)
          .map((r) => r.ms)
          .sort((a, b) => a - b);
        const percentile = (p: number) =>
          latency.length ? latency[Math.ceil(latency.length * p) - 1] : null;
        return {
          track,
          attempted: subset.length,
          valid: subset.filter((r) => r.valid).length,
          correct: subset.filter((r) => r.correct).length,
          p50Ms: percentile(0.5),
          p95Ms: percentile(0.95),
        };
      });
      runs.push({
        model: provider.model,
        concurrency,
        elapsedMs,
        attemptedPerSecond: (results.length / elapsedMs) * 1000,
        validPerSecond:
          (results.filter((r) => r.valid).length / elapsedMs) * 1000,
        warmup,
        summary,
        results,
      });
      console.log(
        JSON.stringify({ model: provider.model, concurrency, summary }),
      );
    }
  }
  const dir = resolve('tests/e2e/.artifacts/model-benchmark');
  await mkdir(dir, { recursive: true });
  await writeFile(
    resolve(dir, `${Date.now()}.json`),
    `${JSON.stringify({ timestamp: new Date().toISOString(), repetitions, corpusSha256: createHash('sha256').update(JSON.stringify(samples)).digest('hex'), samples, runs }, null, 2)}\n`,
  );
  expect(runs).toHaveLength(providers.length * 2);
}, 1_200_000);
