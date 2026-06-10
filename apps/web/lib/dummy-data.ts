// Dummy Data for LuxDrive

// Customer Data
export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  totalBookings: number
  totalSpent: number
  joinedDate: string
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum'
  points: number
  upcomingTrips: number
  lastTripDate: string | null
  status: 'active' | 'inactive'
}

export const CUSTOMERS: Customer[] = [
  { id: 'c1', name: 'Ahmed Al-Rashid', email: 'ahmed@email.com', phone: '+966501234567', totalBookings: 12, totalSpent: 4500, joinedDate: '2024-01-15', tier: 'Gold', points: 4500, upcomingTrips: 2, lastTripDate: '2026-04-10', status: 'active' },
  { id: 'c2', name: 'Fatima Hassan', email: 'fatima@email.com', phone: '+966512345678', totalBookings: 8, totalSpent: 3200, joinedDate: '2024-02-20', tier: 'Silver', points: 3200, upcomingTrips: 1, lastTripDate: '2026-04-08', status: 'active' },
  { id: 'c3', name: 'Omar Khalid', email: 'omar@email.com', phone: '+966523456789', totalBookings: 15, totalSpent: 6800, joinedDate: '2023-11-10', tier: 'Gold', points: 6800, upcomingTrips: 0, lastTripDate: '2026-03-20', status: 'active' },
  { id: 'c4', name: 'Sara Mohammed', email: 'sara@email.com', phone: '+966534567890', totalBookings: 5, totalSpent: 1800, joinedDate: '2024-03-05', tier: 'Bronze', points: 1800, upcomingTrips: 1, lastTripDate: '2026-03-15', status: 'active' },
  { id: 'c5', name: 'Yusuf Ali', email: 'yusuf@email.com', phone: '+966545678901', totalBookings: 20, totalSpent: 9500, joinedDate: '2023-08-22', tier: 'Platinum', points: 9500, upcomingTrips: 3, lastTripDate: '2026-04-12', status: 'active' },
  { id: 'c6', name: 'Layla Ibrahim', email: 'layla@email.com', phone: '+966556789012', totalBookings: 3, totalSpent: 950, joinedDate: '2025-06-10', tier: 'Bronze', points: 950, upcomingTrips: 0, lastTripDate: '2025-12-05', status: 'inactive' },
  { id: 'c7', name: 'Khalid Nasser', email: 'khalid.n@email.com', phone: '+966567890123', totalBookings: 25, totalSpent: 12500, joinedDate: '2023-05-15', tier: 'Platinum', points: 12500, upcomingTrips: 1, lastTripDate: '2026-04-14', status: 'active' },
  { id: 'c8', name: 'Nora Al-Faisal', email: 'nora@email.com', phone: '+966578901234', totalBookings: 7, totalSpent: 2800, joinedDate: '2024-08-20', tier: 'Silver', points: 2800, upcomingTrips: 0, lastTripDate: '2026-02-28', status: 'active' },
]

// Booking Data
export type BookingStatus = 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'pending'
export type BookingType = 'oneway' | 'hourly'
export type VehicleType = 'economy-sedan' | 'sedan' | 'suv' | 'first-class' | 'sprinter'
export type BookingSource = 'direct' | 'partner'

export type VendorAssignmentStatus = 'pending_assignment' | 'awaiting_vendor' | 'vendor_accepted' | 'vendor_rejected' | 'all_rejected'

export interface Booking {
  id: string
  customerId: string
  customerName: string
  type: BookingType
  status: BookingStatus
  pickup: string
  dropoff: string
  date: string
  time: string
  vehicle: VehicleType
  driverId?: string
  driverName?: string
  passengers: number
  price: number
  createdAt: string
  source: BookingSource
  partnerId?: string
  partnerName?: string
  // Vendor assignment fields
  vendorId?: string
  vendorName?: string
  vendorAssignmentStatus?: VendorAssignmentStatus
  rejectedVendorIds?: string[]
  rejectionReason?: string
  assignedAt?: string
  vehiclePlate?: string
}

