import type { NodeExecutionContext } from '@midscene/test';
import type { Page } from 'playwright';
import type { JevActNodeInput } from './schema';

export interface JevUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Provider-reported cost in USD. */
  cost: number;
}

export interface JevTextUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface JevRunResult {
  steps: number;
  elapsedMs: number;
  usage: JevUsage;
  textUsage: JevTextUsage;
  staleDecisions: number;
  actionErrors: number;
  rejectedCompletions: number;
  rejectedBlocks: number;
  completionVerified: boolean;
}

export type JevOperation =
  | 'CLICK'
  | 'TYPE_TEXT'
  | 'SELECT'
  | 'CLEAR'
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
  goal: string;
  maxSteps?: number;
  maxTaskMs?: number;
  /** Limits an individual model request; defaults to 60 seconds. */
  requestTimeoutMs?: number;
  /** Stops the loop after repeated actions that do not visibly change the page. */
  maxNoProgressSteps?: number;
  signal?: AbortSignal;
  verifyCompletion?: JevCompletionVerifier;
  observer?: JevObserver;
  /** Dependency injection for deterministic tests and custom runtimes. */
  fetch?: typeof globalThis.fetch;
}

export interface JevNodeOptions<TContext> {
  getPage(
    execution: NodeExecutionContext<JevActNodeInput, TContext>,
  ): Page | Promise<Page>;
  verifyCompletion?: JevCompletionVerifier;
  observer?: JevObserver;
}
