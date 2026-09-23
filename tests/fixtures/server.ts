import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from 'node:http';

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

export interface FixtureServer {
  origin: string;
  url(scenario: FixtureScenario, runId?: string): string;
  readState(runId: string): Promise<FixtureState>;
  close(): Promise<void>;
}

interface MutableState extends FixtureState {
  submissions: Map<string, Record<string, unknown>>;
}

const scenarios: FixtureScenario[] = [
  'marketing-clone',
  'encyclopedia',
  'flights',
  'flights-native-date',
  'hotel',
];
const runIdPattern = /^[a-zA-Z0-9._-]{1,80}$/;
const source = {
  id: 'campaign-source-01',
  name: 'Blue Meridian',
  status: 'active',
  budget: 12500,
  channel: 'Web',
  objective: 'Awareness',
};

function initialResult(scenario: FixtureScenario): Record<string, unknown> {
  switch (scenario) {
    case 'marketing-clone':
      return {
        source: { ...source },
        copies: [],
        latestCopy: null,
        wizard: {
          stage: 'closed',
          sourceId: null,
          name: null,
          useSourceSettings: null,
        },
      };
    case 'encyclopedia':
      return {
        query: '',
        articleId: null,
        articleTitle: null,
        navigated: false,
      };
    case 'flights':
    case 'flights-native-date':
      return {
        origin: null,
        destination: null,
        tripType: null,
        departureDate: null,
        adults: null,
        cabin: null,
        resultsVisible: false,
      };
    case 'hotel':
      return {
        city: null,
        design: false,
        freeCancellation: false,
        resultsVisible: false,
        openedHotelId: null,
        openedHotelTitle: null,
      };
  }
}

