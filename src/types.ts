import type { NodeExecutionContext } from '@midscene/test';
import type { Page } from 'playwright';
import type { JevActNodeInput, JevAssertNodeInput } from './schema';

export interface JevUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Provider-reported cost in USD. */
  cost: number;
}

export interface JevRunResult {
  steps: number;
  elapsedMs: number;
  usage: JevUsage;
  staleDecisions: number;
  actionErrors: number;
  rejectedCompletions: number;
  rejectedBlocks: number;
  completionVerified: boolean;
}

export type JevAssertionVerdict = 'pass' | 'fail' | 'indeterminate';

export interface JevAssertionResult {
  pass: boolean;
  verdict: JevAssertionVerdict;
  /** Probability that the assertion is true, as returned by JEV Noul. */
  truthProbability: number;
  /** Probability that the supplied browser evidence is sufficient. */
  evidenceProbability: number;
  /** Two-sided certainty derived from the truth probability. */
  certainty: number;
  elapsedMs: number;
  usage: JevUsage;
}

export interface JevAssertionPolicy {
  /** Pass threshold; the symmetric fail threshold is `1 - threshold`. */
  threshold?: number;
  /** Minimum probability that the observed evidence is sufficient. */
  evidenceThreshold?: number;
  /** Limits the JEV request; defaults to 60 seconds. */
  requestTimeoutMs?: number;
}

export interface JevAssertionOptions extends JevAssertionPolicy {
  prompt: string;
  context?: string;
  signal?: AbortSignal;
  /** Dependency injection for deterministic tests and custom runtimes. */
  fetch?: typeof globalThis.fetch;
}

export type JevOperation =
  | 'CLICK'
  | 'SELECT'
  | 'SCROLL'
  | 'WAIT'
  | 'DISMISS'
  | 'DONE'
  | 'BLOCKED';

export type JevObserverEvent =
  | {
      type: 'decision';
      step: number;
      operation: JevOperation;
      target?: string;
      label?: string;
      usage: JevUsage;
    }
  | {
      type: 'action';
      step: number;
      operation: Exclude<JevOperation, 'DONE' | 'BLOCKED'>;
      target?: string;
      label?: string;
      stale: boolean;
      progressed: boolean;
      error?: string;
    }
  | { type: 'completion'; step: number; verified: boolean }
  | { type: 'failure'; reason: string; result: JevRunResult };

export type JevCompletionVerifier = (input: {
  page: Page;
  goal: string;
  signal: AbortSignal;
}) => boolean | Promise<boolean>;

export type JevObserver = (event: JevObserverEvent) => void;

export interface JevRunOptions {
  /** One Test action task, potentially requiring several non-text interactions. */
  goal: string;
  maxSteps?: number;
  maxNoProgressSteps?: number;
  maxTaskMs?: number;
  /** Limits an individual model request; defaults to 60 seconds. */
  requestTimeoutMs?: number;
  signal?: AbortSignal;
  verifyCompletion?: JevCompletionVerifier;
  observer?: JevObserver;
  /** Dependency injection for deterministic tests and custom runtimes. */
  fetch?: typeof globalThis.fetch;
}

export interface JevNodeOptions<TContext> {
  getPage(
    execution: NodeExecutionContext<
      JevActNodeInput | JevAssertNodeInput,
      TContext
    >,
  ): Page | Promise<Page>;
  verifyCompletion?: JevCompletionVerifier;
  observer?: JevObserver;
  /** Project-level policy for every `jevAssert` invocation. */
  assertion?: JevAssertionPolicy;
}
