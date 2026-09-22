import { runJev } from '@chlrc/midscene-jev-runner';
import { chromium } from 'playwright';

process.env.MIDSCENE_JEV_API_KEY ||= 'package-smoke-test';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<main><button type="button">Continue</button></main>');
  let decisions = 0;
  const result = await runJev(page, {
    goal: 'The package browser runtime can observe this page',
    maxSteps: 1,
    fetch: async () => {
      decisions += 1;
      return new Response(
        JSON.stringify({
          answers: { operation: { type: 'choice', choice: 'DONE' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });
  if (decisions !== 1 || result.steps !== 1)
    throw new Error('Packaged runner smoke test did not reach a decision.');
} finally {
  await browser.close();
}
