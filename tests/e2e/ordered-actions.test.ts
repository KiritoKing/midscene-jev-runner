import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type Browser, chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveLiveModelConfig } from '../../scripts/live-model-config.mjs';
import { runJev } from '../../src/runner';
import type { JevObserverEvent } from '../../src/types';

const { missing, jev } = resolveLiveModelConfig(process.env);
if (missing.length)
  throw new Error(`LIVE_MODEL_E2E_CONFIG_MISSING: ${missing.join(', ')}`);
process.env.MIDSCENE_JEV_API_KEY = jev.apiKey;
process.env.MIDSCENE_JEV_BASE_URL = jev.baseUrl;
process.env.MIDSCENE_JEV_MODEL_NAME = jev.modelName;

// Caller-owned synthetic pages with an independent, exact event ledger. These
// cover temporal intent rather than a business workflow or prescribed targets.
const cases = [
  {
    name: 'checkbox-before-submit',
    toolbar: false,
    checked: false,
    goal: 'Enable Include attachment, then Send once.',
    expected: ['enable', 'commit:true'],
  },
  {
    name: 'toolbar-before-command',
    toolbar: true,
    checked: false,
    goal: 'Enable Signatures, then Compile once.',
    expected: ['enable', 'commit:true'],
  },
  {
    name: 'submit-before-checkbox',
    toolbar: false,
    checked: false,
    goal: 'First Send once without the attachment, then enable Include attachment.',
    expected: ['commit:false', 'enable'],
  },
  {
    name: 'already-enabled-submit',
    toolbar: false,
    checked: true,
    goal: 'Keep Include attachment enabled and Send once.',
    expected: ['commit:true'],
  },
];

describe('real-model ordered intent and counterexamples', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });
  afterAll(async () => {
    await browser?.close();
  });
  for (const spec of cases) {
    it(spec.name, async () => {
      const page = await browser.newPage();
      const decisions: JevObserverEvent[] = [];
      const wire: Array<Record<string, unknown>> = [];
      const artifactDir = resolve('tests/e2e/.artifacts');
      let error: string | undefined;
      try {
        await page.setContent(
          spec.toolbar
            ? '<main><h1>Build tools</h1><div role="toolbar"><button id="toggle" aria-pressed="false">Signatures</button><button id="commit">Compile</button></div><p role="status" id="status">Not compiled</p></main>'
            : `<main><h1>Message settings</h1><form><label><input id="toggle" type="checkbox" ${spec.checked ? 'checked' : ''}>Include attachment</label><button id="commit" type="submit">Send</button></form><p role="status" id="status">Not sent</p></main>`,
        );
        await page.evaluate(
          ({ toolbar }) => {
            const ledger: string[] = [];
            const toggle = document.querySelector('#toggle') as
              | HTMLInputElement
              | HTMLButtonElement;
            const status = document.querySelector('#status');
            const commitTarget = toolbar
              ? document.querySelector('#commit')
              : document.querySelector('form');
            if (!toggle || !status || !commitTarget)
              throw new Error('Missing fixture controls');
            const active = () =>
              toolbar
                ? toggle.getAttribute('aria-pressed') === 'true'
                : (toggle as HTMLInputElement).checked;
            toggle.addEventListener(toolbar ? 'click' : 'change', () => {
              if (toolbar)
                toggle.setAttribute('aria-pressed', String(!active()));
              ledger.push(active() ? 'enable' : 'disable');
              status.textContent = `Current option: ${active()}`;
            });
            const commit = (event: Event) => {
              event.preventDefault();
              ledger.push(`commit:${active()}`);
              status.textContent = `Submitted option: ${active()}`;
            };
            commitTarget.addEventListener(toolbar ? 'click' : 'submit', commit);
            Object.assign(window, { readLedger: () => [...ledger] });
          },
          { toolbar: spec.toolbar },
        );
        const ledger = () =>
          page.evaluate(() =>
            (window as unknown as { readLedger(): string[] }).readLedger(),
          );
        const result = await runJev(page, {
          goal: spec.goal,
          maxSteps: 8,
          maxTaskMs: 30_000,
          observer: (event) => decisions.push(event),
          verifyCompletion: async () =>
            JSON.stringify(await ledger()) === JSON.stringify(spec.expected),
          fetch: async (url, init) => {
            const request = JSON.parse(String(init?.body));
            const response = await globalThis.fetch(url, init);
            wire.push({
              request,
              status: response.status,
              response: await response.clone().json(),
            });
            return response;
          },
        });
        expect(result.completionVerified).toBe(true);
        expect(await ledger()).toEqual(spec.expected);
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        throw cause;
      } finally {
        await mkdir(artifactDir, { recursive: true });
        await writeFile(
          resolve(artifactDir, `ordered-${spec.name}-${randomUUID()}.json`),
          JSON.stringify(
            {
              model: jev.modelName,
              goal: spec.goal,
              expected: spec.expected,
              events: await page.evaluate(() =>
                (
                  window as unknown as { readLedger?: () => string[] }
                ).readLedger?.(),
              ),
              decisions,
              wire,
              error,
            },
            null,
            2,
          ),
        );
        await page.close();
      }
    });
  }
});
