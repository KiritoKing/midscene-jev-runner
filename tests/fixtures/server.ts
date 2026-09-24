import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from 'node:http';
import type {
  FixtureApp,
  FixtureContext,
  FixtureReply,
  MutableState,
} from './app-contract';
import encyclopediaApp from './apps/encyclopedia';
import marketingApp from './apps/marketing';
import travelApp from './apps/travel';

export type {
  FixtureAttempt,
  FixtureEvent,
  FixtureScenario,
  FixtureState,
} from './app-contract';
import type { FixtureScenario, FixtureState } from './app-contract';

export interface FixtureServer {
  origin: string;
  url(scenario: FixtureScenario, runId?: string): string;
  readState(runId: string): Promise<FixtureState>;
  close(): Promise<void>;
}

const apps: FixtureApp[] = [marketingApp, encyclopediaApp, travelApp];
const byScenario = new Map(
  apps.flatMap((app) =>
    app.scenarios.map((scenario) => [scenario, app] as const),
  ),
);
const namespace: Record<FixtureScenario, string> = {
  'marketing-clone': 'marketing',
  encyclopedia: 'encyclopedia',
  flights: 'travel',
  'flights-native-date': 'travel',
  hotel: 'travel',
};
const runIdPattern = /^[a-zA-Z0-9._-]{1,80}$/;

function snapshot(state: MutableState): FixtureState {
  return structuredClone({
    scenario: state.scenario,
    runId: state.runId,
    revision: state.revision,
    events: state.events,
    attempts: state.attempts,
    result: state.result,
  });
}

function send(response: ServerResponse, reply: FixtureReply): void {
  response.writeHead(reply.status, {
    'content-type':
      reply.contentType ??
      (typeof reply.body === 'string'
        ? 'text/html; charset=utf-8'
        : 'application/json; charset=utf-8'),
    'cache-control': 'no-store',
    'content-security-policy':
      "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-src 'self'",
  });
  response.end(
    typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body),
  );
}

function json(status: number, body: Record<string, unknown>): FixtureReply {
  return { status, body, contentType: 'application/json; charset=utf-8' };
}

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += data.length;
    if (size > 32_768) throw new Error('Request body too large');
    chunks.push(data);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Expected a JSON object');
  return parsed as Record<string, unknown>;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const states = new Map<string, MutableState>();
  let origin = '';
  const server = createServer(async (request, response) => {
    try {
      const address = new URL(request.url ?? '/', origin);
      if (request.method === 'GET' && address.pathname === '/api/state') {
        const state = states.get(address.searchParams.get('runId') ?? '');
        send(
          response,
          state
            ? json(200, snapshot(state) as unknown as Record<string, unknown>)
            : json(404, { error: 'Unknown run' }),
        );
        return;
      }
      const page = /^\/scenario\/([^/]+)(?:\/(.*))?$/.exec(address.pathname);
      const api = /^\/api\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(address.pathname);
      if (!page && !api) {
        send(response, json(404, { error: 'Unknown route' }));
        return;
      }
      const scenario = page ? (page[1] as FixtureScenario) : undefined;
      const runId = page
        ? (address.searchParams.get('runId') ?? '')
        : decodeURIComponent(api?.[2] ?? '');
      if (!runIdPattern.test(runId)) {
        send(response, json(400, { error: 'Invalid run ID' }));
        return;
      }
      let state = states.get(runId);
      if (page) {
        const app = byScenario.get(scenario as FixtureScenario);
        if (!app) {
          send(response, json(404, { error: 'Unknown scenario' }));
          return;
        }
        if (!state) {
          state = {
            scenario: scenario as FixtureScenario,
            runId,
            revision: 0,
            events: [],
            attempts: [],
            result: app.initialResult(scenario as FixtureScenario),
            submissions: new Map(),
          };
          states.set(runId, state);
        }
        if (state.scenario !== scenario) {
          send(
            response,
            json(409, { error: 'Run ID belongs to another scenario' }),
          );
          return;
        }
      } else {
        if (!state || namespace[state.scenario] !== api?.[1]) {
          send(response, json(404, { error: 'Unknown API run' }));
          return;
        }
      }
      const app = byScenario.get(state.scenario);
      if (!app) {
        send(response, json(404, { error: 'Unknown scenario' }));
        return;
      }
      const ctx: FixtureContext = {
        request,
        address,
        runId,
        scenario: state.scenario,
        tail: (page ? page[2] : api?.[3]) ?? '',
        kind: page ? 'page' : 'api',
        state,
        record(type, payload = {}) {
          state.revision += 1;
          state.events.push({ type, payload });
        },
        readJson: () => readJson(request),
      };
      send(response, await app.handle(ctx));
    } catch (error) {
      send(
        response,
        json(400, {
          error: error instanceof Error ? error.message : 'Bad request',
        }),
      );
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture server has no TCP address');
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    url(scenario, runId = randomUUID()) {
      if (!byScenario.has(scenario))
        throw new Error(`Unknown fixture scenario: ${scenario}`);
      if (!runIdPattern.test(runId)) throw new Error('Invalid run ID');
      return `${origin}/scenario/${scenario}?runId=${encodeURIComponent(runId)}`;
    },
    async readState(runId) {
      const response = await fetch(
        `${origin}/api/state?runId=${encodeURIComponent(runId)}`,
      );
      if (!response.ok)
        throw new Error(`Fixture state unavailable: ${response.status}`);
      return response.json() as Promise<FixtureState>;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
