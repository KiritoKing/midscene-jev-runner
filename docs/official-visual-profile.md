# Official Midscene visual profile

`example/official-visual-profile.ts` is an opt-in comparison profile using the
public `PlaywrightAgent` from `@midscene/web/playwright` **1.16.0**. It uses
Midscene's upstream JEV adapter, not this package's candidate-ID runner. It does
not replace or rewrite `jevAct`, register nodes, or change the default runner.

## Routing

The default profile explicitly sets these model slots:

- Default: a caller-selected, general-purpose vision model.
- Planning: the same general-purpose model.
- Locate and Insight: model family `jev`, model name `jev-1.14.0`.

`allJevPlanning: true` also selects JEV for Planning. Despite its name, this is
JEV-first planning, **not** a JEV-only execution mode: the general-purpose default
must remain configured. Upstream rejects JEV as the default model. Its JEV planner
supports a bounded action selection vocabulary and delegates text input,
generated output, and unsupported action parameters to the general-purpose
planner. JEV Insight handles boolean questions; unsupported extraction tasks
route to the default model. Do not assume every Insight or Planning call goes
to JEV, or that a completion judgment independently proves task success.

## Use with a caller-owned page

Import the example from a source checkout (adjust the relative path as needed):

```ts
import { createOfficialVisualAgent } from './example/official-visual-profile';

// Read these values from your own secret/configuration mechanism. This module
// does not read process.env, persist credentials, or supply an endpoint.
const agent = createOfficialVisualAgent(page, {
  generic: {
    modelName: genericModelName,
    modelFamily: genericModelFamily,
    baseURL: genericBaseURL,
    apiKey: genericApiKey,
  },
  jev: { baseURL: jevBaseURL, apiKey: jevApiKey },
  allJevPlanning: false,
});

// Only make an authorized, explicitly initiated model call in your own harness.
// await agent.aiTap('the next control');
```

The caller creates, authenticates, navigates, and closes `page`. This helper does
none of those things. `createOfficialVisualModelConfig(options)` is a pure
builder if an existing Agent factory needs just the configuration. Passing
`modelConfig` isolates model configuration from environment defaults, so supply
both endpoints and credentials explicitly. Never log or commit the returned
object: it contains the supplied keys. The JEV URL is a service base URL (origin
or ending in `/v1`); upstream appends `/v1/systemone` or `/systemone` respectively.
Do not supply a complete `/systemone` endpoint here.

Midscene's 1.16.0 public constructor accepts a **flat env-style map** of strings
or numbers, such as `MIDSCENE_LOCATE_MODEL_FAMILY`, not nested `locate` or
`planning` objects. The example derives its type from that public constructor
and never imports the private JEV adapter, image mapper, or model router.

## Comparison scope and limits

Keep the official visual baseline and this package's candidate-ID path separate:
use the same public fixtures, viewport, task goals, initial state, model budget,
and independent completion checks. Record the selected profile and fallback
usage. Report failures and unknown completion separately from verified success.
An offline configuration check is not a live capability or performance result.
A benchmark using provider calls requires separate credentials and explicit
execution; importing this example or building its configuration makes no calls.

The upstream visual adapter preprocesses screenshots/reference images and maps
its normalized predicted boxes back to screenshot coordinates. This profile
leaves that implementation entirely upstream. It does not add coordinate-based
execution to the candidate-ID runner, claim parity between the two paths, or
supply production tasks/data. Screenshots and reference images can disclose page
content to the configured providers; use authorized, public fixtures first.

## Verification sources

Checked against the published 1.16.0 package declarations and implementation:

- [Upstream PR #3271: experimental JEV support](https://github.com/web-infra-dev/midscene/pull/3271)
- [Published @midscene/web 1.16.0](https://www.npmjs.com/package/@midscene/web/v/1.16.0): public PlaywrightAgent constructor and `./playwright` export.
- [Published @midscene/core 1.16.0](https://www.npmjs.com/package/@midscene/core/v/1.16.0): Agent options, JEV adapter/planner, task routing and System One transport.
- [Published @midscene/shared 1.16.0](https://www.npmjs.com/package/@midscene/shared/v/1.16.0): flat `TModelConfig` and isolated model configuration.
- [Official JEV configuration guide](https://midscenejs.com/model-common-config#jev).

The profile is pinned to the verified API version above. Recheck upstream
routing and types when upgrading; experimental support can change.

The comparison is pinned to 1.16.0: 1.16.2 was published during this work and
was not eligible under the environment’s minimum release-age policy. No policy
exemptions are added. The public JEV integration exists in 1.16.0.
