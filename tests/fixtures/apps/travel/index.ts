import type {
  FixtureApp,
  FixtureContext,
  FixtureReply,
} from '../../app-contract.js';
import { type Hotel, airports, filteredHotels, findHotel } from './data.js';
import { type FlightView, quotedFlights, renderFlightPage } from './flights.js';
import {
  type HotelView,
  renderHotelDetail,
  renderHotelHome,
  renderHotelResults,
} from './hotels.js';

function json(status: number, body: Record<string, unknown>): FixtureReply {
  return { status, body, contentType: 'application/json; charset=utf-8' };
}

function methodNotAllowed(allow: string): FixtureReply {
  return json(405, { error: 'Method not allowed', allowed: allow });
}

async function bodyOf(
  ctx: FixtureContext,
): Promise<Record<string, unknown> | null> {
  try {
    return await ctx.readJson();
  } catch {
    return null;
  }
}

function flightState(ctx: FixtureContext): FlightView {
  return ctx.state.result as unknown as FlightView;
}

function hotelState(ctx: FixtureContext): HotelView {
  return ctx.state.result as unknown as HotelView;
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d\d-\d\d-\d\d$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function isFlightScenario(
  scenario: string,
): scenario is 'flights' | 'flights-native-date' {
  return scenario === 'flights' || scenario === 'flights-native-date';
}

function airportCity(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  return (
    airports.find(
      ({ city, code }) =>
        city.toLowerCase() === value || code.toLowerCase() === value,
    )?.city ?? null
  );
}

function matchingAirport(city: string, code: unknown): code is string | null {
  return (
    code === null ||
    code === undefined ||
    (typeof code === 'string' &&
      airports.some(
        (airport) => airport.city === city && airport.code === code,
      ))
  );
}

async function handleFlightApi(
  ctx: FixtureContext,
  tail: string,
): Promise<FixtureReply> {
  const state = flightState(ctx);
  if (tail === 'airports') {
    if (ctx.request.method !== 'GET') return methodNotAllowed('GET');
    const term = ctx.address.searchParams.get('q')?.trim().toLowerCase() ?? '';
    if (term.length > 60) return json(400, { error: 'Invalid airport query' });
    return json(200, {
      airports: airports
        .filter(({ city, name, code, country }) =>
          [city, name, code, country].some((value) =>
            value.toLowerCase().includes(term),
          ),
        )
        .slice(0, 6),
    });
  }
  if (tail === 'flights/search') {
    if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
    const body = await bodyOf(ctx);
    const origin = airportCity(body?.origin);
    const destination = airportCity(body?.destination);
    if (!origin || !destination || origin === destination)
      return json(400, {
        error: 'Choose different supported origin and destination cities',
      });
    if (
      !matchingAirport(origin, body?.originAirport) ||
      !matchingAirport(destination, body?.destinationAirport)
    )
      return json(400, { error: 'Airport must belong to the selected city' });
    const tripType = body?.tripType;
    if (!['one-way', 'round-trip'].includes(String(tripType)))
      return json(400, { error: 'Choose a supported trip type' });
    if (
      !validIsoDate(body?.departureDate) ||
      body.departureDate < '2026-09-23' ||
      body.departureDate > '2027-12-31'
    )
      return json(400, { error: 'Choose a valid departure date' });
    const returnDate = body?.returnDate;
    if (
      tripType === 'round-trip' &&
      (!validIsoDate(returnDate) || returnDate <= body.departureDate)
    )
      return json(400, { error: 'Return date must follow departure' });
    if (
      tripType === 'one-way' &&
      returnDate !== null &&
      returnDate !== undefined &&
      returnDate !== ''
    )
      return json(400, {
        error: 'One-way searches cannot include a return date',
      });
    if (
      !Number.isInteger(body?.adults) ||
      Number(body?.adults) < 1 ||
      Number(body?.adults) > 9
    )
      return json(400, { error: 'Adults must be between 1 and 9' });
    if (
      !['economy', 'premium-economy', 'business', 'first'].includes(
        String(body?.cabin),
      )
    )
      return json(400, { error: 'Choose a supported cabin' });
    Object.assign(state, {
      origin,
      destination,
      originAirport: body?.originAirport ?? null,
      destinationAirport: body?.destinationAirport ?? null,
      tripType,
      departureDate: body.departureDate,
      returnDate: tripType === 'round-trip' ? returnDate : null,
      adults: body.adults,
      cabin: body.cabin,
      resultsVisible: true,
      sort: 'best',
      nonstop: false,
      airline: '',
      selectedFlightId: null,
    });
    const resultCount = quotedFlights(state).length;
    ctx.record('flightResultsOpened', {
      origin,
      destination,
      originAirport: state.originAirport,
      destinationAirport: state.destinationAirport,
      tripType,
      departureDate: state.departureDate,
      returnDate: state.returnDate,
      adults: state.adults,
      cabin: state.cabin,
      resultCount,
    });
    return json(200, { resultCount, criteria: { ...state } });
  }
  if (tail === 'flights/filter') {
    if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
    if (!state.resultsVisible)
      return json(409, { error: 'Search for flights before filtering' });
    const body = await bodyOf(ctx);
    if (
      !body ||
      !['best', 'price', 'duration', 'departure'].includes(String(body.sort)) ||
      typeof body.nonstop !== 'boolean' ||
      typeof body.airline !== 'string' ||
      (body.airline !== '' &&
        !['SWISS', 'British Airways', 'easyJet', 'KLM', 'Lufthansa'].includes(
          body.airline,
        ))
    )
      return json(400, { error: 'Invalid flight filters' });
    state.sort = body.sort as string;
    state.nonstop = body.nonstop;
    state.airline = body.airline;
    const resultCount = quotedFlights(state).length;
    ctx.record('flightFiltersChanged', {
      sort: state.sort,
      nonstop: state.nonstop,
      airline: state.airline,
      resultCount,
    });
    return json(200, { resultCount });
  }
  if (tail === 'flights/select') {
    if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
    if (!state.resultsVisible)
      return json(409, { error: 'Search for flights first' });
    const body = await bodyOf(ctx);
    const flight = quotedFlights(state).find(({ id }) => id === body?.flightId);
    if (!flight)
      return json(404, { error: 'Flight not found in these results' });
    state.selectedFlightId = flight.id;
    ctx.record('flightSelected', { flightId: flight.id, price: flight.price });
    return json(200, {
      flightId: flight.id,
      airline: flight.airline,
      flightNumber: flight.flightNumber,
      price: flight.price,
    });
  }
  if (tail === 'state') {
    if (ctx.request.method !== 'GET') return methodNotAllowed('GET');
    return json(200, {
      result: state,
      revision: ctx.state.revision,
      events: ctx.state.events,
    });
  }
  return json(404, { error: 'Endpoint not found' });
}

const destinations = [
  { city: 'Lisbon', country: 'Portugal' },
  { city: 'Porto', country: 'Portugal' },
];

function hotelForResults(id: string, state: HotelView): Hotel | undefined {
  return filteredHotels(
    state.city ?? '',
    state.design,
    state.freeCancellation,
  ).find((hotel) => hotel.id === id);
}

async function handleHotelApi(
  ctx: FixtureContext,
  tail: string,
): Promise<FixtureReply> {
  const state = hotelState(ctx);
  if (tail === 'hotels/destinations') {
    if (ctx.request.method !== 'GET') return methodNotAllowed('GET');
    const term = ctx.address.searchParams.get('q')?.trim().toLowerCase() ?? '';
    if (term.length > 60)
      return json(400, { error: 'Invalid destination query' });
    return json(200, {
      destinations: destinations.filter(
        ({ city, country }) =>
          city.toLowerCase().includes(term) ||
          country.toLowerCase().includes(term),
      ),
    });
  }
  if (tail === 'hotels/search') {
    if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
    const body = await bodyOf(ctx);
    const city = destinations.find(
      (place) =>
        place.city.toLowerCase() === String(body?.city).trim().toLowerCase(),
    )?.city;
    if (!city) return json(400, { error: 'Choose a supported destination' });
    if (
      !validIsoDate(body?.checkIn) ||
      !validIsoDate(body?.checkOut) ||
      body.checkIn < '2026-09-23' ||
      body.checkOut <= body.checkIn ||
      body.checkOut > '2028-01-01'
    )
      return json(400, { error: 'Choose valid check-in and check-out dates' });
    if (
      !Number.isInteger(body?.adults) ||
      Number(body?.adults) < 1 ||
      Number(body?.adults) > 8 ||
      !Number.isInteger(body?.rooms) ||
      Number(body?.rooms) < 1 ||
      Number(body?.rooms) > 4 ||
      Number(body?.rooms) > Number(body?.adults)
    )
      return json(400, { error: 'Choose 1–8 guests and 1–4 rooms' });
    if (
      typeof body?.design !== 'boolean' ||
      typeof body?.freeCancellation !== 'boolean'
    )
      return json(400, { error: 'Invalid stay filters' });
    Object.assign(state, {
      city,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      adults: body.adults,
      rooms: body.rooms,
      design: body.design,
      freeCancellation: body.freeCancellation,
      resultsVisible: true,
      sort: 'recommended',
      openedHotelId: null,
      openedHotelTitle: null,
    });
    const resultCount = filteredHotels(
      city,
      state.design,
      state.freeCancellation,
    ).length;
    ctx.record('hotelResultsOpened', {
      city,
      checkIn: state.checkIn,
      checkOut: state.checkOut,
      adults: state.adults,
      rooms: state.rooms,
      design: state.design,
      freeCancellation: state.freeCancellation,
      resultCount,
    });
    return json(200, { resultCount, criteria: { ...state } });
  }
  if (tail === 'hotels/sort') {
    if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
    if (!state.resultsVisible)
      return json(409, { error: 'Search for stays before sorting' });
    const body = await bodyOf(ctx);
    if (!['recommended', 'price', 'rating'].includes(String(body?.sort)))
      return json(400, { error: 'Invalid sort order' });
    state.sort = body?.sort as string;
    ctx.record('hotelSortChanged', { sort: state.sort });
    return json(200, { sort: state.sort });
  }
  if (tail === 'hotels/open') {
    if (ctx.request.method !== 'POST') return methodNotAllowed('POST');
    if (!state.resultsVisible)
      return json(409, { error: 'Search for stays first' });
    const body = await bodyOf(ctx);
    const hotel =
      typeof body?.hotelId === 'string'
        ? hotelForResults(body.hotelId, state)
        : undefined;
    if (!hotel) return json(404, { error: 'Hotel not found in these results' });
    state.openedHotelId = hotel.id;
    state.openedHotelTitle = hotel.name;
    ctx.record('hotelOpened', { hotelId: hotel.id, title: hotel.name });
    return json(200, { hotelId: hotel.id, title: hotel.name });
  }
  if (tail === 'state') {
    if (ctx.request.method !== 'GET') return methodNotAllowed('GET');
    return json(200, {
      result: state,
      revision: ctx.state.revision,
      events: ctx.state.events,
    });
  }
  return json(404, { error: 'Endpoint not found' });
}

async function handlePage(ctx: FixtureContext): Promise<FixtureReply> {
  if (ctx.request.method !== 'GET') return methodNotAllowed('GET');
  const tail = ctx.tail.replace(/\/$/, '');
  if (isFlightScenario(ctx.scenario)) {
    if (tail === '')
      return {
        status: 200,
        body: renderFlightPage(
          ctx.runId,
          ctx.scenario,
          flightState(ctx),
          false,
        ),
      };
    if (tail === 'results') {
      if (!flightState(ctx).resultsVisible)
        return json(409, { error: 'Search for flights first' });
      return {
        status: 200,
        body: renderFlightPage(ctx.runId, ctx.scenario, flightState(ctx), true),
      };
    }
    return json(404, { error: 'Page not found' });
  }
  if (tail === '')
    return { status: 200, body: renderHotelHome(ctx.runId, hotelState(ctx)) };
  if (tail === 'results') {
    if (!hotelState(ctx).resultsVisible)
      return json(409, { error: 'Search for stays first' });
    return {
      status: 200,
      body: renderHotelResults(ctx.runId, hotelState(ctx)),
    };
  }
  const hotel = findHotel(tail);
  if (
    !hotel ||
    hotel.city !== hotelState(ctx).city ||
    !hotelState(ctx).resultsVisible
  )
    return json(404, { error: 'Hotel not found' });
  return {
    status: 200,
    body: renderHotelDetail(ctx.runId, hotelState(ctx), hotel),
  };
}

const travelApp: FixtureApp = {
  scenarios: ['flights', 'flights-native-date', 'hotel'],
  initialResult(scenario) {
    if (isFlightScenario(scenario))
      return {
        origin: null,
        destination: null,
        originAirport: null,
        destinationAirport: null,
        tripType: 'round-trip',
        departureDate: null,
        returnDate: null,
        adults: 1,
        cabin: 'economy',
        resultsVisible: false,
        sort: 'best',
        nonstop: false,
        airline: '',
        selectedFlightId: null,
      };
    return {
      city: null,
      checkIn: '2026-11-12',
      checkOut: '2026-11-15',
      adults: 2,
      rooms: 1,
      design: false,
      freeCancellation: false,
      resultsVisible: false,
      sort: 'recommended',
      openedHotelId: null,
      openedHotelTitle: null,
    };
  },
  handle(ctx) {
    if (ctx.kind === 'page') return handlePage(ctx);
    const tail = ctx.tail.replace(/\/$/, '');
    return isFlightScenario(ctx.scenario)
      ? handleFlightApi(ctx, tail)
      : handleHotelApi(ctx, tail);
  },
};

export default travelApp;