// Partner Data
export type PartnerStatus = 'active' | 'pending' | 'expired'

export interface Partner {
  id: string
  company: string
  crNumber: string
  contactPerson: string
  email: string
  phone: string
  address: string
  contractStatus: PartnerStatus
  contractExpiry: string
  creditLimit: number
  currentSpend: number
  activeBookings: number
  monthlyRides: number
  createdAt: string
}

export const PARTNERS: Partner[] = [
  {
    id: 'partner-001',
    company: 'Acme Corporation',
    crNumber: 'CR-1234567890',
    contactPerson: 'Ahmed Al-Rashid',
    email: 'ahmed@acmecorp.sa',
    phone: '+966 50 123 4567',
    address: 'King Fahd Road, Riyadh 12345, Saudi Arabia',
    contractStatus: 'active',
    contractExpiry: '2027-03-15',
    creditLimit: 50000,
    currentSpend: 12500,
    activeBookings: 5,
    monthlyRides: 23,
    createdAt: '2025-01-10',
  },
  {
    id: 'partner-002',
    company: 'Saudi Tech Corp',
    crNumber: 'CR-9876543210',
    contactPerson: 'Nasser Al-Qahtani',
    email: 'nasser@sauditech.com',
    phone: '+966 55 987 6543',
    address: 'KAFD, Riyadh, Saudi Arabia',
    contractStatus: 'active',
    contractExpiry: '2026-12-31',
    creditLimit: 75000,
    currentSpend: 34200,
    activeBookings: 8,
    monthlyRides: 45,
    createdAt: '2024-06-15',
  },
  {
    id: 'partner-003',
    company: 'Gulf Hotels Group',
    crNumber: 'CR-5555555555',
    contactPerson: 'Khaled Mansour',
    email: 'khaled@gulfhotels.com',
    phone: '+966 50 555 5555',
    address: 'Jeddah Corniche, Jeddah, Saudi Arabia',
    contractStatus: 'pending',
    contractExpiry: '2026-06-30',
    creditLimit: 100000,
    currentSpend: 0,
    activeBookings: 0,
    monthlyRides: 0,
    createdAt: '2026-03-20',
  },
]

