import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { fixture, mount, seeds, tasks, viewport } from './fixtures.mjs';

// No network request is made without an explicit live switch and complete profile.
const [configPath, outputPath] = process.argv.slice(2);
if (!configPath || !outputPath || process.env.RUN_VISION_BENCHMARK !== '1') {
  throw new Error(
    'Usage: RUN_VISION_BENCHMARK=1 node benchmark/vision-comparison/probe.mjs profiles.json results.json',
  );
}
const profiles = JSON.parse(await readFile(configPath, 'utf8'));
for (const p of profiles) {
  if (
    !['typesafe', 'openrouter'].includes(p.protocol) ||
    !p.model ||
    !p.keyEnv ||
    !process.env[p.keyEnv]
  )
    throw new Error(`Incomplete profile: ${p.id}`);
  const expected =
    p.protocol === 'typesafe'
      ? 'https://api.typesafe.ai/v1/systemone'
      : 'https://openrouter.ai/api/alpha/decisions';
  if (p.endpoint !== expected) throw new Error(`Unverified endpoint: ${p.id}`);
}
await mkdir(dirname(outputPath), { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const stopped = new Set();
const assertions = tasks.filter((t) => t.kind === 'assertion');
const corpus = [];
try {
  // Capture once, replay byte-identical images to every model. No gold in prompts.
  for (const seed of [0, ...seeds])
    for (const task of assertions) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
      const sample = fixture(task, seed);
      await mount(page, sample);
      const png = await page.screenshot({ type: 'png' });
      corpus.push({
        task,
        seed,
        truth: sample.truth,
        png,
        hash: createHash('sha256').update(png).digest('hex'),
      });
      await page.close();
    }
  // A single positive smoke per profile. All measured attempts have rotated order.
  const schedule = [
    corpus.find((s) => s.seed === 0 && s.task.id === 'canvas-present'),
    ...corpus.filter((s) => s.seed !== 0),
  ];
  for (let i = 0; i < schedule.length; i++) {
    const sample = schedule[i];
    for (let j = 0; j < profiles.length; j++) {
      const p = profiles[(i + j) % profiles.length];
      if (stopped.has(p.id)) continue;
      const ref = randomUUID();
      const questions = {
        truth: { type: 'noul', instructions: sample.task.goal },
      };
      const base64 = sample.png.toString('base64');
      const body =
        p.protocol === 'typesafe'
          ? {
              model: p.model,
              state: { screenshot: ref },
              assets: {
                [ref]: { type: 'image', format: 'png', data_base64: base64 },
              },
              questions,
            }
          : {
              model: p.model,
              state: [
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${base64}` },
                },
              ],
              questions,
              ...(p.provider
                ? { provider: { only: [p.provider], allow_fallbacks: false } }
                : {}),
            };
      const serialized = JSON.stringify(body);
      const row = {
        profile: p.id,
        requestedModel: p.model,
        task: sample.task.id,
        seed: sample.seed,
        smoke: sample.seed === 0,
        track: 'matched-screenshot-noul',
        imageSha256: sample.hash,
        imageBytes: sample.png.length,
        requestBytes: Buffer.byteLength(serialized),
        truth: sample.truth,
        status: 'error',
        inferenceMs: null,
        inferenceSource: 'unavailable',
        costActualUsd: null,
        costEstimatedUsd: null,
      };
      const started = performance.now();
      try {
        const response = await fetch(p.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env[p.keyEnv]}`,
            'Content-Type': 'application/json',
            ...(p.protocol === 'typesafe'
              ? { 'TypeSafe-Danger-Zone-Images': 'true' }
              : {}),
          },
          body: serialized,
          signal: AbortSignal.timeout(30_000),
        });
        row.httpStatus = response.status;
        if (!response.ok) {
          row.error = 'provider-http-error';
          // No repeated authentication, payment, schema, rate-limit or provider failures.
          stopped.add(p.id);
        } else {
          const raw = await response.json();
          const probability = raw.answers?.truth?.noul;
          if (
            raw.answers?.truth?.type !== 'noul' ||
            !Number.isFinite(probability) ||
            probability < 0 ||
            probability > 1
          )
            throw new Error('invalid-schema');
          row.status = 'ok';
          row.resolvedModel = raw.model ?? null;
          row.provider = raw.provider ?? p.provider ?? null;
          row.probability = probability;
          row.prediction = probability >= 0.5;
          row.correct = row.prediction === sample.truth;
          row.falsePositive = row.prediction && !sample.truth;
          row.inputTokens = raw.usage?.input_tokens ?? null;
          row.outputTokens = raw.usage?.output_tokens ?? null;
          row.costActualUsd = Number.isFinite(raw.usage?.cost)
            ? raw.usage.cost
            : null;
          row.costEstimatedUsd =
            Number.isFinite(row.inputTokens) &&
            Number.isFinite(row.outputTokens) &&
            Number.isFinite(p.inputUsdPerMillion) &&
            Number.isFinite(p.outputUsdPerMillion)
              ? (row.inputTokens * p.inputUsdPerMillion +
                  row.outputTokens * p.outputUsdPerMillion) /
                1e6
              : null;
          if (row.smoke && !row.correct) stopped.add(p.id);
        }
      } catch {
        row.error = 'transport-or-schema-error';
        stopped.add(p.id);
      } finally {
        row.requestWallMs = performance.now() - started;
        results.push(row);
        await writeFile(
          outputPath,
          JSON.stringify(
            {
              schemaVersion: 1,
              createdAt: new Date().toISOString(),
              rows: results,
              plannedMeasuredAttempts:
                assertions.length * seeds.length * profiles.length,
              stoppedProfiles: [...stopped],
            },
            null,
            2,
          ),
        );
      }
    }
  }
} finally {
  await browser.close();
}
console.log(
  JSON.stringify({
    attempts: results.length,
    plannedMeasuredAttempts: assertions.length * seeds.length * profiles.length,
    stoppedProfiles: [...stopped],
    outputPath,
  }),
);
