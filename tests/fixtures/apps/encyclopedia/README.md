# Encyclopedia fixture

This fixture represents the English Wikipedia reading and search flow in a self-contained, same-origin test site. The layout is modeled on Wikipedia's Vector 2022 desktop interface: the globe wordmark and global search, contents rail, page tabs, tools, appearance controls, main-page modules, search results, and article sections. It is a functional approximation for browser and agent tests, not a copy of Wikipedia's source code or a pixel-accurate mirror.

The search task `incompleteness theorems logic` returns several related articles. The first result opens **Gödel's incompleteness theorems**. Search suggestions can also open an article directly. The home page's featured **Mary Mallon** story and **Punjab Legislative Assembly** list each open their matching local article; other topic links submit their stated query to local search. The search index scores words across titles, keywords and descriptions; it does not recognize a test string or return a canned answer. Articles contain contents links, internal article links, references, an infobox and functioning anchors. The logo returns to the main page and updates the run's view state. Menu, tools and appearance controls act locally. Account, editing, language editions and other out-of-scope controls show a visible explanation instead of linking to a fake footer target. The logo, diagram and portrait are original SVG illustrations authored for this fixture. All page requests, API calls and images stay on the fixture origin.

## Routes and state

- `GET /scenario/encyclopedia?runId=...`: main page.
- `GET /scenario/encyclopedia/results?runId=...&search=...&page=1`: paginated search results.
- `GET /scenario/encyclopedia/article/:id?runId=...`: one of the indexed articles.
- `GET /scenario/encyclopedia/assets/:name.svg?runId=...`: local illustrations.
- `GET /api/encyclopedia/:runId/suggestions?q=...`: ranked suggestions.
- `POST /api/encyclopedia/:runId/search` with `{ "query": "..." }`: search event and state transition.
- `POST /api/encyclopedia/:runId/open-article` with `{ "articleId": "..." }`: article event and state transition.
- `POST /api/encyclopedia/:runId/navigate-home`: return to the main page from the logo and record `homeOpened`.
- `GET /api/encyclopedia/:runId/state`: independent state/event readback.

The server records `searchSubmitted`, `articleOpened` and `homeOpened` only after validated API actions. A later visit to a different valid results page for the same search records `resultsPageViewed`. The oracle includes `query`, `searchQuery`, `articleId`, `articleTitle`, `navigated`, `resultPage`, and `view`. Unknown articles, invalid searches, unsupported methods and unknown routes fail without a state mutation. The common fixture server owns run isolation. Searches outside the small local article index can validly return zero results; they are still genuine local searches.

## Provenance and limits

The interface structure and topic coverage were checked against the public [English Wikipedia main page](https://en.wikipedia.org/wiki/Main_Page), [search results for “incompleteness theorems logic”](https://en.wikipedia.org/w/index.php?title=Special:Search&search=incompleteness%20theorems%20logic), and [Gödel's incompleteness theorems](https://en.wikipedia.org/wiki/G%C3%B6del%27s_incompleteness_theorems) on 2026-09-23. Wikipedia text is available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); the fixture's explanatory prose is newly written and only uses short titles, factual metadata, and topic structure from those pages. Wikipedia and the Wikimedia wordmark are Wikimedia trademarks; the local globe SVG is an original approximation for test identification and is not an official logo. Search count, timestamps, featured modules and article lengths are fixture values and do not track live Wikipedia.

## Smoke flow

Start the repository's fixture server, navigate a Playwright-owned page to `fixture.url('encyclopedia', runId)`, fill **Search Wikipedia** with `incompleteness theorems logic`, and click **Search**. Confirm the results route and several related results, open the first result, then verify the URL, article heading, contents links and `fixture.readState(runId)` containing a search event followed by an article-open event. A second run ID should have an empty event list.
