export const MAX_RECENT_ACTIONS = 10;
export const DEFAULT_MAX_NO_PROGRESS_STEPS = 5;
export const DEFAULT_MAX_STEPS = 60;
export const DEFAULT_MAX_TASK_MS = 180_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_JEV_BASE_URL = 'https://api.typesafe.ai/v1';
export const DEFAULT_JEV_MODEL_NAME = 'jev-latest';
export const DEFAULT_ASSERTION_THRESHOLD = 0.9;
export const DEFAULT_ASSERTION_EVIDENCE_THRESHOLD = 0.8;

export const MAX_GOAL_LENGTH = 4_000;
export const MAX_PAGE_TEXT_LENGTH = 6_000;
export const MAX_LABEL_LENGTH = 300;
export const MAX_FIELD_VALUE_LENGTH = 500;
// The decision API sees a globally ranked shortlist, never a per-operation
// multiplication of candidates.
export const MAX_DECISION_CANDIDATES = 24;
export const MIN_DECISION_CANDIDATES = 8;
export const MAX_DECISION_FACTS = 24;
export const MAX_DECISION_LAYERS = 20;
export const MAX_DECISION_REQUEST_BYTES = 40_000;
export const MAX_ASSERTION_FACTS = 48;
export const MAX_ASSERTION_CONTEXT_LENGTH = 2_000;
