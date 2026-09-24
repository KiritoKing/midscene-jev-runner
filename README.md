# Midscene JEV Runner

Community-maintained JEV runner integration for
[Midscene Test](https://midscenejs.com/midscene-test/overview). This project is
independent from the Midscene repository and is not an official Midscene
package.

The package provides:

- `runJev(page, options)` for direct Playwright use.
- `createJevNodes(options)` for registering a strict `jevAct` node in a
  Midscene Test project.
- A caller-owned browser lifecycle: the runner does not create, navigate,
  route, or close the supplied Playwright `Page`.
- Optional completion verification and structured observer events.

## Install

```sh
pnpm add @chlrc/midscene-jev-runner @midscene/test playwright
```

Node.js `^20.19.0 || ^22.12.0 || >=24.0.0` is required.

For version, changelog, tag, and npm publishing boundaries, see
[releasing](./docs/releasing.md).

## Configure

Set credentials in the process environment, never in YAML:

```sh
export OPENROUTER_API_KEY=...
```

The runner calls OpenRouter Decisions at
`https://openrouter.ai/api/alpha/decisions` with
`~typesafe/jev-latest` by default. `MIDSCENE_JEV_API_KEY` remains supported as
a compatibility fallback. Compatible gateways can be selected with
`MIDSCENE_JEV_BASE_URL` and `MIDSCENE_JEV_MODEL_NAME`.

A `TYPE_TEXT` action also
requires either the `MIDSCENE_JEV_TEXT_API_KEY`,
`MIDSCENE_JEV_TEXT_BASE_URL`, and `MIDSCENE_JEV_TEXT_MODEL_NAME` variables, or
the corresponding `MIDSCENE_MODEL_*` variables.

## Register the Midscene Test node

```ts
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createJevNodes } from '@chlrc/midscene-jev-runner';
import { chromium, type Browser, type Page } from 'playwright';

interface ProjectContext {
  browser: Browser;
  page: Page;
}

const setup = defineProjectSetup<ProjectContext>({
  name: 'playwright',
  async setup({ onTeardown }) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('https://your-safe-test-page.example');
    onTeardown(() => browser.close());
    return { browser, page };
  },
});

const nodes = createJevNodes<ProjectContext>({
  getPage: ({ context }) => context.page,
  verifyCompletion: async ({ page }) =>
    page.getByText('Complete', { exact: false }).isVisible(),
});

export default defineTestProject<ProjectContext>({
  projects: [{ name: 'jev', files: { include: ['midscene.yaml'] }, setup }],
  nodes,
});
```

```yaml
cases:
  - name: JEV completes a browser task
    steps:
      - jevAct:
          goal: Complete the task and leave visible evidence of completion.
          maxSteps: 20
          maxTaskMs: 180000
```

`verifyCompletion` is strongly recommended for workflows with side effects.
Without it, `DONE` only means that the model decided the task was complete; it
does not prove business success.

Starting with `0.1.1`, the runner checks completion both after an action and
before the next model decision, preventing extra operations after an
asynchronous page transition has completed.

Starting with `0.1.2`, observations are site-agnostic and workflow-aware. The
runner exposes accessible controls, field state, visible workflow steps,
validation feedback, and active dialogs without relying on application-specific
selectors. It also suppresses repeated semantic failures across incidental DOM
rerenders, rechecks targets for occlusion immediately before execution, and can
dismiss unrelated active layers without taking ownership of the `Page`.

## Direct use

```ts
import { runJev } from '@chlrc/midscene-jev-runner';

const result = await runJev(page, {
  goal: 'Complete the form',
  verifyCompletion: async ({ page }) => page.getByText('Complete').isVisible(),
});
```

See [`example/`](./example) for a complete Midscene Test configuration.

## Security and ownership boundaries

- The runner strips query strings and fragments from URLs sent in observations.
- Password and file inputs are excluded from the action space.
- The runner never logs API keys or authorization headers.
- The caller owns authentication, request interception, navigation, cleanup,
  and any domain-specific write guards.

## License

MIT. The DOM snapshot implementation is adapted from `jev-ultrafast`; see
[`THIRD_PARTY_LICENSES.txt`](./THIRD_PARTY_LICENSES.txt).

简体中文说明见 [README.zh-CN.md](./README.zh-CN.md)。
