import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { benchmarkFixtures } from '../experiments/context-benchmark/fixtures.js';
import { selectWithJev } from '../experiments/context-benchmark/jev.js';
import type {
  BenchmarkFixture,
  ContextStrategy,
} from '../experiments/context-benchmark/types.js';
import { currentStrategy } from '../experiments/context-benchmark/variants/current.js';
import { hybridStrategy } from '../experiments/context-benchmark/variants/hybrid.js';
import { rankedDomStrategy } from '../experiments/context-benchmark/variants/ranked-dom.js';

const fixture = (id: string): BenchmarkFixture => {
  const value = benchmarkFixtures.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Unknown benchmark fixture: ${id}`);
  return value;
};

describe('context strategy benchmark contracts', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  const observe = async (
    strategy: ContextStrategy,
    benchmarkFixture: BenchmarkFixture,
  ) => {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      await benchmarkFixture.setup(page);
      return await strategy.observe(page, benchmarkFixture.goal);
    } finally {
      await page.close();
    }
  };

  it('shows that relevance ranking retains a target beyond the flat budget', async () => {
    const challenge = fixture('candidate-budget');
    const [current, ranked, hybrid] = await Promise.all([
      observe(currentStrategy, challenge),
      observe(rankedDomStrategy, challenge),
      observe(hybridStrategy, challenge),
    ]);

    expect(
      current.candidates.some(
        (candidate) => candidate.oracleId === 'approve-final-review',
      ),
    ).toBe(false);
    expect(
      ranked.candidates.some(
        (candidate) => candidate.oracleId === 'approve-final-review',
      ),
    ).toBe(true);
    expect(
      hybrid.candidates.some(
        (candidate) => candidate.oracleId === 'approve-final-review',
      ),
    ).toBe(true);
  });

  it('adds local card context only when repeated labels need disambiguation', async () => {
    const challenge = fixture('repeated-cards');
    const [current, ranked, hybrid] = await Promise.all([
      observe(currentStrategy, challenge),
      observe(rankedDomStrategy, challenge),
      observe(hybridStrategy, challenge),
    ]);

    expect(
      current.candidates.find(
        (candidate) => candidate.oracleId === 'workspace-aurora',
      )?.localContext,
    ).toBeUndefined();
    for (const observation of [ranked, hybrid])
      expect(
        observation.candidates.find(
          (candidate) => candidate.oracleId === 'workspace-aurora',
        )?.localContext,
      ).toContain('Workspace Aurora');
  });

  it('keeps disabled and covered controls as facts only in enhanced strategies', async () => {
    const challenge = fixture('disabled-and-covered');
    const [current, ranked, hybrid] = await Promise.all([
      observe(currentStrategy, challenge),
      observe(rankedDomStrategy, challenge),
      observe(hybridStrategy, challenge),
    ]);

    expect(
      current.candidates.some(
        (candidate) => candidate.oracleId === 'activate-secure-sync',
      ),
    ).toBe(false);
    for (const observation of [ranked, hybrid]) {
      expect(
        observation.candidates.find(
          (candidate) => candidate.oracleId === 'activate-secure-sync',
        ),
      ).toMatchObject({ disabled: true, actionable: false });
      expect(
        observation.candidates.find(
          (candidate) => candidate.oracleId === 'covered-decoy',
        ),
      ).toMatchObject({ covered: true, actionable: false });
    }
  });

  it('finds frame and open-shadow targets only in the hybrid strategy', async () => {
    const challenge = fixture('frame-shadow');
    const [current, ranked, hybrid] = await Promise.all([
      observe(currentStrategy, challenge),
      observe(rankedDomStrategy, challenge),
      observe(hybridStrategy, challenge),
    ]);

    for (const observation of [current, ranked])
      expect(
        observation.candidates.some(
          (candidate) => candidate.oracleId === 'embedded-privacy',
        ),
      ).toBe(false);
    expect(
      hybrid.candidates.find(
        (candidate) => candidate.oracleId === 'embedded-privacy',
      ),
    ).toMatchObject({ actionable: true, operation: 'CLICK' });
  });

  it('models a portal listbox as a child layer of its triggering dialog', async () => {
    const challenge = fixture('nested-portal');
    const page: Page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      await challenge.setup(page);
      await page.locator('[data-benchmark-id="shipping-trigger"]').click();
      const observation = await hybridStrategy.observe(page, challenge.goal);
      const option = observation.candidates.find(
        (candidate) => candidate.oracleId === 'priority-shipping',
      );
      expect(option).toMatchObject({ operation: 'CLICK', actionable: true });
      expect(option?.layerPath).toHaveLength(3);
      const listbox = observation.layers.find(
        (layer) => layer.kind === 'listbox',
      );
      const dialog = observation.layers.find(
        (layer) => layer.kind === 'dialog',
      );
      expect(listbox?.parentId).toBe(dialog?.id);
    } finally {
      await page.close();
    }
  });

  it('adds nested-scroll actions without claiming the offscreen target is actionable', async () => {
    const challenge = fixture('nested-scroll');
    const [current, ranked, hybrid] = await Promise.all([
      observe(currentStrategy, challenge),
      observe(rankedDomStrategy, challenge),
      observe(hybridStrategy, challenge),
    ]);

    expect(
      current.candidates.some(
        (candidate) => candidate.oracleId === 'catalog-scroll',
      ),
    ).toBe(false);
    for (const observation of [ranked, hybrid]) {
      expect(
        observation.candidates.find(
          (candidate) =>
            candidate.oracleId === 'catalog-scroll' &&
            candidate.operation === 'SCROLL',
        ),
      ).toMatchObject({ actionable: true });
      expect(
        observation.candidates.find(
          (candidate) => candidate.oracleId === 'retention-policy',
        ),
      ).toMatchObject({ actionable: false });
    }
  });

  it('never sends test-only identity or execution selectors to JEV', async () => {
    const challenge = fixture('duplicate-labels');
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    try {
      await challenge.setup(page);
      const observation = await hybridStrategy.observe(page, challenge.goal);
      const requests: string[] = [];
      const fetch = async (_input: URL | RequestInfo, init?: RequestInit) => {
        const body = String(init?.body);
        requests.push(body);
        return new Response(
          JSON.stringify({
            answers: { operation: { type: 'choice', choice: 'DONE' } },
          }),
          { status: 200 },
        );
      };

      await selectWithJev(observation, challenge.goal, 'flat', fetch);

      expect(requests).toHaveLength(1);
      expect(requests[0]).not.toContain('oracleId');
      expect(requests[0]).not.toContain('execution');
      expect(requests[0]).not.toContain('review-continue');
    } finally {
      await page.close();
    }
  });
});
