import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { benchmarkFixtures } from '../experiments/context-benchmark/fixtures.js';
import { DEFAULT_JEV_MODEL_NAME } from '../src/constants.js';
import { JevRunError, runJev } from '../src/index.js';
import type { JevObserverEvent, JevRunResult } from '../src/types.js';

const runLive = process.env.RUN_LIVE_PRODUCTION_CONTEXT_BENCHMARK === '1';

interface ProductionRun {
  fixtureId: string;
  repeat: number;
  completed: boolean;
  elapsedMs: number;
  result?: JevRunResult;
  decisions: Array<{
    step: number;
    operation: string;
    label?: string;
  }>;
  failure?: string;
}

describe.skipIf(!runLive)('live production context benchmark', () => {
  it(
    'runs the production runner against every controlled fixture',
    async () => {
      const repeats = Number(
        process.env.PRODUCTION_CONTEXT_BENCHMARK_REPEATS || '1',
      );
      if (!Number.isInteger(repeats) || repeats <= 0)
        throw new Error(
          'PRODUCTION_CONTEXT_BENCHMARK_REPEATS must be a positive integer.',
        );
      const requestedFixtures = new Set(
        (process.env.PRODUCTION_CONTEXT_BENCHMARK_FIXTURES || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
      const requested = benchmarkFixtures.filter(
        (fixture) =>
          requestedFixtures.size === 0 || requestedFixtures.has(fixture.id),
      );
      // Text entry is now a separate Test node. Do not report the historical
      // whole-form fixtures as either supported runs or successful JEV tasks.
      const excludedFixtures = requested
        .filter((fixture) =>
          fixture.steps.some((step) => step.operation === 'TYPE_TEXT'),
        )
        .map((fixture) => ({
          fixtureId: fixture.id,
          reason:
            'Requires a separate aiInput node; excluded from standalone jevAct coverage.',
        }));
      const excludedIds = new Set(
        excludedFixtures.map((fixture) => fixture.fixtureId),
      );
      const fixtures = requested.filter(
        (fixture) => !excludedIds.has(fixture.id),
      );
      if (fixtures.length === 0)
        throw new Error(
          'No non-text fixtures selected for the jevAct benchmark.',
        );
      const outputPath = resolve(
        process.env.PRODUCTION_CONTEXT_BENCHMARK_OUTPUT ||
          'experiments/context-benchmark/results/production-live.json',
      );
      const results: ProductionRun[] = [];
      const writeReport = async () => {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(
          outputPath,
          `${JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              model:
                process.env.MIDSCENE_JEV_MODEL_NAME || DEFAULT_JEV_MODEL_NAME,
              contract: 'jevAct-non-text-loop',
              excludedFixtures,
              repeats,
              fixtures: fixtures.map((fixture) => fixture.id),
              summary: {
                runs: results.length,
                completed: results.filter((result) => result.completed).length,
                completionRate:
                  results.length === 0
                    ? 0
                    : results.filter((result) => result.completed).length /
                      results.length,
                decisionCalls: results.reduce(
                  (total, result) => total + (result.result?.usage.calls ?? 0),
                  0,
                ),
                inputTokens: results.reduce(
                  (total, result) =>
                    total + (result.result?.usage.inputTokens ?? 0),
                  0,
                ),
                outputTokens: results.reduce(
                  (total, result) =>
                    total + (result.result?.usage.outputTokens ?? 0),
                  0,
                ),
                cost: results.reduce(
                  (total, result) => total + (result.result?.usage.cost ?? 0),
                  0,
                ),
                averageElapsedMs:
                  results.length === 0
                    ? 0
                    : results.reduce(
                        (total, result) => total + result.elapsedMs,
                        0,
                      ) / results.length,
              },
              results,
            },
            null,
            2,
          )}\n`,
        );
      };

      const browser = await chromium.launch({ headless: true });
      try {
        for (let repeat = 1; repeat <= repeats; repeat += 1) {
          for (const fixture of fixtures) {
            const page = await browser.newPage({
              viewport: { width: 1440, height: 900 },
            });
            const decisions: ProductionRun['decisions'] = [];
            const startedAt = performance.now();
            try {
              await fixture.setup(page);
              const result = await runJev(page, {
                goal: fixture.goal,
                maxSteps: fixture.steps.length + 6,
                maxTaskMs: 60_000,
                requestTimeoutMs: 30_000,
                verifyCompletion: ({ page: currentPage }) =>
                  fixture.verify(currentPage),
                observer: (event: JevObserverEvent) => {
                  if (event.type === 'decision')
                    decisions.push({
                      step: event.step,
                      operation: event.operation,
                      ...(event.label ? { label: event.label } : {}),
                    });
                },
              });
              results.push({
                fixtureId: fixture.id,
                repeat,
                completed: result.completionVerified,
                elapsedMs: Math.round(performance.now() - startedAt),
                result,
                decisions,
              });
            } catch (error) {
              const result =
                error instanceof JevRunError ? error.result : undefined;
              results.push({
                fixtureId: fixture.id,
                repeat,
                completed: false,
                elapsedMs: Math.round(performance.now() - startedAt),
                ...(result ? { result } : {}),
                decisions,
                failure:
                  error instanceof Error ? error.message : 'Unknown failure',
              });
            } finally {
              await page.close();
              await writeReport();
            }
          }
        }
      } finally {
        await browser.close();
      }

      expect(results).toHaveLength(repeats * fixtures.length);
      expect(
        results
          .filter((result) => !result.completed)
          .map((result) => ({
            fixtureId: result.fixtureId,
            repeat: result.repeat,
            failure: result.failure,
            decisions: result.decisions,
          })),
      ).toEqual([]);
    },
    30 * 60 * 1_000,
  );
});
