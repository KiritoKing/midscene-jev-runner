import { escapeHtml, page, photoDataUri } from './common.js';
import { type Flight, airports, sortedFlights } from './data.js';

type FlightScenario = 'flights' | 'flights-native-date';

export interface FlightView {
  origin: string | null;
  destination: string | null;
  originAirport: string | null;
  destinationAirport: string | null;
  tripType: string | null;
  departureDate: string | null;
  returnDate: string | null;
  adults: number;
  cabin: string;
  resultsVisible: boolean;
  sort: string;
  nonstop: boolean;
  airline: string;
  selectedFlightId: string | null;
}

function flightForm(
  runId: string,
  scenario: FlightScenario,
  state: FlightView,
  compact = false,
): string {
  const dateInput =
    scenario === 'flights-native-date'
      ? `<input id="date-native" name="date" type="date" aria-label="Departure date" value="${escapeHtml(state.departureDate ?? '')}" min="2026-09-23" max="2027-12-31" required>`
      : `<button id="departure-picker" class="field-button" type="button" aria-label="Choose departure date"><span class="field-icon">▦</span><span id="departure-label">${state.departureDate ? escapeHtml(new Date(`${state.departureDate}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })) : 'Choose departure date'}</span></button><input name="date" type="hidden" value="${escapeHtml(state.departureDate ?? '')}">`;
  return `<form id="flight-search-form" class="flight-form card ${compact ? 'compact' : ''}" autocomplete="off">
    <div class="form-top"><div class="trip-wrap"><button id="trip-picker" class="picker-button" type="button" aria-haspopup="menu" aria-expanded="false"><span>⇄</span> <span id="trip-label">${state.tripType === 'one-way' ? 'One-way' : 'Round trip'}</span> <span class="chevron">⌄</span></button><div id="trip-menu" class="picker-menu" role="menu" hidden><button type="button" data-trip="round-trip">Round trip</button><button type="button" data-trip="one-way">One-way</button></div><input id="trip-type" name="tripType" type="hidden" value="${state.tripType ?? 'round-trip'}"></div>
      <div class="passenger-wrap"><button id="passenger-picker" class="picker-button" type="button" aria-expanded="false" aria-controls="passenger-menu"><span class="field-icon">♙</span> <span id="passenger-label">${state.adults} adult${state.adults === 1 ? '' : 's'}</span> ⌄</button><div id="passenger-menu" class="passenger-menu" hidden><div><strong>Adults</strong><small>Age 12 and over</small></div><button id="adult-minus" type="button" aria-label="Remove adult">−</button><input name="adults" aria-label="Adults" type="number" min="1" max="9" value="${state.adults}"><button id="adult-plus" type="button" aria-label="Add adult">+</button></div></div>
      <label class="people-cabin"><select name="cabin" aria-label="Cabin"><option value="economy" ${state.cabin === 'economy' ? 'selected' : ''}>Economy</option><option value="premium-economy" ${state.cabin === 'premium-economy' ? 'selected' : ''}>Premium economy</option><option value="business" ${state.cabin === 'business' ? 'selected' : ''}>Business</option><option value="first" ${state.cabin === 'first' ? 'selected' : ''}>First</option></select></label></div>
    <div class="route-fields"><div class="airport-wrap"><label class="field-label" for="from">From</label><input id="from" name="origin" aria-label="From" type="text" role="combobox" aria-controls="origin-options" aria-expanded="false" placeholder="Where from?" value="${escapeHtml(state.origin ?? '')}" data-airport-code="${escapeHtml(state.originAirport ?? '')}" required><div id="origin-options" class="airport-options" role="listbox" hidden></div></div><button id="swap-airports" class="swap" type="button" aria-label="Swap airports">⇄</button><div class="airport-wrap"><label class="field-label" for="to">To</label><input id="to" name="destination" aria-label="To" type="text" role="combobox" aria-controls="destination-options" aria-expanded="false" placeholder="Where to?" value="${escapeHtml(state.destination ?? '')}" data-airport-code="${escapeHtml(state.destinationAirport ?? '')}" required><div id="destination-options" class="airport-options" role="listbox" hidden></div></div></div>
    <div class="date-fields"><div class="date-field"><label class="field-label" for="${scenario === 'flights-native-date' ? 'date-native' : 'departure-picker'}">Departure</label>${dateInput}</div><div class="date-field" id="return-date-field" ${state.tripType === 'one-way' ? 'hidden' : ''}><label class="field-label" for="return-date">Return</label><input id="return-date" name="returnDate" aria-label="Return date" type="date" value="${escapeHtml(state.returnDate ?? '')}" min="2026-09-23" max="2027-12-31"></div></div>
    <div class="form-bottom"><p class="muted">Explore fares across airlines and nearby airports.</p><button class="blue-button" type="submit">Search flights</button></div>
    <div id="calendar" class="calendar-popover" role="dialog" aria-label="Flight departure calendar" hidden><div class="calendar-head"><strong>Choose departure date</strong><button id="calendar-close" type="button" aria-label="Close calendar">✕</button></div><div class="calendar-nav"><button id="month-prev" type="button" aria-label="Previous months">‹</button><span>Lowest fares for each day</span><button id="month-next" type="button" aria-label="Next months">›</button></div><div id="calendar-months" class="calendar-months"></div><div class="calendar-foot"><span>Prices shown in GBP · 1 adult · Economy</span><button id="calendar-done" type="button">Done</button></div></div>
  </form><div id="notice" role="alert"></div>`;
}

function flightHeader(state: FlightView): string {
  const from = state.origin ?? 'Zurich';
  const to = state.destination ?? 'London';
  const summary = state.resultsVisible
    ? `${from} to ${to} · ${state.tripType === 'one-way' ? 'One-way' : 'Round trip'} · ${state.departureDate ?? ''} · ${state.adults} adult${state.adults === 1 ? '' : 's'} · ${state.cabin}`
    : 'Find the best flights for your trip';
  return `<div class="flight-heading"><div class="plane-illustration" aria-hidden="true"><span>✈</span><i></i></div><h1>${state.resultsVisible ? `Flights from ${escapeHtml(from)} to ${escapeHtml(to)}` : 'Flights'}</h1><p>${escapeHtml(summary)}</p></div>`;
}

function priceGraph(available: readonly Flight[]): string {
  const heights = [38, 52, 44, 63, 45, 68, 41, 55, 36, 71, 58, 48, 69, 46];
  const prices = available.map((flight) => flight.price);
  return `<section class="price-card card"><div><h2>Price insights</h2><p>Sample fares for your selected route, date, travelers and cabin.</p><strong>£${Math.min(...prices)}–£${Math.max(...prices)}</strong><small>Available sample fare range</small></div><div class="spark-bars" aria-label="Illustrative price trend">${heights.map((height) => `<span style="height:${height}px"></span>`).join('')}</div></section>`;
}

function flightCard(flight: Flight): string {
  const durationH = Math.floor(flight.durationMinutes / 60);
  const durationM = flight.durationMinutes % 60;
  const duration = `${durationH} hr ${durationM ? `${durationM} min` : ''}`;
  return `<article class="flight-card card" data-flight-id="${escapeHtml(flight.id)}"><div class="flight-main"><div class="airline-mark">${escapeHtml(flight.airline.slice(0, 1))}</div><div class="flight-time"><strong>${escapeHtml(flight.departure)} – ${escapeHtml(flight.arrival)}</strong><span>${escapeHtml(flight.airline)} · ${escapeHtml(flight.flightNumber)}</span></div><div class="flight-route"><strong>${escapeHtml(duration)}</strong><div class="route-line"></div><span>${escapeHtml(flight.origin)}–${escapeHtml(flight.destination)}</span></div><div class="flight-stops"><strong>${flight.stops === 0 ? 'Nonstop' : '1 stop'}</strong><span>${flight.via ? `via ${escapeHtml(flight.via)}` : `${flight.emissionsKg} kg CO₂e`}</span></div><div class="flight-price"><strong>£${flight.price}</strong><span>one way</span></div><button type="button" class="flight-expand" aria-label="Flight details for ${escapeHtml(flight.airline)} ${escapeHtml(flight.flightNumber)}">⌄</button></div><div class="flight-detail" hidden><div><h3>${escapeHtml(flight.airline)} ${escapeHtml(flight.flightNumber)}</h3><p>${escapeHtml(flight.origin)} → ${escapeHtml(flight.destination)} · ${escapeHtml(duration)} · ${flight.stops === 0 ? 'Nonstop' : '1 stop'}</p><p>${escapeHtml(flight.baggage)} · ${flight.emissionsKg} kg CO₂e estimated emissions</p>${flight.via ? `<p>Connection in ${escapeHtml(flight.via)}</p>` : ''}</div><button type="button" class="outline-button select-flight" data-flight-id="${escapeHtml(flight.id)}">Select flight</button></div></article>`;
}

export function renderFlightPage(
  runId: string,
  scenario: FlightScenario,
  state: FlightView,
  results: boolean,
): string {
  const available = quotedFlights(state);
  const destinations = [
    {
      city: 'London',
      image: 'london-skyline.jpg',
      label: 'Explore flights to London',
    },
    {
      city: 'Paris',
      image: 'paris-skyline.jpg',
      label: 'Explore flights to Paris',
    },
    {
      city: 'Lisbon',
      image: 'lisbon-cityscape.jpg',
      label: 'Explore flights to Lisbon',
    },
  ];
  const destinationCards = destinations
    .map(
      ({ city, image, label }) =>
        `<button class="destination-card" type="button" data-destination="${city}" aria-label="${label}"><img src="${photoDataUri(image)}" alt="${city} city view"><strong>${city}</strong><span>${city === 'London' ? 'Sample fares from £94' : 'Explore route'}</span></button>`,
    )
    .join('');
  const body = `<main class="travel-main flight-page" id="top">${flightHeader(state)}${flightForm(runId, scenario, state, results)}${results ? `${available.length ? priceGraph(available) : ''}<div class="results-layout"><aside class="filters card"><h2>Filters</h2><label><input id="nonstop-filter" type="checkbox" ${state.nonstop ? 'checked' : ''}> Nonstop only</label><div class="filter-divider"></div><strong>Airlines</strong><label><input class="airline-filter" type="radio" name="airline-filter" value="" ${!state.airline ? 'checked' : ''}> All airlines</label>${['SWISS', 'British Airways', 'easyJet', 'KLM', 'Lufthansa'].map((name) => `<label><input class="airline-filter" type="radio" name="airline-filter" value="${name}" ${state.airline === name ? 'checked' : ''}> ${name}</label>`).join('')}</aside><div class="flight-results"><div class="result-controls"><h2>Available flights</h2><label>Sort by <select id="flight-sort" aria-label="Sort flights"><option value="best" ${state.sort === 'best' ? 'selected' : ''}>Top flights</option><option value="price" ${state.sort === 'price' ? 'selected' : ''}>Price</option><option value="duration" ${state.sort === 'duration' ? 'selected' : ''}>Duration</option><option value="departure" ${state.sort === 'departure' ? 'selected' : ''}>Departure time</option></select></label></div><div class="result-tabs" role="tablist" aria-label="Flight rankings"><button id="best-tab" role="tab" aria-selected="${state.sort !== 'price'}" type="button">Best <small>Balance of price and convenience</small></button><button id="cheap-tab" role="tab" aria-selected="${state.sort === 'price'}" type="button">Cheapest <small>Lowest price first</small></button></div><p class="muted">${available.length} flight options · Prices include taxes and fees for ${state.adults} adult${state.adults === 1 ? '' : 's'} in ${escapeHtml(state.cabin)}</p><div id="flight-list">${available.map(flightCard).join('') || '<div class="card empty-results">No flights match this route or these filters. Try another airport or allow stops.</div>'}</div></div></div>` : `<section class="browse-destinations"><h2>Popular destinations from Zurich</h2><div class="destination-cards">${destinationCards}</div></section>`}</main>`;
  return page(
    results ? `${state.origin} to ${state.destination} flights` : 'Flights',
    'Flights',
    runId,
    body,
    css + controlCss,
    clientScript(runId, scenario),
  );
}

export function quotedFlights(state: FlightView): Flight[] {
  const matchingRoute = sortedFlights(
    state.sort,
    state.nonstop,
    state.airline,
  ).filter((flight) => {
    const origin = airports.find((airport) => airport.code === flight.origin);
    const destination = airports.find(
      (airport) => airport.code === flight.destination,
    );
    return (
      origin?.city === state.origin &&
      destination?.city === state.destination &&
      (!state.originAirport || state.originAirport === flight.origin) &&
      (!state.destinationAirport ||
        state.destinationAirport === flight.destination)
    );
  });
  const date = state.departureDate ?? '2026-11-12';
  const adjustment =
    date === '2026-11-12'
      ? 0
      : ((Number(date.slice(-2)) * 7 + Number(date.slice(5, 7)) * 3) % 33) - 12;
  const cabinMultiplier: Record<string, number> = {
    economy: 1,
    'premium-economy': 1.55,
    business: 2.8,
    first: 4.4,
  };
  return matchingRoute.map((flight) => ({
    ...flight,
    price: Math.round(
      (flight.price + adjustment) *
        (cabinMultiplier[state.cabin] ?? 1) *
        state.adults,
    ),
  }));
}

function clientScript(runId: string, scenario: FlightScenario): string {
  return `
