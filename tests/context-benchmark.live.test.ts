import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { benchmarkFixtures } from '../experiments/context-benchmark/fixtures.js';
import { summarizeResults } from '../experiments/context-benchmark/report.js';
import { runFixtureWithJev } from '../experiments/context-benchmark/runner.js';
import type {
  ContextStrategy,
  FixtureRunResult,
} from '../experiments/context-benchmark/types.js';
import { currentStrategy } from '../experiments/context-benchmark/variants/current.js';
import { hybridStrategy } from '../experiments/context-benchmark/variants/hybrid.js';
import { rankedDomStrategy } from '../experiments/context-benchmark/variants/ranked-dom.js';

const runLive = process.env.RUN_LIVE_JEV_BENCHMARK === '1';

const configurations: Array<{
  id: string;
  strategy: ContextStrategy;
  mode: 'flat' | 'adaptive-two-stage';
}> = [
  { id: 'current-flat', strategy: currentStrategy, mode: 'flat' },
  { id: 'ranked-dom-flat', strategy: rankedDomStrategy, mode: 'flat' },
  { id: 'hybrid-flat', strategy: hybridStrategy, mode: 'flat' },
  {
    id: 'hybrid-adaptive',
    strategy: hybridStrategy,
    mode: 'adaptive-two-stage',
  },
];

describe.skipIf(!runLive)('live JEV context benchmark', () => {
  it(
    'runs the selected paired matrix and writes an incremental report',
    async () => {
      const requestedConfigurations = new Set(
        (process.env.JEV_BENCHMARK_CONFIGURATIONS || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
      const requestedFixtures = new Set(
        (process.env.JEV_BENCHMARK_FIXTURES || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
      const repeats = Number(process.env.JEV_BENCHMARK_REPEATS || '1');
      if (!Number.isInteger(repeats) || repeats <= 0)
        throw new Error('JEV_BENCHMARK_REPEATS must be a positive integer.');
      const selectedConfigurations = configurations.filter(
        (configuration) =>
          requestedConfigurations.size === 0 ||
          requestedConfigurations.has(configuration.id),
      );
      const selectedFixtures = benchmarkFixtures.filter(
        (fixture) =>
          requestedFixtures.size === 0 || requestedFixtures.has(fixture.id),
      );
      const outputPath = resolve(
        process.env.JEV_BENCHMARK_OUTPUT ||
          'experiments/context-benchmark/results/live.json',
      );
      const browser = await chromium.launch({ headless: true });
      const results: FixtureRunResult[] = [];
      const writeReport = async () => {
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(
          outputPath,
          `${JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              model:
                process.env.MIDSCENE_JEV_MODEL_NAME || '~typesafe/jev-latest',
              repeats,
              configurations: selectedConfigurations.map(
                (configuration) => configuration.id,
              ),
              fixtures: selectedFixtures.map((fixture) => fixture.id),
              aggregates: summarizeResults(results),
              results,
            },
            null,
            2,
          )}\n`,
        );
      };
      try {
        for (let repeat = 0; repeat < repeats; repeat += 1) {
          for (const configuration of selectedConfigurations) {
            for (const fixture of selectedFixtures) {
              const page = await browser.newPage({
                viewport: { width: 1440, height: 900 },
              });
              try {
                results.push(
                  await runFixtureWithJev(
                    page,
                    fixture,
                    configuration.strategy,
                    configuration.mode,
                  ),
                );
              } finally {
                await page.close();
              }
              await writeReport();
            }
          }
        }
      } finally {
        await browser.close();
      }

      expect(results).toHaveLength(
        repeats * selectedConfigurations.length * selectedFixtures.length,
      );
    },
    30 * 60 * 1_000,
  );
});
