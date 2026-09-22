import type { JevOperation } from './types';

export type BrowserActionKind =
  | 'click'
  | 'select'
  | 'scroll'
  | 'wait'
  | 'dismiss';

export type BrowserFactKind = BrowserActionKind | 'fill';

export type BrowserRegion = 'dialog' | 'main' | 'navigation' | 'content';

export type BrowserNameSource =
  | 'aria'
  | 'native-label'
  | 'attribute'
  | 'content'
  | 'nearby'
  | 'inferred'
  | 'unknown';

export type BrowserActionEffect = 'activate' | 'deactivate';

export type BrowserTaskAlignment =
  | 'label-and-scope'
  | 'label'
  | 'scope'
  | 'none';

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
  groupId?: string;
  groupLabel?: string;
  layerPath?: string[];
  localContext?: string;
  nameSource?: BrowserNameSource;
  semanticConfidence?: number;
  clickabilityEvidence?: string;
  taskAlignment?: BrowserTaskAlignment;
  matchedGoalTerms?: number;
  effect?: BrowserActionEffect;
  framePath?: number[];
  selector?: string;
  score?: number;
  signature?: string;
}

export interface BrowserFact {
  id: string;
  label: string;
  role: string;
  kind: BrowserFactKind;
  currentValue?: string;
  checked?: string;
  selected?: string;
  expanded?: string;
  region: BrowserRegion;
  groupId: string;
  layerPath: string[];
  localContext?: string;
  nameSource: BrowserNameSource;
  semanticConfidence: number;
  clickabilityEvidence?: string;
  taskAlignment?: BrowserTaskAlignment;
  matchedGoalTerms?: number;
  visible: boolean;
  actionable: boolean;
  covered: boolean;
  disabled: boolean;
  score: number;
}

export interface BrowserWorkflowStep {
  index: number;
  label: string;
  status: string;
}

export interface BrowserValidationIssue {
  message: string;
  field?: string;
  groupId?: string;
  controlId?: string;
  required: boolean;
}

export interface BrowserActiveLayer {
  kind: 'dialog' | 'overlay';
  label: string;
}

export interface BrowserLayer {
  id: string;
  kind: 'page' | 'dialog' | 'popover' | 'menu' | 'listbox' | 'overlay';
  label: string;
  parentId?: string;
  blocking: boolean;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
  marker: string;
  progressMarker: string;
  actions: BrowserAction[];
  facts: BrowserFact[];
  layers: BrowserLayer[];
  alerts: string[];
  validationIssues: BrowserValidationIssue[];
  workflowSteps: BrowserWorkflowStep[];
  activeLayer?: BrowserActiveLayer;
  loading: boolean;
  omittedActions: number;
  omittedFacts?: number;
  textTruncated?: boolean;
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
  fromProgressMarker?: string;
  toProgressMarker?: string;
  signature?: string;
  recoveryEpoch?: number;
  feedback?: string[];
  group?: string;
}

interface JevChoiceQuestion {
  type: 'choice';
  criteria: Record<string, unknown>;
  instructions: Record<string, unknown>;
}

interface JevNoulQuestion {
  type: 'noul';
  criteria?: Record<'true' | 'false', string>;
  instructions: string | Record<string, unknown>;
}

export type JevQuestion = JevChoiceQuestion | JevNoulQuestion;

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
  answers?: Record<
    string,
    {
      type?: unknown;
      choice?: unknown;
      noul?: unknown;
      probabilities?: unknown;
      confidence?: unknown;
    }
  >;
  usage?: UsageResponse;
}
