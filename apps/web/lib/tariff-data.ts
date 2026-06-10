// Tariff Data for LuxDrive Partner Portal
// Updated structure with 4 cities, sub-tabs, and TBD routes

export type VehicleClass = 
  | 'economy-sedan' 
  | 'business-sedan' 
  | 'business-suv' 
  | 'first-class'
  | 'hiace'
  | 'coaster'
  | 'kinglong'
  | 'electric-luxury-sedan'

export type City = 'riyadh' | 'jeddah' | 'makkah' | 'madinah'

export type RouteType = 'oneway' | 'hourly'

export interface TariffRoute {
  id: string
  pickup: string
  dropoff: string
  isHourly?: boolean
  isPerKm?: boolean
  isExtraHour?: boolean
  isTBD?: boolean // Routes with TBD pricing - not selectable in booking
}

export interface TariffPrice {
  routeId: string
  vehicleClass: VehicleClass
  price: number // SAR including VAT
}

export interface CityInfo {
  id: City
  name: string
  province: string
  hasEcoFleet: boolean
}

export const CITIES: CityInfo[] = [
  { id: 'riyadh', name: 'Riyadh', province: 'Central Province', hasEcoFleet: true },
  { id: 'jeddah', name: 'Jeddah', province: 'Western Province', hasEcoFleet: false },
  { id: 'makkah', name: 'Makkah', province: 'Western Province', hasEcoFleet: false },
  { id: 'madinah', name: 'Madinah', province: 'Western Province', hasEcoFleet: false },
]

// Vehicle Classes - Sedans, SUV, Group Transport
// Note: Luggage capacity always equals passenger capacity (luggage = passengers)
export const VEHICLE_CLASSES: { id: VehicleClass; name: string; category: 'sedan' | 'suv' | 'group' | 'ev'; description?: string; model?: string; maxPassengers: number }[] = [
  { id: 'economy-sedan', name: 'Economy Sedan', category: 'sedan', model: 'Ford Taurus or Similar', maxPassengers: 4 },
  { id: 'business-sedan', name: 'Business Sedan', category: 'sedan', model: 'Mercedes E-Class or Similar', maxPassengers: 4 },
  { id: 'first-class', name: 'First Class', category: 'sedan', model: 'Rolls Royce or Similar', maxPassengers: 4 },
  { id: 'business-suv', name: 'Business SUV', category: 'suv', model: 'GMC Yukon or Similar', maxPassengers: 7 },
  { id: 'hiace', name: 'Hiace 10-Seater', category: 'group', maxPassengers: 10 },
  { id: 'coaster', name: 'Coaster 23-Seater', category: 'group', maxPassengers: 23 },
  { id: 'kinglong', name: 'King Long 49-Seater', category: 'group', maxPassengers: 49 },
  { id: 'electric-luxury-sedan', name: 'Electric', category: 'ev', description: 'Zero Emissions', model: 'Lucid Air or Similar', maxPassengers: 4 },
]

// Helper: Get luggage capacity (always equals passengers)
export function getLuggageCapacity(passengers: number): number {
  return passengers
}

// Get vehicle classes for display (excluding EV which is in separate tab)
export const DISPLAY_VEHICLE_CLASSES = VEHICLE_CLASSES.filter(v => v.category !== 'ev')

// CO2 savings calculation (average car emits ~120g CO2/km)
export function calculateCO2Savings(distanceKm: number): number {
  return Math.round(distanceKm * 0.12) // Returns kg of CO2 saved
}

// Check if a vehicle is EV
export function isEcoVehicle(vehicleClass: VehicleClass): boolean {
  return vehicleClass === 'electric-luxury-sedan'
}