export const BOOKINGS: Booking[] = [
{
  id: 'BK-001',
  customerId: 'c1',
  customerName: 'Ahmed Al-Rashid',
  type: 'oneway',
  status: 'confirmed',
  pickup: 'JED Airport Terminal 1',
  dropoff: 'Makkah, Al Aziziyah',
  date: '2026-03-28',
  time: '14:00',
  vehicle: 'sedan',
  driverId: 'd1',
  driverName: 'Mohammed',
  passengers: 2,
  price: 350,
  createdAt: '2026-03-25',
  source: 'direct',
  vendorId: 'vendor-1',
  vendorName: 'Saudi Limo Services',
  vendorAssignmentStatus: 'vendor_accepted',
  vehiclePlate: 'ABC 1234',
  },
{
  id: 'BK-002',
  customerId: 'c2',
  customerName: 'Fatima Hassan',
  type: 'oneway',
  status: 'in-progress',
  pickup: 'RUH Airport',
  dropoff: 'KAFD, Riyadh',
  date: '2026-03-26',
  time: '10:30',
  vehicle: 'suv',
  driverId: 'd2',
  driverName: 'Abdullah',
  passengers: 4,
  price: 450,
  createdAt: '2026-03-24',
  source: 'direct',
  vendorId: 'vendor-3',
  vendorName: 'Elite Transport',
  vendorAssignmentStatus: 'vendor_accepted',
  vehiclePlate: 'DEF 2234',
  },
  {
    id: 'BK-003',
    customerId: 'c3',
    customerName: 'Omar Khalid',
    type: 'hourly',
    status: 'completed',
    pickup: 'Madinah, Al Haram',
    dropoff: 'Madinah City Tour',
    date: '2026-03-20',
    time: '09:00',
    vehicle: 'first-class',
    driverId: 'd3',
    driverName: 'Khalid',
    passengers: 3,
    price: 750,
    createdAt: '2026-03-18',
    source: 'direct',
  },
  {
    id: 'BK-004',
    customerId: 'c4',
    customerName: 'Sara Mohammed',
    type: 'oneway',
    status: 'pending',
    pickup: 'Jeddah Corniche',
    dropoff: 'King Abdulaziz Airport',
    date: '2026-03-22',
    time: '06:00',
    vehicle: 'sedan',
    passengers: 1,
    price: 200,
    createdAt: '2026-03-19',
    source: 'direct',
    vendorAssignmentStatus: 'vendor_rejected',
    rejectedVendorIds: ['vendor-1'],
    rejectionReason: 'No available drivers for this time slot',
  },
  {
    id: 'BK-005',
    customerId: 'c5',
    customerName: 'Yusuf Ali',
    type: 'oneway',
    status: 'confirmed',
    pickup: 'Madinah Airport',
    dropoff: 'Makkah, Ajyad',
    date: '2026-03-29',
    time: '16:00',
    vehicle: 'sprinter',
    driverId: 'd4',
    driverName: 'Faisal',
    passengers: 10,
    price: 1200,
    createdAt: '2026-03-25',
    source: 'direct',
  },
  {
    id: 'BK-006',
    customerId: 'c1',
    customerName: 'Ahmed Al-Rashid',
    type: 'hourly',
    status: 'completed',
    pickup: 'Riyadh, Al Olaya',
    dropoff: 'Business Meetings',
    date: '2026-03-15',
    time: '08:00',
    vehicle: 'first-class',
    driverId: 'd5',
    driverName: 'Tariq',
    passengers: 2,
    price: 900,
    createdAt: '2026-03-12',
    source: 'direct',
  },
  {
    id: 'BK-007',
    customerId: 'c2',
    customerName: 'Fatima Hassan',
    type: 'oneway',
    status: 'confirmed',
    pickup: 'JED Airport Terminal 2',
    dropoff: 'Jeddah, Al Hamra',
    date: '2026-03-30',
    time: '20:00',
    vehicle: 'suv',
    passengers: 5,
    price: 280,
    createdAt: '2026-03-26',
    source: 'direct',
  },
  {
    id: 'BK-008',
    customerId: 'c3',
    customerName: 'Omar Khalid',
    type: 'oneway',
    status: 'completed',
    pickup: 'Makkah, Aziziyah',
    dropoff: 'Madinah, Al Haram',
    date: '2026-03-10',
    time: '05:00',
    vehicle: 'sedan',
    driverId: 'd6',
    driverName: 'Hamza',
    passengers: 2,
    price: 550,
    createdAt: '2026-03-08',
    source: 'direct',
  },
  // Partner Bookings
  {
    id: 'ACM-202604-001',
    customerId: 'partner-c1',
    customerName: 'John Smith',
    type: 'oneway',
    status: 'confirmed',
    pickup: 'King Khalid Airport',
    dropoff: 'Ritz Carlton Riyadh',
    date: '2026-04-10',
    time: '14:00',
    vehicle: 'sedan',
    passengers: 1,
    price: 450,
    createdAt: '2026-04-05',
    source: 'partner',
    partnerId: 'partner-001',
    partnerName: 'Acme Corporation',
  },
  {
    id: 'ACM-202604-002',
    customerId: 'partner-c2',
    customerName: 'Sarah Johnson',
    type: 'oneway',
    status: 'confirmed',
    pickup: 'Four Seasons Riyadh',
    dropoff: 'KAFD',
    date: '2026-04-10',
    time: '09:30',
    vehicle: 'first-class',
    passengers: 2,
    price: 650,
    createdAt: '2026-04-06',
    source: 'partner',
    partnerId: 'partner-001',
    partnerName: 'Acme Corporation',
  },
  {
    id: 'STC-202604-001',
    customerId: 'partner-c3',
    customerName: 'Mike Davis',
    type: 'oneway',
    status: 'in-progress',
    pickup: 'Olaya Street',
    dropoff: 'King Khalid Airport',
    date: '2026-04-08',
    time: '16:00',
    vehicle: 'suv',
    driverId: 'd2',
    driverName: 'Abdullah',
    passengers: 3,
    price: 550,
    createdAt: '2026-04-04',
    source: 'partner',
    partnerId: 'partner-002',
    partnerName: 'Saudi Tech Corp',
  },
  {
    id: 'STC-202604-002',
    customerId: 'partner-c4',
    customerName: 'Emma Wilson',
    type: 'oneway',
    status: 'pending',
    pickup: 'Diplomatic Quarter',
    dropoff: 'Al Faisaliah Tower',
    date: '2026-04-09',
    time: '11:00',
    vehicle: 'sedan',
    passengers: 1,
    price: 380,
    createdAt: '2026-04-07',
    source: 'partner',
    partnerId: 'partner-002',
    partnerName: 'Saudi Tech Corp',
  },
]

