# Travel fixture

The travel fixture is a same-origin, runnable approximation of a desktop flight and hotel search site. It covers three scenarios: `flights` (custom two-month fare calendar), `flights-native-date` (native date control), and `hotel`. The forms, suggestions, result lists, filters, sort controls, detail panels and server state are functional. It does not connect to airline or hotel inventory, pricing systems or booking partners. All itinerary, hotel, review and room-rate data is illustrative. Property names and descriptions are fixture content; the photographs are representative images **of other places**, not evidence of the named property's appearance.

The flight interaction structure follows Google's public [Find plane tickets on Google Flights](https://support.google.com/travel/answer/2475306?co=GENIE.Platform%3DDesktop&hl=en) help article, checked on 2026-09-23: origin and destination, one-way or round trip, passenger count and cabin, calendar prices, Best/Cheapest result modes, filters and sorting. Hotel result and detail structure follows Google's public [Search for hotels on Google](https://support.google.com/travel/answer/6276008?hl=en) help article, checked on the same date: destination, dates and guests, property cards, filters and sort, photos, amenities, room rates, reviews and policies. These are source-level interaction references; we did not claim an exact copy of the current live Google Travel DOM or pixels.

## Routes and API

- `GET /scenario/flights?runId=...` and `/scenario/flights-native-date?runId=...`: flight search forms.
- `GET /scenario/:flightScenario/results?runId=...`: flight results after a validated search.
- `GET /scenario/hotel?runId=...`: hotel search form.
- `GET /scenario/hotel/results?runId=...`: hotel results after a validated search.
- `GET /scenario/hotel/:hotelId?runId=...`: hotel detail page.
- `GET /api/travel/:runId/airports?q=...`: local airport suggestions.
- `POST /api/travel/:runId/flights/search`: validate and record a flight search.
- `POST /api/travel/:runId/flights/filter` and `/flights/select`: update filters or select an available flight.
- `GET /api/travel/:runId/hotels/destinations?q=...`: local city suggestions.
- `POST /api/travel/:runId/hotels/search`, `/hotels/sort`, `/hotels/open`: validate and record hotel interactions.
- `GET /api/travel/:runId/state`: independent result/event readback.

Flight search validates supported cities, an optional exact airport belonging to that city, distinct origin/destination, trip type, ISO dates and ordering, passenger count and cabin. Results are filtered by the requested route and airport; routes without fixture data have zero results. Sample prices are adjusted for the selected date, adults and cabin. The hotel search validates destination, stay dates, guests, rooms and filters. Opening a hotel requires it to be present in that run's current filtered results. Unsupported methods, malformed requests, unknown IDs and invalid transitions do not mutate state. The common fixture server isolates run IDs and owns the revision/event log.

## Local photograph provenance

The included JPEGs were downloaded as 960-pixel thumbnails from Wikimedia Commons on 2026-09-23 and are embedded as data URIs so browser rendering makes no remote image request. The images are cropped in the UI through CSS `object-fit: cover`; their pixels were otherwise not edited. Wikimedia Commons file pages provide the source and license records:

| Local file | Commons source and credit | License |
| --- | --- | --- |
| `lisbon-cityscape.jpg` | [Lisbon Cityscape](https://commons.wikimedia.org/wiki/File:Lisbon_Cityscape.jpg), Justraveling.com, [source site](http://www.justraveling.com) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `porto-cityscape.jpg` | [Porto Cityscapes](https://commons.wikimedia.org/wiki/File:Porto_Cityscapes_-_PortoCityscapes5671.jpg), lumoplank | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `london-skyline.jpg` | [London Skyline 2021](https://commons.wikimedia.org/wiki/File:London_Skyline_2021.jpg), Farbades420 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `paris-skyline.jpg` | [View of Paris skyline](https://commons.wikimedia.org/wiki/File:View_of_Paris_skyline_(Unsplash).jpg), Drew Coffman | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `room-windows.jpg` | [Hotel bedroom windows](https://commons.wikimedia.org/wiki/File:Hotel_bedroom_windows_(Unsplash).jpg), Markus Spiske | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `room-flickr.jpg` | [Hotel Room](https://commons.wikimedia.org/wiki/File:Hotel_Room_(32259665218).jpg), Open Grid Scheduler / Grid Engine | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `room-fonda.jpg` | [La fonda hotel room](https://commons.wikimedia.org/wiki/File:La_fonda_hotel_room.jpg), Atakra | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `room-plaza.jpg` | [Plaza Hotel room](https://commons.wikimedia.org/wiki/File:Plaza_Hotel_room,_Sept_2017.jpg), Thomson200 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

The source pages, credits and licenses are recorded here even where CC0 does not require credit. Hotel photos have no relationship to the synthetic listing names, rates or reviews. Sample pricing and availability must not be interpreted as offers.

## Smoke flow

With the repository fixture server, navigate a Playwright-owned page to `fixture.url('flights', runId)`. Enter Zurich and London, choose One-way, select 12 November 2026, and search. The results route should show multiple carriers and the independent state should record `flightResultsOpened` with the exact criteria. Selecting Heathrow from airport suggestions should set `destinationAirport: "LHR"` and exclude Gatwick flights. A Paris-to-London search should show zero fixture flights. In `hotel`, search Lisbon with Design and Free cancellation selected, open Casa Flora, inspect the photo gallery and room rates, then return to results with the filter selections retained. Read back `hotelResultsOpened` then `hotelOpened` for the same run.
