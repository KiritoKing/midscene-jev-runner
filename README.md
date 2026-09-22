# Midscene JEV Runner

Community-maintained JEV integration for
[Midscene Test](https://midscenejs.com/midscene-test/overview). It is
independent of the Midscene repository and is not an official Midscene package.

The package provides:

- `runJev(page, options)`, a bounded ReAct loop for a caller-owned Playwright
  `Page`.
- `evaluateJevAssertion(page, options)`, one read-only assertion against the
  current browser observation.
- `createJevNodes(options)`, which registers strict-schema `jevAct` and
  `jevAssert` nodes.

`jevAct` is intended as a faster replacement for one atomic `aiAct` intent,
not as an autonomous whole-test planner. It may take a short bounded sequence
when an atomic interaction opens a menu or layer, but callers should express a
workflow as ordered Midscene Test steps. The runner observes after each action
until it reaches `DONE`, `BLOCKED`, or a configured limit. Its action space is
intentionally non-text: click, select, scroll, wait, and dismiss. It does not
generate text, fill or clear inputs, create navigation, route requests, or
close the supplied page.

## Install

```sh
pnpm add @chlrc/midscene-jev-runner @midscene/test playwright
```

Node.js `^20.19.0 || ^22.12.0 || >=24.0.0` is required.

## Configure JEV

Set the runner-owned credential in the process environment, never in YAML:

```sh
export MIDSCENE_JEV_API_KEY=...
```

The default is TypeSafe System One: `POST https://api.typesafe.ai/v1/systemone`
with model `jev-latest`. `MIDSCENE_JEV_API_KEY` is the only credential the
runner reads; `OPENROUTER_API_KEY` is not a fallback.

The client sends the documented System One request body (`model`, `state`, and
typed `questions`) and requires a provider with that compatible response
shape. An OpenRouter key is not interchangeable with a TypeSafe key. For the
OpenRouter Decisions route verified by this project, configure the complete
endpoint explicitly:

```sh
export MIDSCENE_JEV_API_KEY=...
export MIDSCENE_JEV_BASE_URL=https://openrouter.ai/api/alpha/decisions
export MIDSCENE_JEV_MODEL_NAME=jev-latest
```

`MIDSCENE_JEV_BASE_URL` has two supported meanings: a compatible API root, to
which the client appends `/systemone`, or a complete endpoint ending in
`/systemone` or `/decisions`, which is used unchanged. Do not use a provider's
bare website origin unless it actually serves the System One resource there.
Set `MIDSCENE_JEV_MODEL_NAME` when the provider's model naming differs. Do not
point this client at a Chat Completions-only endpoint: its request and response
schema are different. A successful HTML response or an incompatible JSON shape
is reported as an endpoint-configuration error.

## Compose JEV with native Midscene nodes

JEV does not own text input. Register Midscene's standard nodes in the
*consumer project* and use `aiInput` to provide caller-chosen text before a
bounded `jevAct` loop. `createJevNodes()` only adds `jevAct` and `jevAssert`;
`aiInput` is available only after the consumer registers an Agent class through
the public `createMidsceneNodes()` factory.

The following consumer-project configuration requires its own
`@midscene/web` dependency. It is intentionally not imported by this package
or by the runnable `example/` directory.

```ts
import { createJevNodes } from '@chlrc/midscene-jev-runner';
import { defineProjectSetup, defineTestProject } from '@midscene/test/config';
import { createMidsceneNodes } from '@midscene/test/midscene';
import { PlaywrightAgent } from '@midscene/web/playwright/agent';
import { chromium, type Browser, type Page } from 'playwright';

interface ProjectContext {
  browser: Browser;
  page: Page;
  agent?: PlaywrightAgent;
}

const setup = defineProjectSetup<ProjectContext>({
  name: 'playwright',
  platform: 'web',
  async setup({ onTeardown }) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('https://your-safe-test-page.example');
    onTeardown(() => browser.close());
    return { browser, page };
  },
});

const midsceneNodes = createMidsceneNodes<ProjectContext>({
  agentClass: PlaywrightAgent,
  getAgent: ({ context }) => {
    context.agent ??= new PlaywrightAgent(context.page);
    return context.agent;
  },
});
const jevNodes = createJevNodes<ProjectContext>({
  getPage: ({ context }) => context.page,
});

export default defineTestProject<ProjectContext>({
  projects: [
    {
      name: 'web',
      platform: 'web',
      setup,
      files: { include: ['cases/**/*.yaml'] },
    },
  ],
  nodes: [...midsceneNodes, ...jevNodes],
});
```

With that registration, a case can explicitly compose the two capabilities:

```yaml
cases:
  - name: Prepare text, complete non-text UI work, then verify
    steps:
      - aiInput:
          prompt: The search field
          value: a caller-provided search term
      - jevAct:
          goal: Activate the search action for the current query.
          maxSteps: 4
          maxTaskMs: 30000
      - jevAssert:
          prompt: The requested result and completion evidence are visible.
          message: The page did not show the expected completion evidence.
```

Generate the consumer project's Node Spec after changing registrations. It is
the source of truth for the native `aiInput` input schema in that installed
Midscene version.

## Completion and assertion evidence

Provide `verifyCompletion` for workflows with side effects. A JEV `DONE`
decision is model output; it does not establish business success. The runner
calls the verifier after an action and again before a later decision so that an
asynchronous completion can stop the loop without another mutation.

`jevAssert` and `evaluateJevAssertion` are read-only. They ask JEV separately
whether the condition is true and whether the observed evidence is sufficient.
They pass only when both model-assessed probabilities meet their configured
thresholds. With sufficient evidence, a condition probability at or below the
symmetric fail threshold returns `fail`. Insufficient evidence or a condition
probability between the pass and fail thresholds returns `indeterminate`.
Those probabilities are not a deterministic guarantee that JEV saw every hidden
or external gap. Use deterministic application or API checks for facts outside
the current page.

## Migrating from the text path

The public `TYPE_TEXT` action, text generation, filling, clearing, `textUsage`, and all
`MIDSCENE_JEV_TEXT_*` / `MIDSCENE_MODEL_*` text-provider configuration have
been removed. Move deterministic input values into a standard Midscene
`aiInput` step registered by the consumer's Agent. Keep `jevAct` for the
subsequent bounded, non-text ReAct loop and `jevAssert` for evidence on the
resulting page state.

## Safety and generality

- The caller owns authentication, navigation, request interception, cleanup,
  and domain-specific write guards.
- Query strings and fragments are stripped from URLs sent in observations;
  password and file inputs are excluded from JEV's action space.
- Provider selection is transport configuration, never a site-specific branch.
- Candidate filtering must come from observable HTML, ARIA, disabled/visible
  state, or an explicit safety boundary. It cannot encode a business name,
  route, fixed field text, ID, or presumed operation order. Text and validation
  clues can rank candidates, but they cannot turn a business assumption into a
  global hard filter.

The runnable [`example/`](./example) uses only this package's non-text nodes
and existing dependencies. It does not claim that `aiInput` is registered.

## License

MIT. The DOM snapshot implementation is adapted from `jev-ultrafast`; see
[`THIRD_PARTY_LICENSES.txt`](./THIRD_PARTY_LICENSES.txt).

简体中文说明见 [README.zh-CN.md](./README.zh-CN.md)。