// ==================== RIYADH ROUTES ====================
export const RIYADH_ONEWAY_ROUTES: TariffRoute[] = [
  { id: 'ruh-airport-city', pickup: 'RUH Airport', dropoff: 'Riyadh City' },
  { id: 'ruh-city-sanaiya', pickup: 'Riyadh City', dropoff: 'Sanaiya' },
  { id: 'ruh-city-sabic', pickup: 'Riyadh City', dropoff: 'SABIC Headquarters' },
  { id: 'ruh-city-diplomatic', pickup: 'Riyadh City', dropoff: 'Diplomatic City' },
  { id: 'ruh-city-kfh', pickup: 'Riyadh City', dropoff: 'King Fahad Hospital' },
  { id: 'ruh-city-itcity', pickup: 'Riyadh City', dropoff: 'IT City' },
  { id: 'ruh-city-palace', pickup: 'Riyadh City', dropoff: 'Kings Palace' },
  { id: 'ruh-city-boulevard', pickup: 'Riyadh City', dropoff: 'Riyadh Boulevard' },
  { id: 'ruh-city-ricec', pickup: 'Riyadh City', dropoff: 'RICEC' },
  { id: 'ruh-city-namar', pickup: 'Riyadh City', dropoff: 'Wadi Namar Water Fall' },
  { id: 'ruh-city-zoo', pickup: 'Riyadh City', dropoff: 'Riyadh Zoo (Malaz)' },
  { id: 'ruh-city-10km', pickup: 'Riyadh City', dropoff: '10 KM', isPerKm: true },
  { id: 'ruh-city-55-100km', pickup: 'Riyadh City', dropoff: '55 KM till 100 KM', isPerKm: true },
  { id: 'ruh-city-kapark', pickup: 'Riyadh City', dropoff: 'King Abdullah Park' },
  { id: 'ruh-city-hanifah', pickup: 'Riyadh City', dropoff: 'Wadi Hanifah' },
  { id: 'ruh-city-diriyah', pickup: 'Riyadh City', dropoff: 'Historic Diriyah' },
  { id: 'ruh-city-kafd', pickup: 'Riyadh City', dropoff: 'KAFD' },
  { id: 'ruh-dammam', pickup: 'Riyadh', dropoff: 'Dammam' },
]

export const RIYADH_HOURLY_ROUTES: TariffRoute[] = [
  { id: 'ruh-hourly-6-8', pickup: 'Riyadh', dropoff: '6-8 Hours (Day Rate)', isHourly: true },
  { id: 'ruh-extra-hour', pickup: 'Riyadh', dropoff: 'Extra Hour (After 8 Hours)', isExtraHour: true },
  { id: 'ruh-per-hour', pickup: 'Riyadh', dropoff: 'Per Hour Rate', isHourly: true },
]

// ==================== JEDDAH ROUTES ====================
export const JEDDAH_ONEWAY_ROUTES: TariffRoute[] = [
  { id: 'jed-city-kaaia', pickup: 'Jeddah City', dropoff: 'KAAIA Saudi Terminal' },
  { id: 'jed-city-indigo', pickup: 'Jeddah City', dropoff: 'Indigo Beach Resort' },
  { id: 'jed-indigo-roundtrip', pickup: 'Jeddah', dropoff: 'Round Trip Indigo Beach Resort' },
  { id: 'jed-airport-makkah', pickup: 'Jeddah Airport', dropoff: 'Makkah' },
  { id: 'jed-city-makkah', pickup: 'Jeddah City', dropoff: 'Makkah' },
  { id: 'jed-makkah-terminal', pickup: 'Makkah', dropoff: 'Jeddah (Intl Terminal)' },
  { id: 'jed-city-kaec', pickup: 'Jeddah City', dropoff: 'KAEC' },
  { id: 'jed-terminal-kaec', pickup: 'Jeddah (All Terminal)', dropoff: 'KAEC' },
  { id: 'jed-makkah-kaec', pickup: 'Makkah', dropoff: 'KAEC' },
  { id: 'jed-terminal-madinah', pickup: 'Jeddah (All Terminals)', dropoff: 'Madinah' },
  { id: 'jed-city-madinah', pickup: 'Jeddah City', dropoff: 'Madinah' },
  { id: 'jed-makkah-umrah', pickup: 'Jeddah', dropoff: 'Makkah Umrah' },
  { id: 'jed-pointab', pickup: 'Drop Off Point A', dropoff: 'Point B in Jeddah' },
  { id: 'jed-city-taif', pickup: 'Jeddah City', dropoff: 'Taif' },
  { id: 'jed-makkah-taif', pickup: 'Makkah', dropoff: 'Taif' },
  { id: 'jed-rabig', pickup: 'Jeddah', dropoff: 'Rabig' },
  { id: 'jed-yanbu', pickup: 'Jeddah', dropoff: 'Yanbu (Royal Commission)' },
]

