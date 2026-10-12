# Marketing fixture

This is a local, synthetic reconstruction of a desktop marketing workspace. It
draws on the public behavior of a host shell with a primary and recursive
secondary menu, session-like cached tabs, a paginated activity list, and a
touchpoint clone process. It is not a mirror of a deployed marketing site or a
copy of private source code or business data.

The initial page opens the touchpoint activity list. The left menu reaches
configuration and reports through three navigation levels. Activity, rule, and
report tabs remain mounted while inactive; closing a tab disposes its panel.
List filters, sorting, and page number survive switching tabs. The list has 35
synthetic records across five statuses, with a row action menu and an open
shadow-root detail component. The detail drawer embeds a same-origin rule
reference frame with asynchronous loading, search, and rule expansion. Neither hidden tabs nor inactive wizard steps should be offered as
visible actions by an observer.

To clone the `Blue Meridian` source record, open its row's More menu and choose
Clone. The wizard is basic information, people scope, frequency control,
entitlements, difference preview, then warning configuration. All six step
sections stay in the DOM with inactive sections hidden. A new validity range is
required; the clone starts with the source's name and configuration. Rule and
benefit options load through dependent local API calls. Each of the first four
steps must pass server validation in order. The preview requires a separate
confirmation before a single `POST clone` creates the new record. The fixture
ends at warning configuration and does not save an alarm.

API paths are under `/api/marketing/:runId/`: `activities`,
`activities/:id`, `reference/rules`, `reference/benefits?ruleId=...`,
`session/open`, `session/step`, `session/preview`, `clone`, `result`, and
`session`. `GET /api/state?runId=...` is the independent server oracle. Each
run has isolated result, event, submission, and attempt state. The oracle
retains the source record, copies, latest copy, and wizard progress. A clone
submission ID is idempotent: replay returns the existing copy. With
`?fault=commit503` on the scenario page, the first clone response is 503 after
commit; the UI reads `result` before deciding whether creation succeeded.
Rejected premature submissions appear in `attempts` but produce no copy event.
The new copy retains the validated start and end dates, selected audience,
rule, frequency period and limit, entitlement and quantity, and source ID.

Known limits: this fixture does not reproduce authorization, draft persistence
across reloads, real data services, or alarm saving. Any listed activity can
be used as a clone source, while the primary test path uses `Blue Meridian`.
The source and all rows are invented test data. A local browser pass establishes
fixture behavior only; it does not establish real site or model reliability.
