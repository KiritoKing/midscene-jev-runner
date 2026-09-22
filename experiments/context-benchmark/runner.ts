import type { Frame, Page } from 'playwright';
import { observationBytes, selectWithJev } from './jev.js';
import type {
  BenchmarkCandidate,
  BenchmarkFixture,
  BenchmarkHistoryEntry,
  BenchmarkStep,
  ContextStrategy,
  FixtureRunResult,
} from './types.js';

export type BenchmarkSelectionMode = 'flat' | 'adaptive-two-stage';

const frameForPath = (page: Page, path: string[] | undefined): Frame => {
  let frame = page.mainFrame();
  for (const segment of path ?? []) {
    const match = /^frame\[(\d+)\]$/u.exec(segment);
    if (!match) throw new Error(`Unsupported frame path segment: ${segment}`);
    const index = Number(match[1]);
    const child = frame.childFrames()[index];
    if (!child) throw new Error(`Frame path no longer exists: ${segment}`);
    frame = child;
  }
  return frame;
};

const executeCandidate = async (
  page: Page,
  candidate: BenchmarkCandidate,
  step: BenchmarkStep,
): Promise<void> => {
  const execution = candidate.execution;
  if (execution.kind === 'keyboard') {
    await page.keyboard.press(execution.key);
  } else if (execution.kind === 'scroll') {
    if (execution.selector) {
      const frame = frameForPath(page, execution.framePath);
      await frame
        .locator(execution.selector)
        .first()
        .evaluate((element, delta) => {
          element.scrollBy({ top: delta, behavior: 'instant' });
        }, execution.delta);
    } else {
      await page.mouse.wheel(0, execution.delta);
    }
  } else {
    const frame = frameForPath(page, execution.framePath);
    const locator = frame.locator(execution.selector).first();
    if (candidate.operation === 'TYPE_TEXT') {
      if (step.value === undefined)
        throw new Error('TYPE_TEXT benchmark step did not provide a value.');
      await locator.fill(step.value);
    } else if (candidate.operation === 'SELECT') {
      if (step.value !== undefined) await locator.selectOption(step.value);
      else await locator.click();
    } else {
      await locator.click();
    }
  }
  await page.waitForTimeout(80);
};

const selectedCandidate = (
  candidates: BenchmarkCandidate[],
  ref: string | undefined,
): BenchmarkCandidate | undefined =>
  ref ? candidates.find((candidate) => candidate.ref === ref) : undefined;

export const runFixtureWithJev = async (
  page: Page,
  fixture: BenchmarkFixture,
  strategy: ContextStrategy,
  selectionMode: BenchmarkSelectionMode,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<FixtureRunResult> => {
  const startedAt = performance.now();
  let recalled = 0;
  let top1 = 0;
  let candidateCount = 0;
  let actionableCount = 0;
  let contextBytes = 0;
  let decisionCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;
  let actionErrors = 0;
  let recoveryActions = 0;
  const unsupported = new Set<string>();
  const history: BenchmarkHistoryEntry[] = [];
  const measuredSteps = new Set<number>();
  let failure: string | undefined;
  try {
    await fixture.setup(page);
    let stepIndex = 0;
    let decisions = 0;
    const maxDecisions = fixture.steps.length + 6;
    while (stepIndex < fixture.steps.length) {
      decisions += 1;
      if (decisions > maxDecisions)
        throw new Error('The fixture recovery decision budget was exhausted.');
      const step = fixture.steps[stepIndex] as BenchmarkStep;
      const observation = await strategy.observe(page, fixture.goal);
      for (const item of observation.unsupported) unsupported.add(item);
      candidateCount = Math.max(candidateCount, observation.candidates.length);
      actionableCount = Math.max(
        actionableCount,
        observation.candidates.filter((candidate) => candidate.actionable)
          .length,
      );
      contextBytes += observationBytes(observation, fixture.goal);
      const expectedCandidates = observation.candidates.filter(
        (candidate) =>
          candidate.operation === step.operation &&
          candidate.oracleId !== undefined &&
          step.acceptableOracleIds.includes(candidate.oracleId),
      );
      const firstMeasurement = !measuredSteps.has(stepIndex);
      if (firstMeasurement && expectedCandidates.length > 0) recalled += 1;
      const ranked = observation.candidates.filter(
        (candidate) =>
          candidate.operation === step.operation && candidate.actionable,
      );
      if (
        firstMeasurement &&
        ranked[0]?.oracleId &&
        step.acceptableOracleIds.includes(ranked[0].oracleId)
      )
        top1 += 1;
      measuredSteps.add(stepIndex);
      const selection = await selectWithJev(
        observation,
        fixture.goal,
        selectionMode,
        fetchImpl,
        history,
      );
      decisionCalls += selection.calls;
      inputTokens += selection.inputTokens;
      outputTokens += selection.outputTokens;
      cost += selection.cost;
      const allowRecoveryScroll =
        selection.operation === 'SCROLL' &&
        step.operation !== 'SCROLL' &&
        expectedCandidates.some((candidate) => !candidate.actionable);
      if (selection.operation !== step.operation && !allowRecoveryScroll)
        throw new Error(
          `Expected ${step.operation}, but JEV selected ${selection.operation}.`,
        );
      const candidate = selectedCandidate(
        observation.candidates,
        selection.targetRef,
      );
      if (!candidate)
        throw new Error('JEV selected an action without a current candidate.');
      if (
        !allowRecoveryScroll &&
        (!candidate.oracleId ||
          !step.acceptableOracleIds.includes(candidate.oracleId))
      )
        throw new Error(
          `JEV selected ${candidate.label} (${candidate.oracleId ?? 'no oracle id'}) instead of ${step.acceptableOracleIds.join(', ')}.`,
        );
      if (candidate.operation === 'DISMISS' || candidate.operation === 'SCROLL')
        recoveryActions += 1;
      try {
        await executeCandidate(page, candidate, step);
        history.push({
          operation: candidate.operation,
          label: candidate.label,
          groupId: candidate.groupId,
          layerPath: candidate.layerPath,
          outcome: 'executed',
        });
      } catch (error) {
        actionErrors += 1;
        history.push({
          operation: candidate.operation,
          label: candidate.label,
          groupId: candidate.groupId,
          layerPath: candidate.layerPath,
          outcome: 'failed',
        });
        throw error;
      }
      if (!allowRecoveryScroll) stepIndex += 1;
    }
    if (!(await fixture.verify(page)))
      throw new Error('The independent completion oracle was not satisfied.');
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Unknown failure';
  }
  return {
    fixtureId: fixture.id,
    strategyId: strategy.id,
    selectionMode,
    completed: failure === undefined,
    targetRecall: recalled / fixture.steps.length,
    targetTop1: top1 / fixture.steps.length,
    candidateCount,
    actionableCount,
    contextBytes,
    decisionCalls,
    inputTokens,
    outputTokens,
    cost,
    elapsedMs: Math.round(performance.now() - startedAt),
    actionErrors,
    recoveryActions,
    unsupported: Array.from(unsupported),
    ...(failure ? { failure } : {}),
  };
};
