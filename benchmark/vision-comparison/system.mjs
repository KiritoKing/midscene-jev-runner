import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { fixture, mount, seeds, tasks, viewport } from './fixtures.mjs';

const [configPath, outputPath] = process.argv.slice(2);
if (!configPath || !outputPath || process.env.RUN_VISION_BENCHMARK !== '1')
  throw new Error(
    'Usage: RUN_VISION_BENCHMARK=1 node benchmark/vision-comparison/system.mjs system-profile.json results.json',
  );
const profile = JSON.parse(await readFile(configPath, 'utf8'));
if (!['ours', 'official'].includes(profile.runner))
  throw new Error('Unknown runner');
// Secret values are resolved only at runtime. No config, headers or response bodies are saved.
const config = Object.fromEntries(
  Object.entries(profile.env ?? {}).map(([name, value]) => [
    name,
    typeof value === 'object' ? process.env[value.fromEnv] : value,
  ]),
);
if (Object.values(config).some((v) => !v))
  throw new Error('Incomplete environment profile');
const required =
  profile.runner === 'ours'
    ? [
        'MIDSCENE_JEV_API_KEY',
        'MIDSCENE_JEV_MODEL_NAME',
        'MIDSCENE_JEV_BASE_URL',
      ]
    : [
        'MIDSCENE_MODEL_API_KEY',
        'MIDSCENE_MODEL_NAME',
        'MIDSCENE_MODEL_BASE_URL',
        'MIDSCENE_MODEL_FAMILY',
      ];
if (profile.runner === 'official') {
  if (config.MIDSCENE_MODEL_FAMILY === 'jev')
    throw new Error('Official default must be generic');
  for (const role of ['PLANNING', 'LOCATE', 'INSIGHT']) {
    for (const field of ['NAME', 'API_KEY', 'BASE_URL', 'FAMILY'])
      required.push(`MIDSCENE_${role}_MODEL_${field}`);
    config[`MIDSCENE_${role}_MODEL_TIMEOUT`] = '30000';
    config[`MIDSCENE_${role}_MODEL_RETRY_COUNT`] = '1';
  }
  config.MIDSCENE_MODEL_TIMEOUT = '30000';
  config.MIDSCENE_MODEL_RETRY_COUNT = '1';
}
if (required.some((name) => !config[name]))
  throw new Error('Profile must explicitly configure all provider fields');
