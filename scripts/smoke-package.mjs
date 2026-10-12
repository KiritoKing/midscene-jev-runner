import { createRequire } from 'node:module';
import { runJev } from '@chlrc/midscene-jev-runner';
import { chromium } from 'playwright';

process.env.MIDSCENE_JEV_API_KEY ||= 'package-smoke-test';
const require = createRequire(import.meta.url);
const commonJsPackage = require('@chlrc/midscene-jev-runner');
if (typeof commonJsPackage.runJev !== 'function')
  throw new Error('Packaged CommonJS entry did not export runJev().');

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(
    '<main><button type="button" onclick="this.dataset.clicked=\'true\'">Continue</button></main>',
  );
  let decisions = 0;
  const result = await runJev(page, {
    goal: 'Click Continue',
    maxSteps: 1,
    fetch: async (_input, init) => {
      decisions += 1;
      const request = JSON.parse(String(init?.body));
      const criteria = request.questions?.click_target?.criteria || {};
      const target = Object.entries(criteria).find(
        ([, candidate]) => candidate?.element === 'Continue',
      )?.[0];
      if (!target)
        throw new Error('Packaged browser runtime did not expose Continue.');
      return new Response(
        JSON.stringify({
          answers: {
            operation: { type: 'choice', choice: 'CLICK' },
            click_target: { type: 'choice', choice: target },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
    verifyCompletion: async ({ page: current }) =>
      (await current
        .getByRole('button', { name: 'Continue' })
        .getAttribute('data-clicked')) === 'true',
  });
  if (
    decisions !== 1 ||
    result.steps !== 1 ||
    result.completionVerified !== true
  )
    throw new Error('Packaged runner smoke test did not execute its action.');
} finally {
  await browser.close();
}
