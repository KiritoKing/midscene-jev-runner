import type { IncomingMessage } from 'node:http';

export type FixtureScenario =
  | 'marketing-clone'
  | 'encyclopedia'
  | 'flights'
  | 'flights-native-date'
  | 'hotel';

export interface FixtureEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface FixtureAttempt {
  operation: 'clone';
  submissionId: string | null;
  outcome: 'rejected' | 'committed' | 'replayed';
}

export interface FixtureState {
  scenario: FixtureScenario;
  runId: string;
  revision: number;
  events: FixtureEvent[];
  attempts: FixtureAttempt[];
  result: Record<string, unknown>;
}

export interface MutableState extends FixtureState {
  submissions: Map<string, Record<string, unknown>>;
}

export interface FixtureReply {
  status: number;
  body: string | Record<string, unknown>;
  contentType?: string;
}

export interface FixtureContext {
  request: IncomingMessage;
  address: URL;
  runId: string;
  scenario: FixtureScenario;
  /** Route tail without a leading slash. */
  tail: string;
  kind: 'page' | 'api';
  state: MutableState;
  record(type: string, payload?: Record<string, unknown>): void;
  readJson(): Promise<Record<string, unknown>>;
}

export interface FixtureApp {
  scenarios: readonly FixtureScenario[];
  initialResult(scenario: FixtureScenario): Record<string, unknown>;
  /** The app handles route-specific 404 and 405 replies. */
  handle(ctx: FixtureContext): Promise<FixtureReply>;
}

/**
 * Page routes use /scenario/:scenario[/tail]?runId=...; API routes use
 * /api/:namespace/:runId[/tail]. The app owns route-specific 404 and 405
 * responses after the fixture server resolves these common route shapes.
 */
