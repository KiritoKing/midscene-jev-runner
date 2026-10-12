import type { FixtureRunResult } from './types.js';

export interface BenchmarkAggregate {
  configuration: string;
  runs: number;
  completionRate: number;
  targetRecall: number;
  targetTop1: number;
  recoverySuccess: number;
  averageContextBytes: number;
  averageDecisionCalls: number;
  averageInputTokens: number;
  averageElapsedMs: number;
  totalCost: number;
  actionErrors: number;
  score: number;
  failures: Array<{ fixtureId: string; failure: string }>;
}

const average = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;

const recoveryFixtures = new Set([
  'nested-portal',
  'layer-recovery',
  'nested-scroll',
]);

export const summarizeResults = (
  results: FixtureRunResult[],
): BenchmarkAggregate[] => {
  const grouped = new Map<string, FixtureRunResult[]>();
  for (const result of results) {
    const key = `${result.strategyId}/${result.selectionMode}`;
    const group = grouped.get(key) ?? [];
    group.push(result);
    grouped.set(key, group);
  }
  const partial = Array.from(grouped, ([configuration, group]) => {
    const recovery = group.filter((result) =>
      recoveryFixtures.has(result.fixtureId),
    );
    return {
      configuration,
      runs: group.length,
      completionRate: average(
        group.map((result) => (result.completed ? 1 : 0)),
      ),
      targetRecall: average(group.map((result) => result.targetRecall)),
      targetTop1: average(group.map((result) => result.targetTop1)),
      recoverySuccess: average(
        recovery.map((result) => (result.completed ? 1 : 0)),
      ),
      averageContextBytes: average(group.map((result) => result.contextBytes)),
      averageDecisionCalls: average(
        group.map((result) => result.decisionCalls),
      ),
      averageInputTokens: average(group.map((result) => result.inputTokens)),
      averageElapsedMs: average(group.map((result) => result.elapsedMs)),
      totalCost: group.reduce((total, result) => total + result.cost, 0),
      actionErrors: group.reduce(
        (total, result) => total + result.actionErrors,
        0,
      ),
      failures: group.flatMap((result) =>
        result.failure
          ? [{ fixtureId: result.fixtureId, failure: result.failure }]
          : [],
      ),
    };
  });
  const maxContext = Math.max(
    1,
    ...partial.map((aggregate) => aggregate.averageContextBytes),
  );
  const maxErrors = Math.max(
    1,
    ...partial.map((aggregate) => aggregate.actionErrors),
  );
  return partial
    .map((aggregate) => ({
      ...aggregate,
      score:
        0.35 * aggregate.completionRate +
        0.2 * aggregate.targetTop1 +
        0.15 * aggregate.recoverySuccess +
        0.1 * aggregate.targetRecall +
        0.1 * (1 - aggregate.actionErrors / maxErrors) +
        0.1 * (1 - aggregate.averageContextBytes / maxContext),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.completionRate - left.completionRate ||
        left.averageContextBytes - right.averageContextBytes,
    );
};