// Driver Data
export type DriverStatus = 'available' | 'on-trip' | 'offline'

export interface Driver {
  id: string
  name: string
  phone: string
  status: DriverStatus
  vehicleId: string
  rating: number
  totalTrips: number
  joinedDate: string
  company: string
}

export const DRIVERS: Driver[] = [
  {
    id: 'd1',
    name: 'Mohammed Al-Fahad',
    phone: '+966551234567',
    status: 'available',
    vehicleId: 'v1',
    rating: 4.9,
    totalTrips: 245,
    joinedDate: '2023-01-15',
    company: 'LuxDrive Direct',
  },
  {
    id: 'd2',
    name: 'Abdullah Hassan',
    phone: '+966552234567',
    status: 'on-trip',
    vehicleId: 'v5',
    rating: 4.8,
    totalTrips: 198,
    joinedDate: '2023-03-20',
    company: 'Al-Safar Transport',
  },
  {
    id: 'd3',
    name: 'Khalid Omar',
    phone: '+966553234567',
    status: 'available',
    vehicleId: 'v9',
    rating: 4.7,
    totalTrips: 312,
    joinedDate: '2022-11-10',
    company: 'LuxDrive Direct',
  },
  {
    id: 'd4',
    name: 'Faisal Ibrahim',
    phone: '+966554234567',
    status: 'on-trip',
    vehicleId: 'v11',
    rating: 4.9,
    totalTrips: 156,
    joinedDate: '2023-06-05',
    company: 'Royal Fleet Services',
  },
  {
    id: 'd5',
    name: 'Tariq Ahmed',
    phone: '+966555234567',
    status: 'offline',
    vehicleId: 'v10',
    rating: 4.6,
    totalTrips: 89,
    joinedDate: '2024-01-22',
    company: 'LuxDrive Direct',
  },
  {
    id: 'd6',
    name: 'Hamza Yusuf',
    phone: '+966556234567',
    status: 'available',
    vehicleId: 'v2',
    rating: 4.8,
    totalTrips: 276,
    joinedDate: '2023-02-18',
    company: 'Al-Safar Transport',
  },
]

// Fleet/Vehicle Data
export type FleetStatus = 'available' | 'on-trip' | 'maintenance'

export interface Vehicle {
  id: string
  type: VehicleType
  model: string
  plateNumber: string
  status: FleetStatus
  driverId?: string
  lastService: string
  mileage: number
}

