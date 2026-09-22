import type { Frame, Page } from 'playwright';
import type { BenchmarkFixture } from './types';

const statusIs = async (page: Page, expected: string): Promise<boolean> =>
  (await page.locator('[data-benchmark-status]').textContent()) === expected;

const frameBySelector = async (
  page: Page,
  selector: string,
): Promise<Frame> => {
  const handle = await page.locator(selector).elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error(`Fixture frame ${selector} was not available.`);
  return frame;
};

export const benchmarkFixtures: BenchmarkFixture[] = [
  {
    id: 'weak-semantics',
    title: 'Weak semantics with nearby context',
    goal: 'Open notification preferences.',
    setup: async (page) => {
      await page.setContent(`
        <main>
          <section class="card">
            <h2>Notification preferences</h2>
            <p>Choose how product updates reach you.</p>
            <div
              data-benchmark-id="notification-preferences"
              tabindex="0"
              style="cursor: pointer; width: 32px; height: 32px"
              onclick="document.querySelector('[data-benchmark-status]').textContent = 'opened'"
            ><svg aria-hidden="true" width="20" height="20"><circle cx="10" cy="10" r="8"></circle></svg></div>
          </section>
          <section class="card"><h2>Billing</h2><div tabindex="0" style="cursor:pointer">Open</div></section>
          <p data-benchmark-status>closed</p>
        </main>
      `);
    },
    steps: [
      {
        operation: 'CLICK',
        acceptableOracleIds: ['notification-preferences'],
      },
    ],
    verify: (page) => statusIs(page, 'opened'),
  },
  {
    id: 'duplicate-labels',
    title: 'Duplicate controls in different regions',
    goal: 'Continue the account review form.',
    setup: async (page) => {
      await page.setContent(`
        <header><nav><button data-benchmark-id="nav-continue">Continue</button></nav></header>
        <aside><button data-benchmark-id="aside-continue">Continue</button></aside>
        <main>
          <form aria-label="Account review">
            <h1>Account review</h1>
            <p>All required details are complete.</p>
            <button
              type="button"
              data-benchmark-id="review-continue"
              onclick="document.querySelector('[data-benchmark-status]').textContent = 'continued'"
            >Continue</button>
          </form>
          <p data-benchmark-status>waiting</p>
        </main>
      `);
    },
    steps: [{ operation: 'CLICK', acceptableOracleIds: ['review-continue'] }],
    verify: (page) => statusIs(page, 'continued'),
  },
  {
    id: 'candidate-budget',
    title: 'Relevant target after the flat candidate budget',
    goal: 'Approve the final review.',
    setup: async (page) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.setContent(`
        <style>
          #noise { display: grid; grid-template-columns: repeat(40, 1fr); gap: 1px; }
          #noise button { height: 18px; overflow: hidden; font-size: 8px; }
        </style>
        <main>
          <div id="noise"></div>
          <button
            data-benchmark-id="approve-final-review"
            onclick="document.querySelector('[data-benchmark-status]').textContent = 'approved'"
          >Approve final review</button>
          <p data-benchmark-status>pending</p>
        </main>
        <script>
          const noise = document.querySelector('#noise');
          for (let index = 1; index <= 320; index += 1) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Item ' + index;
            noise.append(button);
          }
        </script>
      `);
    },
    steps: [
      {
        operation: 'CLICK',
        acceptableOracleIds: ['approve-final-review'],
      },
    ],
    verify: (page) => statusIs(page, 'approved'),
  },
  {
    id: 'repeated-cards',
    title: 'Repeated labels across semantic card groups',
    goal: 'Open Workspace Aurora.',
    setup: async (page) => {
      await page.setContent(`
        <main>
          <h1>Workspaces</h1>
          <div id="cards" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"></div>
          <p data-benchmark-status>closed</p>
        </main>
        <script>
          const names = ['Atlas', 'Beacon', 'Cedar', 'Delta', 'Ember', 'Fjord', 'Grove', 'Harbor', 'Ion', 'Juniper', 'Kite', 'Aurora'];
          const cards = document.querySelector('#cards');
          for (const name of names) {
            const card = document.createElement('section');
            card.innerHTML = '<h2>Workspace ' + name + '</h2><p>Team workspace</p><button>Open</button>';
            const button = card.querySelector('button');
            button.dataset.benchmarkId = name === 'Aurora' ? 'workspace-aurora' : 'workspace-' + name.toLowerCase();
            button.addEventListener('click', () => {
              document.querySelector('[data-benchmark-status]').textContent = name;
            });
            cards.append(card);
          }
        </script>
      `);
    },
    steps: [{ operation: 'CLICK', acceptableOracleIds: ['workspace-aurora'] }],
    verify: (page) => statusIs(page, 'Aurora'),
  },
  {
    id: 'nested-portal',
    title: 'Dialog with a portal-rendered listbox',
    goal: 'Choose Priority shipping in the checkout dialog and confirm checkout.',
    setup: async (page) => {
      await page.setContent(`
        <main><button data-benchmark-id="background-action">Search catalog</button></main>
        <div role="dialog" aria-modal="true" aria-label="Checkout" id="checkout">
          <h1>Checkout</h1>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-controls="shipping-options"
            aria-expanded="false"
            data-benchmark-id="shipping-trigger"
          >Shipping method: Standard</button>
          <button
            type="button"
            data-benchmark-id="confirm-checkout"
            onclick="document.querySelector('[data-benchmark-status]').textContent = 'confirmed'"
          >Confirm checkout</button>
        </div>
        <p data-benchmark-status>pending</p>
        <script>
          const trigger = document.querySelector('[data-benchmark-id="shipping-trigger"]');
          trigger.addEventListener('click', () => {
            trigger.setAttribute('aria-expanded', 'true');
            const listbox = document.createElement('div');
            listbox.id = 'shipping-options';
            listbox.setAttribute('role', 'listbox');
            listbox.setAttribute('aria-label', 'Shipping options');
            listbox.style.cssText = 'position:fixed;left:20px;top:100px;z-index:50;background:white;padding:12px';
            listbox.innerHTML = '<button role="option" data-benchmark-id="standard-shipping">Standard shipping</button><button role="option" data-benchmark-id="priority-shipping">Priority shipping</button>';
            listbox.querySelector('[data-benchmark-id="priority-shipping"]').addEventListener('click', () => {
              trigger.textContent = 'Shipping method: Priority';
              trigger.setAttribute('aria-expanded', 'false');
              listbox.remove();
            });
            document.body.append(listbox);
          });
        </script>
      `);
    },
    steps: [
      { operation: 'CLICK', acceptableOracleIds: ['shipping-trigger'] },
      { operation: 'CLICK', acceptableOracleIds: ['priority-shipping'] },
      { operation: 'CLICK', acceptableOracleIds: ['confirm-checkout'] },
    ],
    verify: (page) => statusIs(page, 'confirmed'),
  },
  {
    id: 'layer-recovery',
    title: 'Dismiss an unrelated blocking dialog and resume its parent',
    goal: 'Dismiss the release notes and continue setup.',
    setup: async (page) => {
      await page.setContent(`
        <main>
          <h1>Setup</h1>
          <button
            data-benchmark-id="setup-continue"
            onclick="document.querySelector('[data-benchmark-status]').textContent = 'continued'"
          >Continue setup</button>
        </main>
        <div
          id="release-notes"
          role="dialog"
          aria-modal="true"
          aria-label="Release notes"
          style="position:fixed;inset:0;z-index:20;background:white"
        >
          <h2>Release notes</h2>
          <button
            aria-label="Close"
            data-benchmark-id="dismiss-release-notes"
            style="position:absolute;right:8px;top:8px"
            onclick="document.querySelector('#release-notes').remove()"
          >×</button>
        </div>
        <p data-benchmark-status>waiting</p>
      `);
    },
    steps: [
      {
        operation: 'DISMISS',
        acceptableOracleIds: ['dismiss-release-notes'],
      },
      { operation: 'CLICK', acceptableOracleIds: ['setup-continue'] },
    ],
    verify: (page) => statusIs(page, 'continued'),
  },
  {
    id: 'disabled-and-covered',
    title: 'Disabled and covered facts remain distinguishable',
    goal: 'Enable secure sync and then activate it.',
    setup: async (page) => {
      await page.setContent(`
        <main>
          <h1>Secure sync</h1>
          <label><input
            type="checkbox"
            data-benchmark-id="enable-secure-sync"
            onchange="document.getElementById('activate-secure-sync').disabled = !this.checked"
          /> Enable secure sync</label>
          <button
            id="activate-secure-sync"
            disabled
            data-benchmark-id="activate-secure-sync"
            onclick="document.querySelector('[data-benchmark-status]').textContent = 'active'"
          >Activate secure sync</button>
          <div style="position:relative;display:inline-block">
            <button data-benchmark-id="covered-decoy">Activate secure sync</button>
            <div style="position:absolute;inset:0;background:rgba(255,255,255,.8)"></div>
          </div>
          <p data-benchmark-status>inactive</p>
        </main>
      `);
    },
    steps: [
      { operation: 'CLICK', acceptableOracleIds: ['enable-secure-sync'] },
      { operation: 'CLICK', acceptableOracleIds: ['activate-secure-sync'] },
    ],
    verify: (page) => statusIs(page, 'active'),
  },
  {
    id: 'dynamic-rerender',
    title: 'Semantic relocation after a DOM replacement',
    goal: 'Save the profile after the page refreshes the save control.',
    setup: async (page) => {
      await page.setContent(`
        <main>
          <h1>Profile</h1>
          <div id="save-slot"><button data-benchmark-id="profile-save">Save profile</button></div>
          <p data-benchmark-status>waiting</p>
        </main>
        <script>
          const first = document.querySelector('[data-benchmark-id="profile-save"]');
          first.addEventListener('click', () => {
            document.querySelector('#save-slot').innerHTML = '<button data-benchmark-id="profile-save">Save profile</button>';
            document.querySelector('[data-benchmark-id="profile-save"]').addEventListener('click', () => {
              document.querySelector('[data-benchmark-status]').textContent = 'saved';
            });
          }, { once: true });
        </script>
      `);
    },
    steps: [
      { operation: 'CLICK', acceptableOracleIds: ['profile-save'] },
      { operation: 'CLICK', acceptableOracleIds: ['profile-save'] },
    ],
    verify: (page) => statusIs(page, 'saved'),
  },
  {
    id: 'frame-shadow',
    title: 'Target inside an iframe and open shadow root',
    goal: 'Activate the embedded privacy control.',
    setup: async (page) => {
      await page.setContent(`
        <main><h1>Integrations</h1><iframe id="challenge-frame"></iframe></main>
        <p data-benchmark-status>waiting</p>
      `);
      const frame = await frameBySelector(page, '#challenge-frame');
      await frame.setContent(`
        <h2>Privacy integration</h2>
        <div id="host"></div>
        <p data-frame-status>inactive</p>
        <script>
          const root = document.querySelector('#host').attachShadow({ mode: 'open' });
          root.innerHTML = '<section><h3>Embedded privacy</h3><button data-benchmark-id="embedded-privacy">Activate control</button></section>';
          root.querySelector('button').addEventListener('click', () => {
            document.querySelector('[data-frame-status]').textContent = 'active';
          });
        </script>
      `);
    },
    steps: [{ operation: 'CLICK', acceptableOracleIds: ['embedded-privacy'] }],
    verify: async (page) => {
      const frame = await frameBySelector(page, '#challenge-frame');
      return (
        (await frame.locator('[data-frame-status]').textContent()) === 'active'
      );
    },
  },
  {
    id: 'nested-scroll',
    title: 'Target inside a nested scroll container',
    goal: 'Scroll the catalog panel and open the retention policy.',
    setup: async (page) => {
      await page.setContent(`
        <main>
          <h1>Catalog</h1>
          <div
            id="catalog"
            data-benchmark-id="catalog-scroll"
            style="height:120px;width:360px;overflow-y:auto;border:1px solid"
          >
            <div id="catalog-items"></div>
          </div>
          <p data-benchmark-status>closed</p>
        </main>
        <script>
          const items = document.querySelector('#catalog-items');
          for (let index = 1; index <= 11; index += 1) {
            const row = document.createElement('div');
            row.style.height = '40px';
            row.textContent = 'Catalog item ' + index;
            items.append(row);
          }
          const target = document.createElement('button');
          target.dataset.benchmarkId = 'retention-policy';
          target.textContent = 'Open retention policy';
          target.style.height = '40px';
          target.addEventListener('click', () => {
            document.querySelector('[data-benchmark-status]').textContent = 'opened';
          });
          items.append(target);
        </script>
      `);
    },
    steps: [
      { operation: 'SCROLL', acceptableOracleIds: ['catalog-scroll'] },
      { operation: 'CLICK', acceptableOracleIds: ['retention-policy'] },
    ],
    verify: (page) => statusIs(page, 'opened'),
  },
];
