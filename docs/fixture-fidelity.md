# Local fixture fidelity

These pages are self-contained browser fixtures for exercising the public JEV
node and Midscene Test composition. Each scenario runs under a unique `runId`
on one loopback origin. The fixture server owns its result and event ledger;
the browser cannot mark its own task complete by changing page text. Browser
requests to other origins are blocked in the integration and live harnesses.

| Scene | Reconstructed interaction surface | Independent completion evidence |
| --- | --- | --- |
| Marketing touchpoint clone | Desktop host shell, recursive menu, cached and closable tabs, 35-row paginated activity table, filter/sort, row actions, open shadow detail, interactive same-origin rule frame, four retained wizard forms, dependent rule and benefit loads, difference preview and confirmation, warning configuration landing | One new copy with source ID and full validated configuration, source unchanged, four ordered step events, one preview event, one commit attempt/event; a committed 503 is reconciled by readback. |
| Encyclopedia | Wikipedia-style search, suggestions, paginated results, long article, contents rail, appearance controls, local illustrations | Search and article events, exact article ID/title, matching results and article URLs and visible heading. |
| Flights | Travel search with airport suggestion menus, trip mode, calendar or native date variant, ranked result cards, filters and flight details | Server search criteria and visible results route/cards. |
| Hotel | Destination suggestions, dates and guests, design/cancellation filters, photographic result cards, map, detail sections and gallery | Server filter criteria, opened hotel ID/title and visible detail route/heading. |

The marketing flow was reconstructed from patterns in a host menu and
touchpoint-activity module: a base shell, recursively rendered menu items,
session tab mode, list query/pagination, and clone steps for basic information,
people scope, frequency, entitlements, preview, and warning configuration.
The other scenes follow public encyclopedia and travel interaction patterns.
All rows, users, activity IDs, prices, counts and descriptions are local sample
data. The marketing fixture does not embed private source, internal URLs,
credentials, permission IDs or production artifacts. It is not a deployed site
mirror or an accuracy benchmark.

The browser integration suite checks actual page behavior, production
observation/candidate construction on selected cross-boundary controls, and
the independent state readback. It also tests invalid operations and run
isolation. The real-model suite is separate: it must use Midscene's registered
`aiInput` for text and JEV for bounded non-text actions, then verify every JEV
completion with URL/render state plus the independent server result. A static
build or an offline browser pass does not establish provider/model success.

Known limits include real authorization, remote service timing, native file
pickers, alarm saving, arbitrary production microfrontends and statistical
reliability. See the scene README files for their specific local routes and
data limits.