let runJev;
let evaluateJevAssertion;
let PlaywrightAgent;
if (profile.runner === 'ours') {
  Object.assign(process.env, config);
  ({ runJev, evaluateJevAssertion } = await import('../../dist/es/index.js'));
} else {
  ({ PlaywrightAgent } = await import('@midscene/web/playwright'));
}
await mkdir(dirname(outputPath), { recursive: true });
const browser = await chromium.launch({ headless: true });
const rows = [];
let stopped = false;
const schedule = [
  { task: tasks.find((t) => t.id === 'canvas-present'), seed: 0 },
  ...seeds.flatMap((seed) => tasks.map((task) => ({ task, seed }))),
];
try {
  for (const { task, seed } of schedule) {
    if (stopped) break;
    const row = {
      profile: profile.id,
      runner: profile.runner,
      task: task.id,
      seed,
      smoke: seed === 0,
      kind: task.kind,
      track: task.modality,
      costActualUsd: null,
      costEstimatedUsd: null,
      inferenceMs: null,
      delegationCount: null,
      status: 'not-run',
    };
    const officialUnsupported =
      profile.runner === 'official' &&
      ((task.kind === 'assertion' &&
        String(config.MIDSCENE_INSIGHT_MODEL_NAME).includes('clef')) ||
        (task.kind === 'action' &&
          [
            config.MIDSCENE_PLANNING_MODEL_NAME,
            config.MIDSCENE_LOCATE_MODEL_NAME,
          ].some((name) => String(name).includes('clef'))))
        ? 'Official Jev adapter does not support Clef image placement'
        : profile.runner === 'official' &&
            task.kind === 'action' &&
            config.MIDSCENE_LOCATE_MODEL_FAMILY === 'jev' &&
            /(?:latest|1\.13)/.test(config.MIDSCENE_LOCATE_MODEL_NAME)
          ? 'Box unsupported or unverified alias; choose explicit generic Locate profile'
          : null;
    const unsupported =
      officialUnsupported ??
      profile.excludeTasks?.[task.id] ??
      (profile.runner === 'ours' &&
      profile.transport === 'openrouter' &&
      task.modality === 'dom'
        ? 'Visual OpenRouter transport does not establish DOM-wire compatibility'
        : null) ??
      (profile.runner === 'ours' && task.id === 'canvas-target'
        ? 'No visual action API in this package'
        : null);
    if (unsupported) {
      rows.push({ ...row, status: 'unsupported', reason: unsupported });
      continue;
    }
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const sample = fixture(task, seed);
    await mount(page, sample);
    let agent;
    const requests = [];
    const observedFetch = async (...args) => {
      const start = performance.now();
      const request = {
        status: null,
        usage: {},
        model: null,
        provider: null,
        requestBytes:
          typeof args[1]?.body === 'string'
            ? Buffer.byteLength(args[1].body)
            : null,
      };
      try {
        const images = [];
        const visit = (value) => {
          if (!value || typeof value !== 'object') return;
          if (typeof value.data_base64 === 'string')
            images.push(Buffer.from(value.data_base64, 'base64'));
          if (
            value.type === 'image_url' &&
            typeof value.image_url?.url === 'string'
          ) {
            const match = /^data:image\/(?:png|jpeg);base64,(.+)$/.exec(
              value.image_url.url,
            );
            if (match) images.push(Buffer.from(match[1], 'base64'));
          }
          for (const child of Object.values(value)) visit(child);
        };
        if (typeof args[1]?.body === 'string') visit(JSON.parse(args[1].body));
        request.imageBytes = images.reduce((n, image) => n + image.length, 0);
        request.imageSha256 = images.map((image) =>
          createHash('sha256').update(image).digest('hex'),
        );
        const response = await fetch(...args);
        request.status = response.status;
        try {
          const data = await response.clone().json();
          for (const field of ['input_tokens', 'output_tokens', 'cost']) {
            const value = data.usage?.[field];
            if (Number.isFinite(value) && value >= 0)
              request.usage[field] = value;
          }
          for (const field of ['model', 'provider']) {
            if (
              typeof data[field] === 'string' &&
              /^[a-zA-Z0-9_~./ -]{1,120}$/.test(data[field])
            )
              request[field] = data[field];
          }
        } catch {
          /* Never retain provider response bodies. */
        }
        return response;
      } finally {
        request.ms = performance.now() - start;
        requests.push(request);
      }
    };
    const started = performance.now();
    const signal = AbortSignal.timeout(60_000);
    try {
      let prediction;
      if (profile.runner === 'ours') {
        if (task.kind === 'assertion') {
          const result = await evaluateJevAssertion(page, {
            prompt: task.goal,
            ...(task.modality === 'visual'
              ? { visual: { transport: profile.transport ?? 'typesafe' } }
              : {}),
            signal,
            requestTimeoutMs: 30_000,
            fetch: observedFetch,
          });
          row.truthProbability = result.truthProbability;
          row.evidenceProbability = result.evidenceProbability;
          row.verdict = result.verdict;
          prediction = result.verdict === 'indeterminate' ? null : result.pass;
          row.policy = 'runner-default confidence/evidence policy';
        } else {
          const result = await runJev(page, {
            goal: task.goal,
            maxSteps: 8,
            maxTaskMs: 60_000,
            requestTimeoutMs: 30_000,
            maxNoProgressSteps: 3,
            signal,
            verifyCompletion: () => sample.success(),
            fetch: observedFetch,
          });
          row.steps = result.steps;
        }
      } else {
        agent = new PlaywrightAgent(page, {
          modelConfig: config,
          replanningCycleLimit: 8,
          autoPrintReportMsg: false,
          generateReport: false,
          cache: false,
        });
        if (task.kind === 'assertion')
          prediction = await agent.aiBoolean(task.goal, {
            abortSignal: signal,
          });
        else
          await agent.aiAct(task.goal, {
            abortSignal: signal,
            cacheable: false,
          });
      }
      if (task.kind === 'assertion') {
        row.truth = sample.truth;
        row.prediction = prediction;
        row.correct = prediction !== null && prediction === sample.truth;
        row.falsePositive = prediction === true && !sample.truth;
      } else {
        row.success = sample.success();
        row.misclicks = sample.misclicks();
      }
      row.status = 'ok';
      if (row.smoke && row.correct !== true) stopped = true;
    } catch (error) {
      row.status = 'error';
      // Categorize without publishing request bodies, provider messages or secrets.
      const message = String(error?.message ?? '');
      row.error = /401|403|402/.test(message)
        ? 'authentication-or-payment'
        : /429|HTTP|request failed|fetch failed/.test(message)
          ? 'provider-error'
          : 'task-or-schema-error';
      if (row.smoke || row.error !== 'task-or-schema-error') stopped = true;
    } finally {
      if (task.kind === 'assertion') row.truth = sample.truth;
      else {
        row.success = sample.success();
        row.misclicks = sample.misclicks();
      }
      if (profile.runner === 'ours') {
        row.requests = requests;
        row.requestCount = requests.length;
        row.requestWallMs = requests.reduce((n, r) => n + r.ms, 0);
        row.delegationCount = 0;
        row.costActualUsd =
          requests.length &&
          requests.every((r) => Number.isFinite(r.usage.cost))
            ? requests.reduce((n, r) => n + r.usage.cost, 0)
            : null;
        if (
          requests.length &&
          requests.every(
            (r) =>
              profile.rates?.[r.model] &&
              Number.isFinite(r.usage.input_tokens) &&
              Number.isFinite(r.usage.output_tokens),
          )
        ) {
          row.costEstimatedUsd = requests.reduce(
            (n, r) =>
              n +
              (r.usage.input_tokens * profile.rates[r.model].input +
                r.usage.output_tokens * profile.rates[r.model].output) /
                1e6,
            0,
          );
        }
      } else if (agent) {
        row.metrics = agent.metrics;
        row.requestCount = agent.metrics.calls;
        row.requestWallMs = agent.metrics.totalTimeCostMs;
        row.policy = 'official boolean adapter threshold';
        const buckets = Object.entries(agent.metrics.byModel);
        if (
          buckets.length &&
          buckets.every(([model]) => profile.rates?.[model])
        ) {
          row.costEstimatedUsd = buckets.reduce(
            (n, [model, b]) =>
              n +
              (b.promptTokens * profile.rates[model].input +
                b.completionTokens * profile.rates[model].output) /
                1e6,
            0,
          );
        }
      }
      row.endToEndMs = performance.now() - started;
      rows.push(row);
      await agent?.destroy();
      await page.close();
      await writeFile(
        outputPath,
        JSON.stringify(
          {
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            profile: profile.id,
            stopped,
            plannedMeasuredTasks: seeds.length * tasks.length,
            rows,
          },
          null,
          2,
        ),
      );
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  outputPath,
  JSON.stringify(
    {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      profile: profile.id,
      stopped,
      plannedMeasuredTasks: seeds.length * tasks.length,
      rows,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    profile: profile.id,
    attempts: rows.length,
    stopped,
    outputPath,
  }),
);
