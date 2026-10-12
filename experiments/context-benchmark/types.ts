import type { Page } from 'playwright';

export type BenchmarkOperation =
  | 'CLICK'
  | 'TYPE_TEXT'
  | 'SELECT'
  | 'DISMISS'
  | 'SCROLL';

export type BenchmarkNameSource =
  | 'aria'
  | 'native-label'
  | 'attribute'
  | 'content'
  | 'nearby'
  | 'inferred'
  | 'unknown';

export interface BenchmarkLayer {
  id: string;
  kind: 'page' | 'dialog' | 'popover' | 'menu' | 'listbox' | 'overlay';
  label: string;
  parentId?: string;
  blocking: boolean;
}

export interface BenchmarkGroup {
  id: string;
  label: string;
  region: string;
  layerPath: string[];
  candidateRefs: string[];
  priority: number;
}

export type BenchmarkExecution =
  | {
      kind: 'locator';
      selector: string;
      framePath?: string[];
    }
  | { kind: 'keyboard'; key: string }
  | { kind: 'scroll'; selector?: string; delta: number; framePath?: string[] };

export interface BenchmarkCandidate {
  ref: string;
  operation: BenchmarkOperation;
  label: string;
  role: string;
  nameSource: BenchmarkNameSource;
  semanticConfidence: number;
  region: string;
  groupId: string;
  layerPath: string[];
  localContext?: string;
  currentValue?: string;
  visible: boolean;
  actionable: boolean;
  covered: boolean;
  disabled: boolean;
  score: number;
  execution: BenchmarkExecution;
  /** Test-only identity. It must never be rendered into a JEV request. */
  oracleId?: string;
}

export interface BenchmarkObservation {
  strategy: string;
  url: string;
  title: string;
  text: string;
  layers: BenchmarkLayer[];
  groups: BenchmarkGroup[];
  candidates: BenchmarkCandidate[];
  omittedCandidates: number;
  unsupported: string[];
}

export interface ContextStrategy {
  id: string;
  label: string;
  observe(page: Page, goal: string): Promise<BenchmarkObservation>;
}

export interface BenchmarkStep {
  operation: BenchmarkOperation;
  acceptableOracleIds: string[];
  value?: string;
}

export interface BenchmarkFixture {
  id: string;
  title: string;
  goal: string;
  setup(page: Page): Promise<void>;
  steps: BenchmarkStep[];
  verify(page: Page): Promise<boolean>;
}

export interface SelectionResult {
  operation: BenchmarkOperation | 'DONE' | 'BLOCKED';
  targetRef?: string;
  scopeId?: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  calls: number;
  elapsedMs: number;
  requestBytes: number;
}

export interface BenchmarkHistoryEntry {
  operation: BenchmarkOperation;
  label: string;
  groupId: string;
  layerPath: string[];
  outcome: 'executed' | 'no-effect' | 'failed';
}

export interface FixtureRunResult {
  fixtureId: string;
  strategyId: string;
  selectionMode: 'flat' | 'adaptive-two-stage';
  completed: boolean;
  targetRecall: number;
  targetTop1: number;
  candidateCount: number;
  actionableCount: number;
  contextBytes: number;
  decisionCalls: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  elapsedMs: number;
  actionErrors: number;
  recoveryActions: number;
  unsupported: string[];
  failure?: string;
}