function record(
  state: MutableState,
  type: string,
  payload: Record<string, unknown> = {},
): void {
  state.revision += 1;
  state.events.push({ type, payload });
}

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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function send(
  response: ServerResponse,
  status: number,
  body: string | Record<string, unknown>,
  contentType = 'text/html; charset=utf-8',
): void {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'content-security-policy':
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-src 'self'",
  });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function json(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  send(response, status, body, 'application/json; charset=utf-8');
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

const style = `<style>
  :root { font: 16px/1.45 system-ui, sans-serif; color: #18212c; background: #f5f7f9; }
  body { margin: 0; } header { background: #172a3c; color: white; padding: 14px 24px; }
  main { max-width: 1100px; margin: 24px auto; padding: 0 20px; }
  nav { display: flex; gap: 12px; align-items: center; margin: 16px 0; }
  button, input, select { font: inherit; padding: 8px 11px; }
  button, a.button { cursor: pointer; border: 1px solid #9eb0c1; border-radius: 5px; background: white; color: #102f4b; }
  button:hover, a.button:hover { background: #e6eff9; }
  a { color: #145494; } label { display: block; margin: 10px 0; }
  input { border: 1px solid #a8b6c3; border-radius: 5px; }
  .card, section.panel { background: white; border: 1px solid #d6dee5; border-radius: 7px; padding: 20px; margin: 14px 0; }
  .muted { color: #566779; } .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  [hidden] { display: none !important; } .notice { color: #9b3f1e; }
</style>`;

function document(title: string, body: string, script = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${style}</head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;
}

function marketingPage(runId: string): string {
  const script = `
    const runId = ${JSON.stringify(runId)};
    const api = '/api/marketing/' + encodeURIComponent(runId) + '/';
    const fault = new URLSearchParams(location.search).get('fault');
    const shell = document.querySelector('#shell');
    const app = document.createElement('campaign-workspace');
    shell.append(app);
    customElements.define('campaign-workspace', class extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = '<style>:host{display:block;font:16px system-ui;color:#18212c}button,input{font:inherit;padding:8px 11px}button{cursor:pointer;border:1px solid #9eb0c1;background:white;border-radius:5px}section{background:white;border:1px solid #d6dee5;border-radius:7px;padding:18px;margin:12px 0}[hidden]{display:none!important}.row{display:flex;gap:12px;align-items:center}.notice{color:#9b3f1e}</style>' +
          '<nav class="row" aria-label="Workspace sections"><button id="home-tab" type="button"><span><span>Overview</span></span></button><button id="campaign-tab" type="button"><span><span>Campaigns</span></span></button><button id="report-tab" type="button"><span>Reports</span></button></nav>' +
          '<section id="home"><h1>Workspace overview</h1><p>Choose a section to work with campaigns.</p></section>' +
          '<section id="campaigns" hidden><h1>Campaigns</h1><p id="loading">Loading campaigns…</p><div id="catalog" hidden><div class="row"><strong id="source-name"></strong><span>Active</span><button id="source-row" type="button">Open campaign</button></div></div><section id="details" hidden><h2 id="detail-name"></h2><p id="detail-metadata"></p><button id="more" type="button"><span>More</span><span> actions</span></button><div id="menu" hidden><button id="duplicate" type="button">Duplicate campaign</button></div></section><section id="dialog" hidden><h2>Duplicate campaign</h2><ol><li>Basic information</li><li>Configuration</li><li>Review and create</li></ol><section id="stage-base"><h3>Basic information</h3><label>New campaign name <input id="name" aria-label="New campaign name" autocomplete="off"></label><button id="next-base" type="button">Continue to configuration</button></section><section id="stage-config" hidden><h3>Configuration</h3><p>Budget: 12500 · Channel: Web · Objective: Awareness</p><label><input id="source-settings" type="checkbox" checked> Use source settings</label><button id="next-config" type="button">Review copy</button></section><section id="stage-review" hidden><h3>Review and create</h3><p id="review-name"></p><p>New draft, source preserved, budget and channel copied.</p><button id="submit" type="button">Create draft copy</button></section><p id="message" role="status"></p></section></section>' +
          '<section id="reports" hidden><h1>Reports</h1><iframe title="Archived report preview" srcdoc="<button type=button>Duplicate campaign</button>"></iframe></section>';
        const $ = (selector) => root.querySelector(selector);
        const post = async (action, body = {}) => {
          const endpoint = api + action + (action === 'clone' && fault ? '?fault=' + encodeURIComponent(fault) : '');
          const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          const value = await response.json();
          if (!response.ok) throw new Error(value.error || 'Request failed');
          return value;
        };
        $('#home-tab').onclick = () => { $('#home').hidden = false; $('#campaigns').hidden = true; $('#reports').hidden = true; };
        $('#report-tab').onclick = () => { $('#home').hidden = true; $('#campaigns').hidden = true; $('#reports').hidden = false; };
        $('#campaign-tab').onclick = async () => {
          $('#home').hidden = true; $('#campaigns').hidden = false; $('#reports').hidden = true;
          $('#loading').hidden = false; $('#catalog').hidden = true;
          try {
            await post('open-tab');
            const response = await fetch(api + 'catalog');
            if (!response.ok) throw new Error('Catalog unavailable');
            const catalog = await response.json();
            $('#source-name').textContent = catalog.sources[0].name;
            $('#catalog').hidden = false; $('#loading').hidden = true;
          } catch (error) { $('#loading').textContent = String(error); }
        };
        $('#source-row').onclick = async () => {
          try {
            await post('select-source', { sourceId: 'campaign-source-01' });
            const response = await fetch(api + 'source-detail');
            if (!response.ok) throw new Error('Campaign details unavailable');
            const value = await response.json();
            $('#detail-name').textContent = value.name;
            $('#detail-metadata').textContent = 'Campaign ID: ' + value.id + ' · Budget: ' + value.budget + ' · Channel: ' + value.channel;
            $('#details').hidden = false;
          }
          catch (error) { $('#loading').textContent = String(error); }
        };
        $('#more').onclick = () => { $('#menu').hidden = !$('#menu').hidden; };
        $('#duplicate').onclick = async () => {
          try { await post('open-clone', { sourceId: 'campaign-source-01' }); $('#menu').hidden = true; $('#dialog').hidden = false; }
          catch (error) { $('#message').textContent = String(error); }
        };
        $('#next-base').onclick = async () => {
          try {
            const value = await post('stage-base', { name: $('#name').value });
            $('#stage-base').hidden = true; $('#stage-config').hidden = false;
            $('#message').textContent = 'Name saved: ' + value.name;
          } catch (error) { $('#message').textContent = String(error); }
        };
        $('#next-config').onclick = async () => {
          try {
            const value = await post('stage-config', { useSourceSettings: $('#source-settings').checked });
            $('#stage-config').hidden = true; $('#stage-review').hidden = false;
            $('#review-name').textContent = 'New campaign: ' + value.name;
            $('#message').textContent = '';
          } catch (error) { $('#message').textContent = String(error); }
        };
        let submissionId = crypto.randomUUID();
        $('#submit').onclick = async () => {
          $('#submit').disabled = true;
          try {
            const copy = await post('clone', { sourceId: 'campaign-source-01', submissionId });
            $('#message').textContent = 'Draft created: ' + copy.id + ' · ' + copy.name;
          } catch (error) {
            $('#message').textContent = String(error);
            $('#submit').disabled = false;
          }
        };
      }
    });
  `;
  return document(
    'Campaign workspace',
    '<header>Local Campaign Workspace</header><main><div id="shell"></div><section hidden aria-hidden="true"><button type="button">Create draft copy</button></section></main>',
    script,
  );
}

function encyclopediaPage(
  runId: string,
  pathname: string,
  query: URLSearchParams,
): string {
  const encodedRunId = encodeURIComponent(runId);
  if (pathname.endsWith('/results')) {
    const q = query.get('q') ?? '';
    const matching = /g[oö]del|incompleteness/i.test(q);
    return document(
      'Atlas search results',
      `<header>Atlas Reference</header><main><h1>Search results</h1><p>Results for <strong>${escapeHtml(q)}</strong></p>${matching ? `<section class="card"><h2><a href="/scenario/encyclopedia/article/godel-incompleteness?runId=${encodedRunId}">Gödel incompleteness theorems</a></h2><p>A foundational result in mathematical logic.</p></section>` : '<p>No matching articles.</p>'}<a href="/scenario/encyclopedia?runId=${encodedRunId}">New search</a></main>`,
    );
  }
  if (pathname.includes('/article/')) {
    return document(
      'Gödel incompleteness theorems',
      `<header>Atlas Reference</header><main><article class="card"><h1>Gödel incompleteness theorems</h1><p>The theorems describe limits of sufficiently expressive formal systems.</p><p>Article ID: godel-incompleteness</p></article><a href="/scenario/encyclopedia?runId=${encodedRunId}">Atlas home</a></main>`,
    );
  }
  return document(
    'Atlas Reference',
    `<header>Atlas Reference</header><main><h1>Explore the atlas</h1><form action="/scenario/encyclopedia/results" method="get"><input type="hidden" name="runId" value="${escapeHtml(runId)}"><label>Search articles <input name="q" aria-label="Search articles" autocomplete="off" required></label><button type="submit">Search</button></form><p class="muted">A local reference collection.</p></main>`,
  );
}

function flightsPage(
  runId: string,
  scenario: 'flights' | 'flights-native-date',
  pathname: string,
  query: URLSearchParams,
): string {
  const encodedRunId = encodeURIComponent(runId);
  if (pathname.endsWith('/results')) {
    return document(
      'Flight results',
      `<header>Skyline Flights</header><main><h1>Available flights</h1><p>Zurich to London · One-way · ${escapeHtml(query.get('date') ?? '')} · 1 adult · Economy</p><section class="card"><h2>Skyline 401</h2><p>Zurich (ZRH) → London (LHR)</p><p>07:40 – 09:20</p></section><section class="card"><h2>Skyline 503</h2><p>Zurich (ZRH) → London (LHR)</p><p>13:10 – 14:50</p></section><a href="/scenario/${scenario}?runId=${encodedRunId}">Change search</a></main>`,
    );
  }
  const days = Array.from({ length: 30 }, (_, index) => {
    const day = index + 1;
    const iso = `2026-11-${String(day).padStart(2, '0')}`;
    return `<button type="button" data-date="${iso}" aria-label="${day} November 2026">${day}</button>`;
  }).join('');
  const dateControl =
    scenario === 'flights-native-date'
      ? '<label>Departure date <input name="date" aria-label="Departure date" type="date" required></label>'
      : `<label>Departure date <button id="date-picker" type="button" aria-expanded="false">Choose departure date</button><input id="departure-date" name="date" type="hidden" value=""></label><section id="calendar" class="card" aria-label="November 2026 calendar" hidden><h2>November 2026</h2><div style="display:grid;grid-template-columns:repeat(7,minmax(44px,1fr));gap:6px;max-width:510px">${days}</div></section>`;
  const script = `
    const tripMenu = document.querySelector('#trip-menu');
    document.querySelector('#trip-picker').onclick = () => { tripMenu.hidden = !tripMenu.hidden; };
    document.querySelectorAll('[data-trip]').forEach((option) => {
      option.onclick = () => { document.querySelector('#trip-type').value = option.dataset.trip; document.querySelector('#trip-picker').textContent = option.textContent; tripMenu.hidden = true; document.querySelector('#return-date').hidden = option.dataset.trip === 'one-way'; };
    });
    const datePicker = document.querySelector('#date-picker');
    if (datePicker) {
      const calendar = document.querySelector('#calendar');
      datePicker.onclick = () => { calendar.hidden = !calendar.hidden; datePicker.setAttribute('aria-expanded', String(!calendar.hidden)); };
      calendar.querySelectorAll('[data-date]').forEach((day) => {
        day.onclick = () => {
          document.querySelector('#departure-date').value = day.dataset.date;
          datePicker.textContent = 'Departure: ' + day.getAttribute('aria-label');
          datePicker.setAttribute('aria-expanded', 'false');
          calendar.hidden = true;
        };
      });
    }
  `;
  return document(
    'Skyline Flights',
    `<header>Skyline Flights</header><main><h1>Find a flight</h1><form action="/scenario/${scenario}/results" method="get" class="card"><input type="hidden" name="runId" value="${escapeHtml(runId)}"><div class="row"><label>From <select name="origin" aria-label="From" required><option value="">Choose origin</option><option value="Zurich">Zurich (ZRH)</option><option value="Paris">Paris (CDG)</option></select></label><label>To <select name="destination" aria-label="To" required><option value="">Choose destination</option><option value="London">London (LHR)</option><option value="Berlin">Berlin (BER)</option></select></label></div><label>Trip type <button id="trip-picker" type="button">Round trip</button><input id="trip-type" type="hidden" name="tripType" value="round-trip"></label><div id="trip-menu" class="card" hidden><button type="button" data-trip="one-way">One-way</button><button type="button" data-trip="round-trip">Round trip</button></div>${dateControl}<label id="return-date">Return date <input name="returnDate" aria-label="Return date" type="date"></label><div class="row"><label>Adults <select name="adults" aria-label="Adults"><option value="1">1 adult</option><option value="2">2 adults</option></select></label><label>Cabin <select name="cabin" aria-label="Cabin"><option value="economy">Economy</option><option value="business">Business</option></select></label></div><button type="submit">Search flights</button></form></main>`,
    script,
  );
}

function hotelPage(
  runId: string,
  pathname: string,
  query: URLSearchParams,
): string {
  const encodedRunId = encodeURIComponent(runId);
  if (pathname.endsWith('/casa-flora')) {
    return document(
      'Casa Flora',
      `<header>Stayfinder</header><main><article class="card"><h1>Casa Flora</h1><p>Design hotel in Lisbon</p><p>Free cancellation available</p><p>Hotel ID: casa-flora</p></article><a href="/scenario/hotel/results?runId=${encodedRunId}&city=Lisbon&design=on&freeCancellation=on">Back to results</a></main>`,
    );
  }
  if (pathname.endsWith('/results')) {
    const qualified =
      query.get('city')?.trim().toLowerCase() === 'lisbon' &&
      query.get('design') === 'on' &&
      query.get('freeCancellation') === 'on';
    return document(
      'Hotel results',
      `<header>Stayfinder</header><main><h1>Stays in ${escapeHtml(query.get('city') ?? '')}</h1><p>Filters: ${query.get('design') === 'on' ? 'Design' : 'Any style'} · ${query.get('freeCancellation') === 'on' ? 'Free cancellation' : 'Any cancellation'}</p>${qualified ? `<section class="card"><h2><a href="/scenario/hotel/casa-flora?runId=${encodedRunId}">Casa Flora</a></h2><p>Design stay · Free cancellation</p></section>` : '<p>No stays match all selected filters.</p>'}<a href="/scenario/hotel?runId=${encodedRunId}">Edit filters</a></main>`,
    );
  }
  return document(
    'Stayfinder',
    `<header>Stayfinder</header><main><h1>Find a stay</h1><form class="card" action="/scenario/hotel/results" method="get"><input type="hidden" name="runId" value="${escapeHtml(runId)}"><label>Destination <input name="city" aria-label="Destination" autocomplete="off" required></label><fieldset><legend>Style</legend><label><input type="checkbox" name="design" value="on"> Design</label></fieldset><fieldset><legend>Booking options</legend><label><input type="checkbox" name="freeCancellation" value="on"> Free cancellation</label></fieldset><button type="submit">Search stays</button></form></main>`,
  );
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const states = new Map<string, MutableState>();
  let origin = '';
  const server = createServer(async (request, response) => {
    try {
      const address = new URL(request.url ?? '/', origin);
      const runId = address.searchParams.get('runId') ?? '';
      if (request.method === 'GET' && address.pathname === '/api/state') {
        const state = states.get(runId);
        return state
          ? json(
              response,
              200,
              snapshot(state) as unknown as Record<string, unknown>,
            )
          : json(response, 404, { error: 'Unknown run' });
      }
      const api = /^\/api\/marketing\/([^/]+)\/([^/]+)$/.exec(address.pathname);
      if (api) {
        const state = states.get(decodeURIComponent(api[1]));
        if (!state || state.scenario !== 'marketing-clone')
          return json(response, 404, { error: 'Unknown marketing run' });
        const action = api[2];
        if (request.method === 'POST' && action === 'open-tab') {
          if (!state.events.some((event) => event.type === 'campaignsOpened'))
            record(state, 'campaignsOpened');
          return json(response, 200, { ok: true });
        }
        if (request.method === 'GET' && action === 'catalog') {
          if (!state.events.some((event) => event.type === 'campaignsOpened'))
            return json(response, 409, {
              error: 'Open the Campaigns section first',
            });
          await new Promise((resolve) => setTimeout(resolve, 90));
          if (!state.events.some((event) => event.type === 'catalogLoaded'))
            record(state, 'catalogLoaded');
          return json(response, 200, { sources: [source] });
        }
        if (request.method === 'POST' && action === 'select-source') {
          const body = await readJson(request);
          if (
            !state.events.some((event) => event.type === 'catalogLoaded') ||
            body.sourceId !== source.id
          )
            return json(response, 409, { error: 'Source unavailable' });
          if (!state.events.some((event) => event.type === 'sourceSelected'))
            record(state, 'sourceSelected', { sourceId: source.id });
          return json(response, 200, { source });
        }
        if (request.method === 'GET' && action === 'source-detail') {
          if (!state.events.some((event) => event.type === 'sourceSelected'))
            return json(response, 409, { error: 'Select a source first' });
          await new Promise((resolve) => setTimeout(resolve, 90));
          if (
            !state.events.some((event) => event.type === 'sourceDetailLoaded')
          )
            record(state, 'sourceDetailLoaded', { sourceId: source.id });
          return json(response, 200, source);
        }
        if (request.method === 'POST' && action === 'open-clone') {
          const body = await readJson(request);
          if (
            !state.events.some(
              (event) => event.type === 'sourceDetailLoaded',
            ) ||
            body.sourceId !== source.id
          )
            return json(response, 409, { error: 'Load source details first' });
          if (!state.events.some((event) => event.type === 'cloneDialogOpened'))
            record(state, 'cloneDialogOpened', { sourceId: source.id });
          state.result.wizard = {
            stage: 'base',
            sourceId: source.id,
            name: null,
            useSourceSettings: null,
          };
          return json(response, 200, { ok: true });
        }
        if (request.method === 'POST' && action === 'stage-base') {
          const body = await readJson(request);
          const wizard = state.result.wizard as Record<string, unknown>;
          if (wizard.stage !== 'base')
            return json(response, 409, {
              error: 'Open basic information first',
            });
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name || name.length > 80)
            return json(response, 422, {
              error: 'Enter a campaign name of at most 80 characters',
            });
          wizard.name = name;
          wizard.stage = 'configuration';
          record(state, 'baseCompleted', { name });
          return json(response, 200, { name, stage: wizard.stage });
        }
        if (request.method === 'POST' && action === 'stage-config') {
          const body = await readJson(request);
          const wizard = state.result.wizard as Record<string, unknown>;
          if (wizard.stage !== 'configuration')
            return json(response, 409, {
              error: 'Complete basic information first',
            });
          if (body.useSourceSettings !== true)
            return json(response, 422, {
              error: 'Select source settings for this copy',
            });
          wizard.useSourceSettings = true;
          wizard.stage = 'review';
          record(state, 'configurationCompleted', {
            budget: source.budget,
            channel: source.channel,
            objective: source.objective,
          });
          return json(response, 200, {
            name: wizard.name,
            stage: wizard.stage,
          });
        }
        if (request.method === 'POST' && action === 'clone') {
          const body = await readJson(request);
          const submissionId = body.submissionId;
          const attempt: FixtureAttempt = {
            operation: 'clone',
            submissionId:
              typeof submissionId === 'string' ? submissionId : null,
            outcome: 'rejected',
          };
          state.attempts.push(attempt);
          if (
            typeof submissionId !== 'string' ||
            !runIdPattern.test(submissionId)
          )
            return json(response, 400, { error: 'Invalid submission ID' });
          const prior = state.submissions.get(submissionId);
          if (prior) {
            attempt.outcome = 'replayed';
            return json(response, 200, prior);
          }
          const wizard = state.result.wizard as Record<string, unknown>;
          if (
            wizard.stage !== 'review' ||
            wizard.sourceId !== source.id ||
            body.sourceId !== source.id
          )
            return json(response, 409, { error: 'Review the copy first' });
          const name = String(wizard.name);
          const copies = state.result.copies as Array<Record<string, unknown>>;
          const copy = {
            id: `campaign-copy-${state.runId}-${String(copies.length + 1).padStart(3, '0')}`,
            name,
            sourceId: source.id,
            status: 'draft',
            budget: source.budget,
            channel: source.channel,
            objective: source.objective,
          };
          copies.push(copy);
          state.result.latestCopy = copy;
          wizard.stage = 'completed';
          state.submissions.set(submissionId, copy);
          attempt.outcome = 'committed';
          record(state, 'cloneCreated', {
            id: copy.id,
            sourceId: source.id,
            name,
          });
          if (address.searchParams.get('fault') === 'clone-commit-503')
            return json(response, 503, {
              error: 'Response unavailable after commit',
            });
          return json(response, 200, copy);
        }
        return json(response, 404, { error: 'Unknown API operation' });
      }
      if (request.method !== 'GET')
        return json(response, 405, { error: 'Method not allowed' });
      const match = /^\/scenario\/([^/]+)(?:\/(.*))?$/.exec(address.pathname);
      if (!match || !scenarios.includes(match[1] as FixtureScenario))
        return json(response, 404, { error: 'Unknown scenario' });
      const scenario = match[1] as FixtureScenario;
      if (!runIdPattern.test(runId))
        return json(response, 400, { error: 'Invalid run ID' });
      let state = states.get(runId);
      if (!state) {
        state = {
          scenario,
          runId,
          revision: 0,
          events: [],
          attempts: [],
          result: initialResult(scenario),
          submissions: new Map(),
        };
        states.set(runId, state);
      }
      if (state.scenario !== scenario)
        return json(response, 409, {
          error: 'Run ID belongs to another scenario',
        });
      if (scenario === 'marketing-clone')
        return send(response, 200, marketingPage(runId));
      if (scenario === 'encyclopedia') {
        const tail = match[2] ?? '';
        if (tail === 'results') {
          const query = address.searchParams.get('q')?.trim() ?? '';
          if (!query)
            return json(response, 400, { error: 'Search query required' });
          state.result.query = query;
          record(state, 'searchSubmitted', { query });
        } else if (tail === 'article/godel-incompleteness') {
          if (!/g[oö]del|incompleteness/i.test(String(state.result.query)))
            return json(response, 409, { error: 'Search first' });
          state.result.articleId = 'godel-incompleteness';
          state.result.articleTitle = 'Gödel incompleteness theorems';
          state.result.navigated = true;
          record(state, 'articleOpened', { articleId: 'godel-incompleteness' });
        } else if (tail) return json(response, 404, { error: 'Unknown page' });
        return send(
          response,
          200,
          encyclopediaPage(runId, address.pathname, address.searchParams),
        );
      }
      if (scenario === 'flights' || scenario === 'flights-native-date') {
        const tail = match[2] ?? '';
        if (tail === 'results') {
          const params = address.searchParams;
          const origin = params.get('origin');
          const destination = params.get('destination');
          const tripType = params.get('tripType');
          const departureDate = params.get('date');
          const adults = Number(params.get('adults'));
          const cabin = params.get('cabin');
          if (
            origin !== 'Zurich' ||
            destination !== 'London' ||
            tripType !== 'one-way' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(departureDate ?? '') ||
            adults !== 1 ||
            cabin !== 'economy'
          )
            return json(response, 422, {
              error:
                'Complete the Zurich to London one-way search for 1 adult in Economy',
            });
          Object.assign(state.result, {
            origin,
            destination,
            tripType,
            departureDate,
            adults,
            cabin,
            resultsVisible: true,
          });
          record(state, 'flightResultsOpened', {
            origin,
            destination,
            tripType,
            departureDate,
            adults,
            cabin,
          });
        } else if (tail) return json(response, 404, { error: 'Unknown page' });
        return send(
          response,
          200,
          flightsPage(runId, scenario, address.pathname, address.searchParams),
        );
      }
      const tail = match[2] ?? '';
      if (tail === 'results') {
        const city = address.searchParams.get('city')?.trim() ?? '';
        const design = address.searchParams.get('design') === 'on';
        const freeCancellation =
          address.searchParams.get('freeCancellation') === 'on';
        Object.assign(state.result, {
          city,
          design,
          freeCancellation,
          resultsVisible: true,
        });
        record(state, 'hotelResultsOpened', { city, design, freeCancellation });
      } else if (tail === 'casa-flora') {
        if (
          state.result.city !== 'Lisbon' ||
          state.result.design !== true ||
          state.result.freeCancellation !== true
        )
          return json(response, 409, { error: 'Apply all filters first' });
        state.result.openedHotelId = 'casa-flora';
        state.result.openedHotelTitle = 'Casa Flora';
        record(state, 'hotelOpened', { hotelId: 'casa-flora' });
      } else if (tail) return json(response, 404, { error: 'Unknown page' });
      return send(
        response,
        200,
        hotelPage(runId, address.pathname, address.searchParams),
      );
    } catch (error) {
      json(response, 400, {
        error: error instanceof Error ? error.message : 'Bad request',
      });
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
      if (!scenarios.includes(scenario))
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