export const JEDDAH_HOURLY_ROUTES: TariffRoute[] = [
  { id: 'jed-hourly-6-8', pickup: 'Jeddah', dropoff: '6-8 Hours (Day Rate)', isHourly: true },
  { id: 'jed-extra-hour', pickup: 'Jeddah', dropoff: 'Extra Hour (After 8 Hours)', isExtraHour: true },
  { id: 'jed-per-hour', pickup: 'Jeddah', dropoff: 'Per Hour Rate', isHourly: true },
]

// ==================== MAKKAH ROUTES (NEW) ====================
export const MAKKAH_ONEWAY_ROUTES: TariffRoute[] = [
  { id: 'mak-jeddah-city', pickup: 'Makkah', dropoff: 'Jeddah City' },
  { id: 'mak-jeddah-airport', pickup: 'Makkah', dropoff: 'Jeddah Airport' },
  { id: 'mak-madinah', pickup: 'Makkah', dropoff: 'Madinah' },
  { id: 'mak-kaec', pickup: 'Makkah', dropoff: 'KAEC' },
  { id: 'mak-taif', pickup: 'Makkah', dropoff: 'Taif' },
  { id: 'mak-abha', pickup: 'Makkah', dropoff: 'Abha City', isTBD: true },
  { id: 'mak-albaha', pickup: 'Makkah', dropoff: 'Al Baha City', isTBD: true },
  { id: 'mak-yanbu', pickup: 'Makkah', dropoff: 'Yanbu City', isTBD: true },
]

export const MAKKAH_HOURLY_ROUTES: TariffRoute[] = [
  { id: 'mak-hourly-6-8', pickup: 'Makkah', dropoff: '6-8 Hours (Day Rate)', isHourly: true },
  { id: 'mak-extra-hour', pickup: 'Makkah', dropoff: 'Extra Hour (After 8 Hours)', isExtraHour: true },
  { id: 'mak-per-hour', pickup: 'Makkah', dropoff: 'Per Hour Rate', isHourly: true },
]

// ==================== MADINAH ROUTES (NEW) ====================
export const MADINAH_ONEWAY_ROUTES: TariffRoute[] = [
  { id: 'mad-makkah', pickup: 'Madinah', dropoff: 'Makkah' },
  { id: 'mad-jeddah-airport', pickup: 'Madinah', dropoff: 'Jeddah Airport' },
  { id: 'mad-jeddah-city', pickup: 'Madinah', dropoff: 'Jeddah City' },
  { id: 'mad-yanbu', pickup: 'Madinah', dropoff: 'Yanbu City', isTBD: true },
  { id: 'mad-alula', pickup: 'Madinah', dropoff: 'Alula', isTBD: true },
  { id: 'mad-khyber', pickup: 'Madinah', dropoff: 'Khyber', isTBD: true },
]

export const MADINAH_HOURLY_ROUTES: TariffRoute[] = [
  { id: 'mad-hourly-6-8', pickup: 'Madinah', dropoff: '6-8 Hours (Day Rate)', isHourly: true },
  { id: 'mad-extra-hour', pickup: 'Madinah', dropoff: 'Extra Hour (After 8 Hours)', isExtraHour: true },
  { id: 'mad-per-hour', pickup: 'Madinah', dropoff: 'Per Hour Rate', isHourly: true },
]

