import type { JevOperation } from './types';

export type BrowserActionKind =
  | 'click'
  | 'fill'
  | 'select'
  | 'clear'
  | 'scroll'
  | 'wait'
  | 'dismiss';

export type BrowserRegion = 'dialog' | 'main' | 'navigation' | 'content';

export interface BrowserAction {
  id: string;
  node?: string;
  guard?: string;
  kind: BrowserActionKind;
  label: string;
  role?: string;
  value?: string;
  delta?: number;
  currentValue?: string;
  checked?: string;
  selected?: string;
  expanded?: string;
  region?: BrowserRegion;
  signature?: string;
}

export interface BrowserWorkflowStep {
  index: number;
  label: string;
  status: string;
}

export interface BrowserActiveLayer {
  kind: 'dialog' | 'overlay';
  label: string;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
  marker: string;
  progressMarker: string;
  actions: BrowserAction[];
  alerts: string[];
  workflowSteps: BrowserWorkflowStep[];
  activeLayer?: BrowserActiveLayer;
  loading: boolean;
  omittedActions: number;
}

export interface JevRecentAction {
  operation: JevOperation;
  target?: string;
  label?: string;
  outcome:
    | 'progressed'
    | 'no-progress'
    | 'validation-error'
    | 'stale'
    | 'failed'
    | 'rejected';
  error?: string;
  snapshotMarker?: string;
  signature?: string;
  recoveryEpoch?: number;
  feedback?: string[];
}

interface JevQuestion {
  type: 'choice';
  criteria: Record<string, unknown>;
  instructions: Record<string, unknown>;
}

export interface DecisionRequest {
  body: {
    model: string;
    state: Record<string, unknown>;
    questions: Record<string, JevQuestion>;
  };
  operations: Record<string, string>;
  targets: Partial<Record<JevOperation, Record<string, BrowserAction>>>;
}

export interface UsageResponse {
  input_tokens?: unknown;
  output_tokens?: unknown;
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  cost?: unknown;
}

export interface JevResponse {
  answers?: Record<string, { type?: unknown; choice?: unknown }>;
  usage?: UsageResponse;
}

export interface TextResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: UsageResponse;
}
