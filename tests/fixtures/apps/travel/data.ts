export interface Airport {
  city: string;
  code: string;
  name: string;
  country: string;
}

export interface Flight {
  id: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  durationMinutes: number;
  stops: number;
  via?: string;
  price: number;
  emissionsKg: number;
  baggage: string;
}

export interface Hotel {
  id: string;
  name: string;
  city: string;
  neighborhood: string;
  description: string;
  stars: number;
  score: number;
  reviewCount: number;
  price: number;
  design: boolean;
  freeCancellation: boolean;
  photos: readonly string[];
  amenities: readonly string[];
  tags: readonly string[];
}

export const airports: readonly Airport[] = [
  {
    city: 'Zurich',
    code: 'ZRH',
    name: 'Zurich Airport',
    country: 'Switzerland',
  },
  {
    city: 'London',
    code: 'LHR',
    name: 'Heathrow Airport',
    country: 'United Kingdom',
  },
  {
    city: 'London',
    code: 'LGW',
    name: 'Gatwick Airport',
    country: 'United Kingdom',
  },
  {
    city: 'Paris',
    code: 'CDG',
    name: 'Charles de Gaulle Airport',
    country: 'France',
  },
  {
    city: 'Berlin',
    code: 'BER',
    name: 'Berlin Brandenburg Airport',
    country: 'Germany',
  },
  {
    city: 'Lisbon',
    code: 'LIS',
    name: 'Humberto Delgado Airport',
    country: 'Portugal',
  },
  {
    city: 'Amsterdam',
    code: 'AMS',
    name: 'Amsterdam Airport Schiphol',
    country: 'Netherlands',
  },
];

export const flights: readonly Flight[] = [
  {
    id: 'swiss-356',
    airline: 'SWISS',
    flightNumber: 'LX 356',
    origin: 'ZRH',
    destination: 'LHR',
    departure: '07:05',
    arrival: '08:05',
    durationMinutes: 120,
    stops: 0,
    price: 186,
    emissionsKg: 171,
    baggage: 'Carry-on included',
  },
  {
    id: 'british-713',
    airline: 'British Airways',
    flightNumber: 'BA 713',
    origin: 'ZRH',
    destination: 'LHR',
    departure: '10:45',
    arrival: '11:40',
    durationMinutes: 115,
    stops: 0,
    price: 219,
    emissionsKg: 184,
    baggage: 'Carry-on included',
  },
  {
    id: 'easyjet-844',
    airline: 'easyJet',
    flightNumber: 'U2 844',
    origin: 'ZRH',
    destination: 'LGW',
    departure: '13:20',
    arrival: '14:15',
    durationMinutes: 115,
    stops: 0,
    price: 94,
    emissionsKg: 169,
    baggage: 'Small cabin bag included',
  },
  {
    id: 'klm-1945',
    airline: 'KLM',
    flightNumber: 'KL 1945',
    origin: 'ZRH',
    destination: 'LHR',
    departure: '09:25',
    arrival: '13:35',
    durationMinutes: 310,
    stops: 1,
    via: 'Amsterdam (AMS)',
    price: 143,
    emissionsKg: 238,
    baggage: 'Carry-on included',
  },
  {
    id: 'swiss-358',
    airline: 'SWISS',
    flightNumber: 'LX 358',
    origin: 'ZRH',
    destination: 'LHR',
    departure: '17:35',
    arrival: '18:35',
    durationMinutes: 120,
    stops: 0,
    price: 207,
    emissionsKg: 174,
    baggage: 'Carry-on included',
  },
  {
    id: 'lufthansa-2470',
    airline: 'Lufthansa',
    flightNumber: 'LH 2470',
    origin: 'ZRH',
    destination: 'LHR',
    departure: '14:10',
    arrival: '18:30',
    durationMinutes: 320,
    stops: 1,
    via: 'Munich (MUC)',
    price: 178,
    emissionsKg: 244,
    baggage: 'Carry-on included',
  },
];