// ==================== PRICING DATA ====================

// Helper function to generate prices for all vehicle classes
function generatePrices(routeId: string, economyPrice: number): TariffPrice[] {
  return [
    { routeId, vehicleClass: 'economy-sedan', price: economyPrice },
    { routeId, vehicleClass: 'business-sedan', price: Math.round(economyPrice * 1.35) },
    { routeId, vehicleClass: 'first-class', price: Math.round(economyPrice * 2.3) },
    { routeId, vehicleClass: 'business-suv', price: Math.round(economyPrice * 1.85) },
    { routeId, vehicleClass: 'hiace', price: Math.round(economyPrice * 2.7) },
    { routeId, vehicleClass: 'coaster', price: Math.round(economyPrice * 4) },
    { routeId, vehicleClass: 'kinglong', price: Math.round(economyPrice * 5.7) },
  ]
}

// Riyadh One-Way Prices
export const RIYADH_ONEWAY_PRICES: TariffPrice[] = [
  ...generatePrices('ruh-airport-city', 150),
  ...generatePrices('ruh-city-sanaiya', 120),
  ...generatePrices('ruh-city-sabic', 180),
  ...generatePrices('ruh-city-diplomatic', 130),
  ...generatePrices('ruh-city-kfh', 140),
  ...generatePrices('ruh-city-itcity', 160),
  ...generatePrices('ruh-city-palace', 150),
  ...generatePrices('ruh-city-boulevard', 110),
  ...generatePrices('ruh-city-ricec', 140),
  ...generatePrices('ruh-city-namar', 160),
  ...generatePrices('ruh-city-zoo', 130),
  ...generatePrices('ruh-city-10km', 80),
  ...generatePrices('ruh-city-55-100km', 350),
  ...generatePrices('ruh-city-kapark', 120),
  ...generatePrices('ruh-city-hanifah', 150),
  ...generatePrices('ruh-city-diriyah', 140),
  ...generatePrices('ruh-city-kafd', 100),
  ...generatePrices('ruh-dammam', 800),
]

// Riyadh Hourly Prices
export const RIYADH_HOURLY_PRICES: TariffPrice[] = [
  ...generatePrices('ruh-hourly-6-8', 600),
  ...generatePrices('ruh-extra-hour', 75),
  ...generatePrices('ruh-per-hour', 100),
]

// Jeddah One-Way Prices
export const JEDDAH_ONEWAY_PRICES: TariffPrice[] = [
  ...generatePrices('jed-city-kaaia', 180),
  ...generatePrices('jed-city-indigo', 350),
  ...generatePrices('jed-indigo-roundtrip', 600),
  ...generatePrices('jed-airport-makkah', 300),
  ...generatePrices('jed-city-makkah', 280),
  ...generatePrices('jed-makkah-terminal', 300),
  ...generatePrices('jed-city-kaec', 500),
  ...generatePrices('jed-terminal-kaec', 550),
  ...generatePrices('jed-makkah-kaec', 600),
  ...generatePrices('jed-terminal-madinah', 1200),
  ...generatePrices('jed-city-madinah', 1200),
  ...generatePrices('jed-makkah-umrah', 500),
  ...generatePrices('jed-pointab', 100),
  ...generatePrices('jed-city-taif', 600),
  ...generatePrices('jed-makkah-taif', 500),
  ...generatePrices('jed-rabig', 550),
  ...generatePrices('jed-yanbu', 900),
]

// Jeddah Hourly Prices
export const JEDDAH_HOURLY_PRICES: TariffPrice[] = [
  ...generatePrices('jed-hourly-6-8', 650),
  ...generatePrices('jed-extra-hour', 80),
  ...generatePrices('jed-per-hour', 110),
]