export const FLEET: Vehicle[] = [
  // Economy Sedans (Ford Taurus) - Max 4 passengers
  { id: 'v0a', type: 'economy-sedan', model: 'Ford Taurus 2024', plateNumber: 'ECO 1001', status: 'available', lastService: '2026-02-10', mileage: 25000 },
  { id: 'v0b', type: 'economy-sedan', model: 'Ford Taurus 2024', plateNumber: 'ECO 1002', status: 'available', lastService: '2026-02-18', mileage: 22000 },
  { id: 'v0c', type: 'economy-sedan', model: 'Ford Taurus 2023', plateNumber: 'ECO 1003', status: 'on-trip', lastService: '2026-01-15', mileage: 45000 },
  // Business Sedans (Mercedes E-Class) - Max 4 passengers
  { id: 'v1', type: 'sedan', model: 'Mercedes E-Class 2024', plateNumber: 'ABC 1234', status: 'available', driverId: 'd1', lastService: '2026-02-15', mileage: 45000 },
  { id: 'v2', type: 'sedan', model: 'Mercedes E-Class 2024', plateNumber: 'ABC 1235', status: 'available', driverId: 'd6', lastService: '2026-02-20', mileage: 38000 },
  { id: 'v3', type: 'sedan', model: 'Mercedes E-Class 2023', plateNumber: 'ABC 1236', status: 'on-trip', lastService: '2026-01-10', mileage: 62000 },
  { id: 'v4', type: 'sedan', model: 'Mercedes E-Class 2023', plateNumber: 'ABC 1237', status: 'maintenance', lastService: '2026-03-01', mileage: 75000 },
  // SUVs (GMC Yukon) - Max 7 passengers
  { id: 'v5', type: 'suv', model: 'GMC Yukon 2024', plateNumber: 'DEF 2234', status: 'on-trip', driverId: 'd2', lastService: '2026-02-25', mileage: 32000 },
  { id: 'v6', type: 'suv', model: 'GMC Yukon 2024', plateNumber: 'DEF 2235', status: 'available', lastService: '2026-03-05', mileage: 28000 },
  { id: 'v7', type: 'suv', model: 'GMC Yukon 2023', plateNumber: 'DEF 2236', status: 'available', lastService: '2026-01-20', mileage: 55000 },
  { id: 'v8', type: 'suv', model: 'GMC Yukon 2023', plateNumber: 'DEF 2237', status: 'maintenance', lastService: '2026-02-28', mileage: 68000 },
  // First Class (Rolls Royce) - Max 4 passengers
  { id: 'v9', type: 'first-class', model: 'Rolls Royce Phantom 2024', plateNumber: 'GHI 3234', status: 'available', driverId: 'd3', lastService: '2026-03-10', mileage: 22000 },
  { id: 'v10', type: 'first-class', model: 'Rolls Royce Ghost 2024', plateNumber: 'GHI 3235', status: 'available', driverId: 'd5', lastService: '2026-03-08', mileage: 18000 },
  // Electric (Lucid Air) - Max 4 passengers
  { id: 'v13', type: 'electric', model: 'Lucid Air 2024', plateNumber: 'EV 1001', status: 'available', lastService: '2026-03-15', mileage: 8000 },
  { id: 'v14', type: 'electric', model: 'Lucid Air 2024', plateNumber: 'EV 1002', status: 'available', lastService: '2026-03-12', mileage: 12000 },
  // Sprinters
  { id: 'v11', type: 'sprinter', model: 'Mercedes Sprinter VIP 2024', plateNumber: 'JKL 4234', status: 'on-trip', driverId: 'd4', lastService: '2026-02-10', mileage: 41000 },
  { id: 'v12', type: 'sprinter', model: 'Mercedes Sprinter VIP 2023', plateNumber: 'JKL 4235', status: 'available', lastService: '2026-01-25', mileage: 58000 },
]

// Vendor Data
export type VendorStatus = 'approved' | 'pending' | 'rejected'

export interface Vendor {
  id: string
  company: string
  crNumber: string
  vatNumber: string
  contactPerson: string
  email: string
  phone: string
  status: VendorStatus
  registeredAt: string
  vehicles: number
  drivers: number
  activeBookings: number
  completedBookings: number
  earnings: number
}

