import type { Page } from 'playwright';
import { executeAction } from './browser/execute';
import { observe } from './browser/observe';
import {
  DEFAULT_MAX_NO_PROGRESS_STEPS,
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_TASK_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_GOAL_LENGTH,
  MAX_RECENT_ACTIONS,
} from './constants';
import { createDecisionRequest, validChoice } from './decision';
import { requestDecision } from './decision-client';
import { JevRunError } from './errors';
import type {
  BrowserAction,
  BrowserSnapshot,
  JevRecentAction,
  JevResponse,
} from './internal-types';
import type { JevOperation, JevRunOptions, JevRunResult } from './types';
import { tokenCount } from './utils';

const actionEffectAchieved = (
  action: BrowserAction,
  snapshot: BrowserSnapshot,
): boolean | undefined => {
  if (!action.effect) return undefined;
  const fact = snapshot.facts.find((item) => item.id === action.id);
  const value = fact?.checked ?? fact?.selected;
  if (value === undefined) return undefined;
  const active = ['true', 'checked', 'selected', 'on', 'active'].includes(
    value.toLocaleLowerCase(),
  );
  return action.effect === 'activate' ? active : !active;
};

const normalized = (value: string | undefined): string =>
  (value || '').replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
const actionGroupKey = (action: BrowserAction): string | undefined =>
  normalized(action.groupLabel) || action.groupId;