// Makkah One-Way Prices
export const MAKKAH_ONEWAY_PRICES: TariffPrice[] = [
  ...generatePrices('mak-jeddah-city', 280),
  ...generatePrices('mak-jeddah-airport', 300),
  ...generatePrices('mak-madinah', 900),
  ...generatePrices('mak-kaec', 600),
  ...generatePrices('mak-taif', 500),
  // TBD routes have no pricing yet
]

// Makkah Hourly Prices
export const MAKKAH_HOURLY_PRICES: TariffPrice[] = [
  ...generatePrices('mak-hourly-6-8', 650),
  ...generatePrices('mak-extra-hour', 80),
  ...generatePrices('mak-per-hour', 110),
]

// Madinah One-Way Prices
export const MADINAH_ONEWAY_PRICES: TariffPrice[] = [
  ...generatePrices('mad-makkah', 900),
  ...generatePrices('mad-jeddah-airport', 1200),
  ...generatePrices('mad-jeddah-city', 1200),
  // TBD routes have no pricing yet
]

// Madinah Hourly Prices
export const MADINAH_HOURLY_PRICES: TariffPrice[] = [
  ...generatePrices('mad-hourly-6-8', 700),
  ...generatePrices('mad-extra-hour', 85),
  ...generatePrices('mad-per-hour', 120),
]

// Riyadh Eco Fleet Prices (Electric Luxury Sedan priced at First Class level)
export const RIYADH_EV_PRICES: TariffPrice[] = [
  ...RIYADH_ONEWAY_ROUTES.map(route => {
    const firstClassPrice = RIYADH_ONEWAY_PRICES.find(p => p.routeId === route.id && p.vehicleClass === 'first-class')?.price || 350
    return { routeId: route.id, vehicleClass: 'electric-luxury-sedan' as VehicleClass, price: firstClassPrice }
  }),
  ...RIYADH_HOURLY_ROUTES.map(route => {
    const firstClassPrice = RIYADH_HOURLY_PRICES.find(p => p.routeId === route.id && p.vehicleClass === 'first-class')?.price || 1400
    return { routeId: route.id, vehicleClass: 'electric-luxury-sedan' as VehicleClass, price: firstClassPrice }
  }),
]

// ==================== DATA ACCESSORS ====================

export function getOnewayRoutes(city: City): TariffRoute[] {
  switch (city) {
    case 'riyadh': return RIYADH_ONEWAY_ROUTES
    case 'jeddah': return JEDDAH_ONEWAY_ROUTES
    case 'makkah': return MAKKAH_ONEWAY_ROUTES
    case 'madinah': return MADINAH_ONEWAY_ROUTES
  }
}

export function getHourlyRoutes(city: City): TariffRoute[] {
  switch (city) {
    case 'riyadh': return RIYADH_HOURLY_ROUTES
    case 'jeddah': return JEDDAH_HOURLY_ROUTES
    case 'makkah': return MAKKAH_HOURLY_ROUTES
    case 'madinah': return MADINAH_HOURLY_ROUTES
  }
}

export function getAllRoutes(city: City): TariffRoute[] {
  return [...getOnewayRoutes(city), ...getHourlyRoutes(city)]
}

// Get bookable routes (excludes TBD routes)
export function getBookableRoutes(city: City, routeType: RouteType): TariffRoute[] {
  const routes = routeType === 'oneway' ? getOnewayRoutes(city) : getHourlyRoutes(city)
  return routes.filter(r => !r.isTBD)
}

export function getOnewayPrices(city: City): TariffPrice[] {
  switch (city) {
    case 'riyadh': return RIYADH_ONEWAY_PRICES
    case 'jeddah': return JEDDAH_ONEWAY_PRICES
    case 'makkah': return MAKKAH_ONEWAY_PRICES
    case 'madinah': return MADINAH_ONEWAY_PRICES
  }
}