export const VENDORS: Vendor[] = [
  {
    id: 'vendor-1',
    company: 'Saudi Limo Services',
    crNumber: 'CR-9876543210',
    vatNumber: '300098765400003',
    contactPerson: 'Khalid Al-Fahad',
    email: 'info@saudilimo.sa',
    phone: '+966 55 987 6543',
    status: 'approved',
    registeredAt: '2025-11-20',
    vehicles: 8,
    drivers: 12,
    activeBookings: 5,
    completedBookings: 156,
    earnings: 145200,
  },
  {
    id: 'vendor-2',
    company: 'Royal Fleet Company',
    crNumber: 'CR-1234509876',
    vatNumber: '300012345699997',
    contactPerson: 'Ahmed Al-Mansour',
    email: 'fleet@royalfleet.sa',
    phone: '+966 54 123 4567',
    status: 'pending',
    registeredAt: '2026-04-10',
    vehicles: 5,
    drivers: 7,
    activeBookings: 0,
    completedBookings: 0,
    earnings: 0,
  },
  {
    id: 'vendor-3',
    company: 'Elite Transport',
    crNumber: 'CR-5678901234',
    vatNumber: '300056789012347',
    contactPerson: 'Mohammed Al-Zahrani',
    email: 'contact@elitetransport.sa',
    phone: '+966 56 789 0123',
    status: 'approved',
    registeredAt: '2025-09-15',
    vehicles: 12,
    drivers: 15,
    activeBookings: 8,
    completedBookings: 234,
    earnings: 215600,
  },
  {
    id: 'vendor-4',
    company: 'Premium Cars KSA',
    crNumber: 'CR-9012345678',
    vatNumber: '300090123456780',
    contactPerson: 'Omar Al-Ghamdi',
    email: 'info@premiumcars.sa',
    phone: '+966 55 012 3456',
    status: 'approved',
    registeredAt: '2025-08-01',
    vehicles: 6,
    drivers: 8,
    activeBookings: 3,
    completedBookings: 89,
    earnings: 78500,
  },
]

// Pricing Configuration
export interface PricingTier {
  minKm: number
  maxKm: number | null
  basePrice?: number
  perKm?: number
}

export interface VehiclePricing {
  type: VehicleType
  tiers: PricingTier[]
}

export const PRICING: VehiclePricing[] = [
  {
    type: 'economy-sedan',
    tiers: [
      { minKm: 1, maxKm: 50, basePrice: 100 },
      { minKm: 51, maxKm: 200, perKm: 2.0 },
      { minKm: 201, maxKm: null, perKm: 1.5 },
    ],
  },
  {
    type: 'sedan',
    tiers: [
      { minKm: 1, maxKm: 50, basePrice: 180 },
      { minKm: 51, maxKm: 200, perKm: 3.5 },
      { minKm: 201, maxKm: null, perKm: 3 },
    ],
  },
  {
    type: 'suv',
    tiers: [
      { minKm: 1, maxKm: 50, basePrice: 250 },
      { minKm: 51, maxKm: 200, perKm: 4.5 },
      { minKm: 201, maxKm: null, perKm: 4 },
    ],
  },
  {
    type: 'first-class',
    tiers: [
      { minKm: 1, maxKm: 50, basePrice: 400 },
      { minKm: 51, maxKm: 200, perKm: 6 },
      { minKm: 201, maxKm: null, perKm: 5.5 },
    ],
  },
  {
    type: 'sprinter',
    tiers: [
      { minKm: 1, maxKm: 50, basePrice: 550 },
      { minKm: 51, maxKm: 200, perKm: 8 },
      { minKm: 201, maxKm: null, perKm: 7 },
    ],
  },
]

export const VAT_RATE = 0.15

export const ADDITIONAL_SERVICES = {
  childSeat: 50,
  extraStop: 75,
}

// Sales Leads
export type LeadStatus = 'new' | 'contacted' | 'follow-up' | 'converted' | 'lost'