/** Run JEV against a caller-owned Playwright Page. */
export const runJev = async (
  page: Page,
  options: JevRunOptions,
): Promise<JevRunResult> => {
  if (!page || typeof page !== 'object')
    throw new Error('runJev() requires a Playwright Page.');
  if (!options || typeof options.goal !== 'string' || !options.goal.trim())
    throw new Error('runJev() requires a non-empty goal.');
  if (options.goal.length > MAX_GOAL_LENGTH)
    throw new Error(`JEV goal must not exceed ${MAX_GOAL_LENGTH} characters.`);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function')
    throw new Error('No fetch implementation is available.');
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxTaskMs = options.maxTaskMs ?? DEFAULT_MAX_TASK_MS;
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxNoProgressSteps =
    options.maxNoProgressSteps ?? DEFAULT_MAX_NO_PROGRESS_STEPS;
  const maxTrackedProgressStates = Math.max(64, Math.ceil(maxSteps) + 1);
  if (
    ![maxSteps, maxTaskMs, requestTimeoutMs, maxNoProgressSteps].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new Error('JEV limits must be positive numbers.');

  const controller = new AbortController();
  const parentSignal = options.signal;
  const abort = () =>
    controller.abort(parentSignal?.reason ?? new Error('JEV run aborted.'));
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener('abort', abort, { once: true });
  const signal = controller.signal;
  const startedAt = performance.now();
  const taskTimer = setTimeout(
    () => controller.abort(new Error('JEV task time budget was exhausted.')),
    maxTaskMs,
  );
  const verify = async (): Promise<boolean> => {
    signal.throwIfAborted();
    const verified = await options.verifyCompletion?.({
      page,
      goal: options.goal,
      signal,
    });
    signal.throwIfAborted();
    return verified === true;
  };
  const result: JevRunResult = {
    steps: 0,
    elapsedMs: 0,
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
    staleDecisions: 0,
    actionErrors: 0,
    rejectedCompletions: 0,
    rejectedBlocks: 0,
    completionVerified: false,
  };
  const finish = () => {
    result.elapsedMs = Math.round(performance.now() - startedAt);
    clearTimeout(taskTimer);
    parentSignal?.removeEventListener('abort', abort);
    return result;
  };
  const fail = (error: unknown): never => {
    const message =
      error instanceof Error ? error.message : 'JEV runner failed.';
    const completed = finish();
    options.observer?.({ type: 'failure', reason: message, result: completed });
    throw new JevRunError(message, completed, { cause: error });
  };

  try {
    signal.throwIfAborted();
    let snapshot = await observe(page, options.goal);
    let noProgressSteps = 0;
    let recoveryEpoch = 0;
    const visitedProgressStates = new Set<string>([snapshot.progressMarker]);
    const progressStateOrder = [snapshot.progressMarker];
    const rememberProgressState = (marker: string): boolean => {
      const repeated = visitedProgressStates.has(marker);
      if (!repeated) {
        visitedProgressStates.add(marker);
        progressStateOrder.push(marker);
        if (progressStateOrder.length > maxTrackedProgressStates) {
          const oldest = progressStateOrder.shift();
          if (oldest) visitedProgressStates.delete(oldest);
        }
      }
      return repeated;
    };
    const recentActions: JevRecentAction[] = [];
    const remember = (action: JevRecentAction) => {
      recentActions.push(action);
      if (recentActions.length > MAX_RECENT_ACTIONS) recentActions.shift();
    };
    for (let step = 1; step <= maxSteps; step += 1) {
      if (signal.aborted) throw signal.reason ?? new Error('JEV run aborted.');
      if (performance.now() - startedAt >= maxTaskMs)
        throw new Error('JEV task time budget was exhausted.');
      // A page transition may settle after the post-action check. Verify once
      // more before requesting a new decision to avoid unnecessary mutation.
      if (step > 1 && options.verifyCompletion && (await verify())) {
        options.observer?.({ type: 'completion', step, verified: true });
        result.completionVerified = true;
        return finish();
      }
      const request = createDecisionRequest(
        snapshot,
        options.goal,
        recentActions,
        recoveryEpoch,
      );
      const raw = await requestDecision(request.body, signal, {
        fetch: fetchImpl,
        requestTimeoutMs,
      });
      result.usage.calls += 1;
      signal.throwIfAborted();
      const response = raw as JevResponse;
      result.usage.inputTokens += tokenCount(
        response?.usage?.input_tokens ?? response?.usage?.prompt_tokens,
      );
      result.usage.outputTokens += tokenCount(
        response?.usage?.output_tokens ?? response?.usage?.completion_tokens,
      );
      result.usage.cost += tokenCount(response?.usage?.cost);
      const operation = validChoice(
        response?.answers?.operation,
        request.operations,
      ) as JevOperation;
      const candidates = request.targets[operation];
      const targetAnswer =
        response?.answers?.[`${operation.toLowerCase()}_target`];
      const target = candidates
        ? validChoice(targetAnswer, candidates)
        : undefined;
      const action = target && candidates ? candidates[target] : undefined;
      result.steps = step;
      options.observer?.({
        type: 'decision',
        step,
        operation,
        ...(target ? { target } : {}),
        ...(action ? { label: action.label } : {}),
        usage: { ...result.usage },
      });

      if (operation === 'DONE') {
        const verified = options.verifyCompletion ? await verify() : true;
        options.observer?.({
          type: 'completion',
          step,
          verified: Boolean(options.verifyCompletion) && verified,
        });
        if (verified) {
          result.completionVerified = Boolean(options.verifyCompletion);
          return finish();
        }
        result.rejectedCompletions += 1;
        remember({
          operation,
          outcome: 'rejected',
          fromProgressMarker: snapshot.progressMarker,
          signature: 'DONE',
          recoveryEpoch,
        });
        snapshot = await observe(page, options.goal);
        rememberProgressState(snapshot.progressMarker);
        noProgressSteps += 1;
        if (noProgressSteps >= maxNoProgressSteps)
          throw new Error(
            'JEV made no visible progress within its recovery budget.',
          );
        continue;
      }
      if (operation === 'BLOCKED') {
        if (!options.verifyCompletion)
          throw new Error('JEV reported that the goal is blocked.');
        const verified = await verify();
        if (verified) {
          options.observer?.({ type: 'completion', step, verified: true });
          result.completionVerified = true;
          return finish();
        }
        result.rejectedBlocks += 1;
        remember({
          operation,
          outcome: 'rejected',
          fromProgressMarker: snapshot.progressMarker,
          signature: 'BLOCKED',
          recoveryEpoch,
        });
        snapshot = await observe(page, options.goal);
        rememberProgressState(snapshot.progressMarker);
        noProgressSteps += 1;
        if (noProgressSteps >= maxNoProgressSteps)
          throw new Error(
            'JEV made no visible progress within its recovery budget.',
          );
        continue;
      }
      if (!action) throw new Error('JEV selected an action without a target.');

      const previousProgressMarker = snapshot.progressMarker;
      let fresh: boolean;
      try {
        fresh = await executeAction(page, action, signal);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.split('\n')[0]
            : 'Browser action failed.';
        result.actionErrors += 1;
        remember({
          operation,
          target,
          label: action.label,
          outcome: 'failed',
          error: message,
          fromProgressMarker: previousProgressMarker,
          signature: action.signature || `${operation}:${target || action.id}`,
          recoveryEpoch,
          ...(actionGroupKey(action) ? { group: actionGroupKey(action) } : {}),
        });
        options.observer?.({
          type: 'action',
          step,
          operation,
          target,
          label: action.label,
          stale: false,
          progressed: false,
          error: message,
        });
        // A browser error may arrive after dispatch. Read back once, but do not
        // let the loop repeat a potentially completed side effect.
        signal.throwIfAborted();
        snapshot = await observe(page, options.goal);
        if (options.verifyCompletion && (await verify())) {
          result.completionVerified = true;
          options.observer?.({ type: 'completion', step, verified: true });
          return finish();
        }
        throw new Error(
          'JEV browser action failed with an uncertain outcome; no action was retried.',
          { cause: error },
        );
      }
      if (!fresh) {
        result.staleDecisions += 1;
        remember({
          operation,
          target,
          label: action.label,
          outcome: 'stale',
          fromProgressMarker: previousProgressMarker,
          signature: action.signature || `${operation}:${target || action.id}`,
          recoveryEpoch,
          ...(actionGroupKey(action) ? { group: actionGroupKey(action) } : {}),
        });
        options.observer?.({
          type: 'action',
          step,
          operation,
          target,
          label: action.label,
          stale: true,
          progressed: false,
        });
        snapshot = await observe(page, options.goal);
        rememberProgressState(snapshot.progressMarker);
        noProgressSteps += 1;
        if (noProgressSteps >= maxNoProgressSteps)
          throw new Error(
            'JEV made no visible progress within its recovery budget.',
          );
        continue;
      }
      snapshot = await observe(page, options.goal);
      const repeatedState = rememberProgressState(snapshot.progressMarker);
      const feedback = snapshot.alerts;
      const markerProgressed =
        snapshot.progressMarker !== previousProgressMarker;
      const effectAchieved = actionEffectAchieved(action, snapshot);
      const effectMismatch = effectAchieved === false;
      const progressed = !effectMismatch && markerProgressed && !repeatedState;
      const effectError = effectMismatch
        ? `The target did not reach the requested ${action.effect} state.`
        : undefined;
      remember({
        operation,
        target,
        label: action.label,
        outcome: progressed ? 'progressed' : 'no-progress',
        fromProgressMarker: previousProgressMarker,
        toProgressMarker: snapshot.progressMarker,
        signature: action.signature || `${operation}:${target || action.id}`,
        recoveryEpoch,
        ...(actionGroupKey(action) ? { group: actionGroupKey(action) } : {}),
        ...(feedback.length > 0 ? { feedback } : {}),
        ...(effectError ? { error: effectError } : {}),
      });
      options.observer?.({
        type: 'action',
        step,
        operation,
        target,
        label: action.label,
        stale: false,
        progressed,
        ...(effectError ? { error: effectError } : {}),
      });
      if (options.verifyCompletion && (await verify())) {
        options.observer?.({ type: 'completion', step, verified: true });
        result.completionVerified = true;
        return finish();
      }
      if (progressed) recoveryEpoch += 1;
      noProgressSteps = progressed ? 0 : noProgressSteps + 1;
      if (noProgressSteps >= maxNoProgressSteps)
        throw new Error(
          'JEV made no visible progress within its recovery budget.',
        );
    }
    throw new Error('JEV step budget was exhausted.');
  } catch (error) {
    return fail(error);
  }
};