export function getHourlyPrices(city: City): TariffPrice[] {
  switch (city) {
    case 'riyadh': return RIYADH_HOURLY_PRICES
    case 'jeddah': return JEDDAH_HOURLY_PRICES
    case 'makkah': return MAKKAH_HOURLY_PRICES
    case 'madinah': return MADINAH_HOURLY_PRICES
  }
}

export function getEcoFleetPrices(city: City): TariffPrice[] {
  // Eco Fleet only available in Riyadh
  if (city === 'riyadh') return RIYADH_EV_PRICES
  return []
}

export function getPrice(city: City, routeId: string, vehicleClass: VehicleClass): number | null {
  // Check if eco vehicle
  if (vehicleClass === 'electric-luxury-sedan') {
    const evPrices = getEcoFleetPrices(city)
    const found = evPrices.find(p => p.routeId === routeId)
    return found?.price || null
  }
  
  // Check oneway prices first
  const onewayPrices = getOnewayPrices(city)
  let found = onewayPrices.find(p => p.routeId === routeId && p.vehicleClass === vehicleClass)
  if (found) return found.price
  
  // Check hourly prices
  const hourlyPrices = getHourlyPrices(city)
  found = hourlyPrices.find(p => p.routeId === routeId && p.vehicleClass === vehicleClass)
  return found?.price || null
}

export function getAllPricesForRoute(city: City, routeId: string): Record<VehicleClass, number | null> {
  const result: Partial<Record<VehicleClass, number | null>> = {}
  
  for (const vc of VEHICLE_CLASSES) {
    result[vc.id] = getPrice(city, routeId, vc.id)
  }
  
  return result as Record<VehicleClass, number | null>
}

// Check if city has Eco Fleet
export function cityHasEcoFleet(city: City): boolean {
  return city === 'riyadh'
}

// Check if route is an airport route (for flight number field)
export function isAirportRoute(route: TariffRoute): boolean {
  const airportKeywords = ['airport', 'terminal', 'ruh', 'kaaia']
  const text = `${route.pickup} ${route.dropoff}`.toLowerCase()
  return airportKeywords.some(kw => text.includes(kw))
}

// Calculate VAT breakdown (15% already included in prices)
export function calculateVATBreakdown(totalPrice: number): { baseFare: number; vat: number; total: number } {
  const baseFare = Math.round(totalPrice / 1.15)
  const vat = totalPrice - baseFare
  return { baseFare, vat, total: totalPrice }
}

// ==================== LEGACY EXPORTS (for backward compatibility) ====================

// Combined routes for backward compatibility
export const RIYADH_ROUTES = [...RIYADH_ONEWAY_ROUTES, ...RIYADH_HOURLY_ROUTES]
export const JEDDAH_ROUTES = [...JEDDAH_ONEWAY_ROUTES, ...JEDDAH_HOURLY_ROUTES]

// ==================== ADMIN CHANGE LOG ====================

export interface TariffChangeLog {
  id: string
  timestamp: string
  adminName: string
  city: City
  routeId: string
  vehicleClass: VehicleClass
  oldPrice: number
  newPrice: number
  routeLabel: string
}

export const TARIFF_CHANGE_LOGS: TariffChangeLog[] = [
  {
    id: 'log-001',
    timestamp: '2026-04-01T10:30:00Z',
    adminName: 'Super Admin',
    city: 'jeddah',
    routeId: 'jed-airport-makkah',
    vehicleClass: 'business-sedan',
    oldPrice: 380,
    newPrice: 400,
    routeLabel: 'Jeddah Airport to Makkah',
  },
  {
    id: 'log-002',
    timestamp: '2026-03-28T14:15:00Z',
    adminName: 'Super Admin',
    city: 'riyadh',
    routeId: 'ruh-dammam',
    vehicleClass: 'first-class',
    oldPrice: 1700,
    newPrice: 1800,
    routeLabel: 'Riyadh to Dammam',
  },
]