export interface Lead {
  id: string
  name: string
  company?: string
  email: string
  phone: string
  status: LeadStatus
  source: string
  notes: string[]
  createdAt: string
  lastContact?: string
  estimatedValue: number
}

export const LEADS: Lead[] = [
  {
    id: 'l1',
    name: 'Nasser Al-Qahtani',
    company: 'Saudi Tech Corp',
    email: 'nasser@sauditech.com',
    phone: '+966561234567',
    status: 'new',
    source: 'Website',
    notes: ['Interested in corporate package for 20 employees'],
    createdAt: '2026-03-25',
    estimatedValue: 50000,
  },
  {
    id: 'l2',
    name: 'Layla Ibrahim',
    company: 'Riyadh Events',
    email: 'layla@riyadhevents.sa',
    phone: '+966562234567',
    status: 'contacted',
    source: 'Referral',
    notes: ['Wedding transportation', 'Called on March 24, interested in Sprinter fleet'],
    createdAt: '2026-03-22',
    lastContact: '2026-03-24',
    estimatedValue: 15000,
  },
  {
    id: 'l3',
    name: 'Khaled Mansour',
    company: 'Gulf Hotels',
    email: 'khaled@gulfhotels.com',
    phone: '+966563234567',
    status: 'follow-up',
    source: 'Trade Show',
    notes: ['Hotel guest transportation', 'Meeting scheduled for March 30'],
    createdAt: '2026-03-15',
    lastContact: '2026-03-23',
    estimatedValue: 120000,
  },
  {
    id: 'l4',
    name: 'Reem Abdullah',
    email: 'reem@email.com',
    phone: '+966564234567',
    status: 'converted',
    source: 'Social Media',
    notes: ['VIP airport transfers', 'Signed monthly contract'],
    createdAt: '2026-03-01',
    lastContact: '2026-03-20',
    estimatedValue: 8000,
  },
  {
    id: 'l5',
    name: 'Fahad Al-Otaibi',
    company: 'Jeddah Imports',
    email: 'fahad@jeddahimports.sa',
    phone: '+966565234567',
    status: 'lost',
    source: 'Cold Call',
    notes: ['Executive transportation', 'Went with competitor - price sensitive'],
    createdAt: '2026-02-15',
    lastContact: '2026-03-10',
    estimatedValue: 25000,
  },
]

// Helper functions
export function getBookingsByCustomerId(customerId: string): Booking[] {
  return BOOKINGS.filter((b) => b.customerId === customerId)
}

export function getBookingsByStatus(status: BookingStatus): Booking[] {
  return BOOKINGS.filter((b) => b.status === status)
}

export function getDriverById(driverId: string): Driver | undefined {
  return DRIVERS.find((d) => d.id === driverId)
}

export function getVehicleById(vehicleId: string): Vehicle | undefined {
  return FLEET.find((v) => v.id === vehicleId)
}

export function getAvailableDrivers(): Driver[] {
  return DRIVERS.filter((d) => d.status === 'available')
}

export function getAvailableVehicles(type?: VehicleType): Vehicle[] {
  return FLEET.filter((v) => v.status === 'available' && (!type || v.type === type))
}

export function calculatePrice(vehicleType: VehicleType, distanceKm: number): number {
  const pricing = PRICING.find((p) => p.type === vehicleType)
  if (!pricing) return 0

  let totalPrice = 0
  let remainingKm = distanceKm

  for (const tier of pricing.tiers) {
    if (remainingKm <= 0) break

    if (tier.basePrice && distanceKm <= (tier.maxKm || Infinity)) {
      totalPrice = tier.basePrice
      break
    }

    if (tier.perKm) {
      const tierKm = tier.maxKm ? Math.min(remainingKm, tier.maxKm - tier.minKm + 1) : remainingKm
      totalPrice += tierKm * tier.perKm
      remainingKm -= tierKm
    }
  }

  return totalPrice
}
