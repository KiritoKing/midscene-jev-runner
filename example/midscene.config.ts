import { createJevNodes } from '@chlrc/midscene-jev-runner';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { type Browser, type Page, chromium } from 'playwright';

interface ProjectContext {
  browser: Browser;
  page: Page;
}

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const setup = defineProjectSetup<ProjectContext>({
  name: 'playwright',
  async setup({ onTeardown }) {
    const browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(requiredEnvironment('JEV_EXAMPLE_URL'), {
      waitUntil: 'domcontentloaded',
    });
    onTeardown(() => context.close());
    onTeardown(() => browser.close());
    return { browser, page };
  },
});

const jevNodes = createJevNodes<ProjectContext>({
  getPage: ({ context }) => context.page,
  verifyCompletion: async ({ page }) =>
    page
      .getByText(process.env.JEV_EXAMPLE_SUCCESS_TEXT ?? 'Complete', {
        exact: false,
      })
      .isVisible(),
});

export default defineTestProject<ProjectContext>({
  projects: [
    { name: 'jev-example', files: { include: ['midscene.yaml'] }, setup },
  ],
  nodes: jevNodes,
});