const RUN_ID=${JSON.stringify(runId)}, SCENARIO=${JSON.stringify(scenario)}, API='/api/travel/'+encodeURIComponent(RUN_ID)+'/';
const q=(selector)=>document.querySelector(selector);
const notice=(message)=>{const box=q('#notice');box.textContent=message;box.style.display='block';};
async function request(path,payload){const response=await fetch(API+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');return data;}
const tripButton=q('#trip-picker'),tripMenu=q('#trip-menu');
tripButton.addEventListener('click',()=>{tripMenu.hidden=!tripMenu.hidden;tripButton.setAttribute('aria-expanded',String(!tripMenu.hidden));});
for(const button of tripMenu.querySelectorAll('[data-trip]'))button.addEventListener('click',()=>{const value=button.dataset.trip;q('#trip-type').value=value;q('#trip-label').textContent=button.textContent;tripMenu.hidden=true;tripButton.setAttribute('aria-expanded','false');q('#return-date-field').hidden=value==='one-way';});
const passengerButton=q('#passenger-picker'),passengerMenu=q('#passenger-menu'),adultInput=q('input[name="adults"]');
passengerButton.addEventListener('click',()=>{passengerMenu.hidden=!passengerMenu.hidden;passengerButton.setAttribute('aria-expanded',String(!passengerMenu.hidden));});
function setAdults(value){adultInput.value=String(Math.max(1,Math.min(9,value)));q('#passenger-label').textContent=adultInput.value+' adult'+(adultInput.value==='1'?'':'s');}
q('#adult-minus').addEventListener('click',()=>setAdults(Number(adultInput.value)-1));q('#adult-plus').addEventListener('click',()=>setAdults(Number(adultInput.value)+1));adultInput.addEventListener('change',()=>setAdults(Number(adultInput.value)||1));
q('#swap-airports').addEventListener('click',()=>{const a=q('#from'),b=q('#to');[a.value,b.value]=[b.value,a.value];[a.dataset.airportCode,b.dataset.airportCode]=[b.dataset.airportCode,a.dataset.airportCode];});
for(const [inputId,optionsId] of [['from','origin-options'],['to','destination-options']]){
 const input=q('#'+inputId),options=q('#'+optionsId);let timer;const load=()=>{clearTimeout(timer);timer=setTimeout(async()=>{const term=input.value.trim();if(!term){options.hidden=true;return;}try{const response=await fetch(API+'airports?q='+encodeURIComponent(term));const data=await response.json();options.replaceChildren();for(const airport of data.airports){const button=document.createElement('button');button.type='button';button.className='airport-option';button.innerHTML='<span class="airport-symbol">✈</span><span><strong></strong><small></small></span><b></b>';button.querySelector('strong').textContent=airport.city;button.querySelector('small').textContent=airport.name+' · '+airport.country;button.querySelector('b').textContent=airport.code;button.addEventListener('click',()=>{input.value=airport.city;input.dataset.airportCode=airport.code;options.hidden=true;input.setAttribute('aria-expanded','false');});options.append(button);}options.hidden=data.airports.length===0;input.setAttribute('aria-expanded',String(!options.hidden));}catch{options.hidden=true;}},100);};
 input.addEventListener('input',()=>{delete input.dataset.airportCode;load();});input.addEventListener('focus',load);input.addEventListener('keydown',(event)=>{if(event.key==='Escape')options.hidden=true;if(event.key==='ArrowDown'&&!options.hidden){event.preventDefault();options.querySelector('button')?.focus();}});
}
document.addEventListener('click',(event)=>{if(!event.target.closest('.airport-wrap'))for(const options of document.querySelectorAll('.airport-options'))options.hidden=true;});
for(const card of document.querySelectorAll('[data-destination]'))card.addEventListener('click',()=>{q('#from').value='Zurich';q('#from').dataset.airportCode='ZRH';q('#to').value=card.dataset.destination;delete q('#to').dataset.airportCode;q('#to').focus();q('#flight-search-form').scrollIntoView({behavior:'smooth',block:'center'});});
const calendar=q('#calendar');let monthOffset=0;
const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
function paintCalendar(){if(!calendar)return;const grid=q('#calendar-months');grid.replaceChildren();for(let side=0;side<2;side++){const first=new Date(2026,9+monthOffset+side,1);const y=first.getFullYear(),m=first.getMonth();const wrapper=document.createElement('section');wrapper.className='calendar-month';const h=document.createElement('h3');h.textContent=monthNames[m]+' '+y;wrapper.append(h);const cells=document.createElement('div');cells.className='day-grid';for(const weekday of ['M','T','W','T','F','S','S']){const label=document.createElement('span');label.className='weekday';label.textContent=weekday;cells.append(label);}const offset=(first.getDay()+6)%7;for(let i=0;i<offset;i++)cells.append(document.createElement('span'));const days=new Date(y,m+1,0).getDate();for(let day=1;day<=days;day++){const iso=y+'-'+String(m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');const button=document.createElement('button');button.type='button';button.className='day';button.setAttribute('aria-label',day+' '+monthNames[m]+' '+y);button.innerHTML='<span>'+day+'</span><small>£'+(94+((day*17+m*11)%105))+'</small>';if(iso<'2026-09-23')button.disabled=true;if(iso===q('input[name="date"]').value)button.classList.add('chosen');button.addEventListener('click',()=>{q('input[name="date"]').value=iso;q('#departure-label').textContent=day+' '+monthNames[m].slice(0,3)+' '+y;calendar.hidden=true;});cells.append(button);}wrapper.append(cells);grid.append(wrapper);}}
if(calendar&&q('#departure-picker')){q('#departure-picker').addEventListener('click',()=>{calendar.hidden=false;paintCalendar();});q('#calendar-close').addEventListener('click',()=>calendar.hidden=true);q('#calendar-done').addEventListener('click',()=>calendar.hidden=true);q('#month-prev').addEventListener('click',()=>{monthOffset=Math.max(-1,monthOffset-1);paintCalendar();});q('#month-next').addEventListener('click',()=>{monthOffset=Math.min(13,monthOffset+1);paintCalendar();});}
q('#flight-search-form').addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget;const body={origin:form.elements.origin.value.trim(),destination:form.elements.destination.value.trim(),originAirport:form.elements.origin.dataset.airportCode||null,destinationAirport:form.elements.destination.dataset.airportCode||null,tripType:form.elements.tripType.value,departureDate:form.elements.date.value,returnDate:form.elements.returnDate.value||null,adults:Number(form.elements.adults.value),cabin:form.elements.cabin.value};const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Searching flights…';try{await request('flights/search',body);location.assign('/scenario/'+SCENARIO+'/results?runId='+encodeURIComponent(RUN_ID));}catch(error){notice(String(error));button.disabled=false;button.textContent='Search flights';}});
async function updateFilter(patch){const body={sort:q('#flight-sort').value,nonstop:q('#nonstop-filter').checked,airline:q('input[name="airline-filter"]:checked').value,...patch};try{await request('flights/filter',body);location.reload();}catch(error){notice(String(error));}}
q('#flight-sort')?.addEventListener('change',()=>updateFilter({}));q('#nonstop-filter')?.addEventListener('change',()=>updateFilter({}));for(const radio of document.querySelectorAll('.airline-filter'))radio.addEventListener('change',()=>updateFilter({}));q('#best-tab')?.addEventListener('click',()=>updateFilter({sort:'best'}));q('#cheap-tab')?.addEventListener('click',()=>updateFilter({sort:'price'}));
document.addEventListener('click',async(event)=>{const expand=event.target.closest('.flight-expand');if(expand){const detail=expand.closest('.flight-card').querySelector('.flight-detail');detail.hidden=!detail.hidden;expand.textContent=detail.hidden?'⌄':'⌃';}const select=event.target.closest('.select-flight');if(select){try{const data=await request('flights/select',{flightId:select.dataset.flightId});notice('Selected '+data.airline+' '+data.flightNumber+'. Compare fare options in the details panel.');}catch(error){notice(String(error));}}});
`;
}

const css = `
.flight-page{max-width:1100px}.flight-heading{text-align:center;margin:4px auto 30px}.flight-heading h1{font-size:34px}.flight-heading p{font-size:16px;color:#5f6368;margin:4px}.plane-illustration{width:240px;height:90px;margin:auto;position:relative;color:#1a73e8;font-size:56px}.plane-illustration span{position:relative;z-index:1;transform:rotate(-13deg);display:inline-block}.plane-illustration i{position:absolute;width:205px;border-top:3px dashed #9fc1f7;left:18px;top:54px;transform:rotate(-9deg)}.flight-form{padding:21px 24px;margin:0 auto 28px;position:relative;max-width:930px}.flight-form.compact{max-width:none}.form-top{display:flex;gap:20px;align-items:center;margin-bottom:19px}.trip-wrap{position:relative}.picker-button{background:none;border:0;color:#3c4043;padding:7px}.picker-button:hover{background:#f1f3f4;border-radius:7px}.picker-button>span:first-child{font-size:18px}.chevron{color:#5f6368}.picker-menu{position:absolute;top:35px;left:0;background:#fff;border:1px solid #dadce0;border-radius:8px;box-shadow:0 5px 18px #0002;z-index:11;width:170px;padding:6px}.picker-menu button{display:block;width:100%;text-align:left;background:#fff;border:0;padding:10px 12px;border-radius:4px}.picker-menu button:hover{background:#f1f3f4}.people-cabin{display:flex;gap:3px;align-items:center;color:#5f6368}.people-cabin input{width:31px;border:0;background:none;appearance:textfield;text-align:right}.people-cabin input::-webkit-inner-spin-button{appearance:none}.people-cabin select{border:0;background:none;color:#5f6368}.field-icon{font-size:19px;color:#5f6368}.route-fields{display:flex;align-items:center;gap:9px}.airport-wrap{position:relative;flex:1;height:59px;border:1px solid #dadce0;border-radius:8px;padding:8px 13px}.airport-wrap:focus-within,.date-field:focus-within{border-color:#1a73e8}.field-label{display:block;color:#5f6368;font-size:11px;margin-bottom:3px}.airport-wrap input{border:0;outline:0;width:100%;font-size:18px}.swap{border:1px solid #dadce0;border-radius:50%;width:35px;height:35px;background:#fff;color:#5f6368;font-size:19px}.airport-options{position:absolute;top:58px;left:0;width:360px;max-width:80vw;background:#fff;border:1px solid #dadce0;border-radius:8px;box-shadow:0 5px 19px #0002;z-index:12;padding:6px}.airport-option{width:100%;display:flex;gap:10px;align-items:center;background:#fff;border:0;text-align:left;padding:9px;border-radius:5px}.airport-option:hover{background:#f1f3f4}.airport-option span:nth-child(2){display:flex;flex-direction:column}.airport-option small{color:#5f6368}.airport-option b{margin-left:auto;color:#5f6368}.airport-symbol{background:#e8f0fe;padding:8px;border-radius:50%;color:#1a73e8}.date-fields{display:flex;gap:9px;margin-top:12px}.date-field{flex:1;border:1px solid #dadce0;border-radius:8px;padding:8px 13px;height:60px}.date-field input{width:100%;border:0;background:none;font-size:17px;outline:0}.field-button{border:0;background:#fff;font-size:17px;padding:1px;color:#202124}.form-bottom{display:flex;align-items:center;justify-content:space-between;margin-top:18px}.form-bottom p{margin:0}.calendar-popover{position:absolute;top:100%;left:50%;transform:translateX(-50%);width:min(690px,94vw);background:#fff;border:1px solid #dadce0;border-radius:16px;box-shadow:0 7px 28px #0003;z-index:10;padding:15px 20px}.calendar-head,.calendar-nav,.calendar-foot{display:flex;justify-content:space-between;align-items:center}.calendar-head strong{font-size:17px}.calendar-head button,.calendar-nav button{border:0;background:none;font-size:22px;color:#5f6368}.calendar-nav{margin:12px 0}.calendar-nav span,.calendar-foot{color:#5f6368;font-size:12px}.calendar-months{display:grid;grid-template-columns:1fr 1fr;gap:25px}.calendar-month h3{text-align:center;font-size:15px;font-weight:500}.day-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.weekday{text-align:center;color:#5f6368;font-size:11px}.day{height:48px;border:0;background:#fff;border-radius:50%;display:flex;flex-direction:column;justify-content:center;align-items:center}.day small{font-size:10px;color:#188038}.day:hover,.day.chosen{background:#d2e3fc}.day:disabled{opacity:.3}.calendar-foot{margin-top:12px}.calendar-foot button{border:0;background:none;color:#1a73e8;font-weight:bold}.browse-destinations{margin-top:40px}.destination-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}.destination-card{border:1px solid #dadce0;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;padding-bottom:13px}.destination-card strong,.destination-card span{margin:5px 14px}.destination-card span{color:#5f6368}.destination-art{height:125px;background:linear-gradient(135deg,#adcaea,#edf4fb)}.destination-art.london{background:linear-gradient(145deg,#657a95,#d5c2a5)}.destination-art.paris{background:linear-gradient(145deg,#d8b6a9,#efe3ce)}.destination-art.lisbon{background:linear-gradient(145deg,#e7be89,#d5e4de)}.price-card{display:flex;justify-content:space-between;padding:18px 23px;margin:20px 0 25px;background:#f8fbff}.price-card p{margin:3px 0}.price-card strong{font-size:19px}.price-card small{display:block;color:#5f6368}.spark-bars{display:flex;gap:5px;align-items:end;height:80px;padding:8px}.spark-bars span{width:10px;border-radius:4px 4px 0 0;background:#a8c7fa}.results-layout{display:grid;grid-template-columns:190px 1fr;gap:23px}.filters{padding:18px;align-self:start}.filters h2{font-size:17px}.filters label{display:block;padding:8px 0;color:#3c4043}.filters input{accent-color:#1a73e8}.filter-divider{height:1px;background:#dadce0;margin:14px 0}.filters strong{display:block;margin-bottom:7px}.result-controls{display:flex;justify-content:space-between;align-items:center}.result-controls select{border:0;color:#1a73e8;background:none}.result-tabs{display:flex;border-bottom:1px solid #dadce0}.result-tabs button{flex:1;text-align:left;padding:12px 20px;border:0;background:#fff;font-weight:bold;color:#3c4043}.result-tabs button[aria-selected=true]{border-bottom:3px solid #1a73e8;color:#1a73e8}.result-tabs small{display:block;color:#5f6368;font-weight:normal;margin-top:3px}.flight-card{margin:12px 0;border-radius:11px}.flight-main{display:grid;grid-template-columns:38px 1.45fr 1fr .9fr .65fr 24px;gap:12px;align-items:center;padding:18px 14px}.airline-mark{width:30px;height:30px;background:#d5e4f8;color:#28599a;border-radius:50%;display:grid;place-items:center;font-weight:bold}.flight-main strong{display:block;font-size:14px}.flight-main span{display:block;font-size:12px;color:#5f6368;margin-top:5px}.flight-price{text-align:right}.flight-price strong{font-size:18px}.flight-expand{border:0;background:none;color:#5f6368;font-size:21px}.route-line{height:1px;background:#9aa0a6;margin:6px 0}.flight-detail{border-top:1px solid #dadce0;padding:15px 20px;display:flex;justify-content:space-between;align-items:center}.flight-detail h3{margin:0}.flight-detail p{margin:3px 0;color:#5f6368}.empty-results{padding:30px}@media(max-width:860px){.results-layout{display:block}.filters{margin-bottom:20px}.flight-main{grid-template-columns:30px 1.3fr 1fr .8fr}.flight-stops{display:none}.calendar-months{gap:8px}}@media(max-width:620px){.route-fields{flex-wrap:wrap}.airport-wrap{flex-basis:100%}.swap{display:none}.form-top{gap:7px;flex-wrap:wrap}.calendar-months{grid-template-columns:1fr}.calendar-month:nth-child(2){display:none}.flight-main{grid-template-columns:30px 1fr 1fr}.flight-route,.flight-stops{display:none}.flight-heading h1{font-size:28px}.form-bottom p{display:none}}
`;

const controlCss = `
.passenger-wrap{position:relative}.passenger-menu{position:absolute;top:36px;left:0;min-width:255px;background:#fff;border:1px solid #dadce0;border-radius:12px;box-shadow:0 5px 18px #0002;z-index:11;padding:16px;display:flex;align-items:center;gap:10px}.passenger-menu>div{flex:1;display:flex;flex-direction:column}.passenger-menu small{font-size:11px;color:#5f6368}.passenger-menu button{border:1px solid #a8c7fa;background:#fff;color:#1a73e8;border-radius:50%;width:30px;height:30px;font-size:20px;line-height:24px}.passenger-menu input{width:28px;border:0;text-align:center;appearance:textfield}.passenger-menu input::-webkit-inner-spin-button{appearance:none}.destination-card{border:1px solid #dadce0;background:#fff;text-align:left;padding:0;cursor:pointer}.destination-card:hover{box-shadow:0 3px 10px #20212422}.destination-card img{width:100%;height:125px;object-fit:cover;display:block}.destination-card strong,.destination-card span{display:block}
`;