export const hotels: readonly Hotel[] = [
  {
    id: 'casa-flora',
    name: 'Casa Flora',
    city: 'Lisbon',
    neighborhood: 'Chiado',
    description:
      'A warm design-led retreat on a quiet Chiado street, with airy rooms, local ceramics and a leafy courtyard.',
    stars: 4,
    score: 9.2,
    reviewCount: 683,
    price: 182,
    design: true,
    freeCancellation: true,
    photos: [
      'room-windows.jpg',
      'room-fonda.jpg',
      'lisbon-cityscape.jpg',
      'room-plaza.jpg',
    ],
    amenities: [
      'Free Wi-Fi',
      'Breakfast available',
      'Air conditioning',
      'Courtyard',
      'Airport transfer',
      '24-hour front desk',
    ],
    tags: ['Boutique', 'Design', 'Free cancellation'],
  },
  {
    id: 'alfama-terrace-house',
    name: 'Alfama Terrace House',
    city: 'Lisbon',
    neighborhood: 'Alfama',
    description:
      'Boutique rooms overlooking terracotta rooftops and the Tagus, with a small pool and a terrace bar.',
    stars: 4,
    score: 9.0,
    reviewCount: 1182,
    price: 206,
    design: true,
    freeCancellation: true,
    photos: ['room-fonda.jpg', 'lisbon-cityscape.jpg', 'room-windows.jpg'],
    amenities: [
      'Free Wi-Fi',
      'Outdoor pool',
      'Terrace',
      'Bar',
      'Breakfast available',
    ],
    tags: ['Boutique', 'Rooftop terrace', 'Free cancellation'],
  },
  {
    id: 'lumiere-bairro',
    name: 'Lumière Bairro Alto',
    city: 'Lisbon',
    neighborhood: 'Bairro Alto',
    description:
      'Contemporary suites with an art-filled lobby, walkable streets and views over central Lisbon.',
    stars: 5,
    score: 9.3,
    reviewCount: 442,
    price: 268,
    design: true,
    freeCancellation: false,
    photos: ['room-plaza.jpg', 'room-windows.jpg', 'lisbon-cityscape.jpg'],
    amenities: [
      'Free Wi-Fi',
      'Spa',
      'Restaurant',
      'Fitness center',
      'Air conditioning',
    ],
    tags: ['Design', 'Spa'],
  },
  {
    id: 'ribeira-house',
    name: 'Ribeira House',
    city: 'Lisbon',
    neighborhood: 'Cais do Sodré',
    description:
      'Bright rooms beside the riverfront, close to ferry connections and the Time Out Market.',
    stars: 3,
    score: 8.7,
    reviewCount: 917,
    price: 119,
    design: false,
    freeCancellation: true,
    photos: ['room-flickr.jpg', 'lisbon-cityscape.jpg'],
    amenities: [
      'Free Wi-Fi',
      'Breakfast available',
      'Air conditioning',
      'Luggage storage',
    ],
    tags: ['Great value', 'Free cancellation'],
  },
  {
    id: 'avenida-classic',
    name: 'Avenida Classic',
    city: 'Lisbon',
    neighborhood: 'Avenida da Liberdade',
    description:
      'Traditional city hotel with generous rooms near gardens, theaters and the metro.',
    stars: 4,
    score: 8.8,
    reviewCount: 1637,
    price: 152,
    design: false,
    freeCancellation: true,
    photos: ['room-plaza.jpg', 'room-flickr.jpg'],
    amenities: [
      'Free Wi-Fi',
      'Restaurant',
      'Breakfast included',
      'Fitness center',
    ],
    tags: ['Central location', 'Free cancellation'],
  },
  {
    id: 'porto-atelier',
    name: 'Porto Atelier',
    city: 'Porto',
    neighborhood: 'Baixa',
    description:
      'Creative guesthouse near Porto’s historic center, with carefully furnished rooms.',
    stars: 4,
    score: 9.1,
    reviewCount: 406,
    price: 141,
    design: true,
    freeCancellation: true,
    photos: ['room-windows.jpg', 'porto-cityscape.jpg'],
    amenities: ['Free Wi-Fi', 'Breakfast available', 'Air conditioning'],
    tags: ['Design', 'Free cancellation'],
  },
];

export function findHotel(id: string): Hotel | undefined {
  return hotels.find((hotel) => hotel.id === id);
}

export function filteredHotels(
  city: string,
  design: boolean,
  freeCancellation: boolean,
): Hotel[] {
  return hotels.filter(
    (hotel) =>
      hotel.city.toLowerCase() === city.toLowerCase() &&
      (!design || hotel.design) &&
      (!freeCancellation || hotel.freeCancellation),
  );
}

export function sortedFlights(
  sort: string,
  nonstop: boolean,
  airline: string,
): Flight[] {
  const filtered = flights.filter(
    (flight) =>
      (!nonstop || flight.stops === 0) &&
      (!airline || flight.airline === airline),
  );
  return [...filtered].sort((a, b) => {
    if (sort === 'price') return a.price - b.price;
    if (sort === 'duration') return a.durationMinutes - b.durationMinutes;
    if (sort === 'departure') return a.departure.localeCompare(b.departure);
    return (
      a.stops * 80 +
      a.durationMinutes / 5 +
      a.price / 4 -
      (b.stops * 80 + b.durationMinutes / 5 + b.price / 4)
    );
  });
}
