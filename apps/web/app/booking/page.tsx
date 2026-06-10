'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, MapPin, Calendar, Clock, Users, Briefcase, Check, Info, Leaf, Zap, Wifi, Usb, Droplets, Sparkles, Armchair, Eye, Sun } from 'lucide-react'

// Amenity icon mapping
const amenityIcons: Record<string, React.ElementType> = {
  'WiFi': Wifi,
  'USB Charger': Usb,
  'Water': Droplets,
  'Tissue Box': Sparkles,
  'Leather Seats': Armchair,
  'Privacy Glass': Eye,
  'Massage Seats': Armchair,
  'Ambient Lighting': Sun,
}

const vehicles = [
  {
    id: 'economy-sedan',
    name: 'Economy Sedan',
    model: 'FORD TAURUS OR SIMILAR',
    image: '/images/fleet/economy-sedan.jpg',
    maxPassengers: 4,
    category: 'sedan',
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box'],
    pricePerKm: 2.5,
    basePrice: 100,
    description: 'Comfortable and reliable for everyday travel',
  },
  {
    id: 'business-sedan',
    name: 'Business Sedan',
    model: 'MERCEDES E-CLASS OR SIMILAR',
    image: '/images/fleet/business-sedan-desert.jpg',
    maxPassengers: 4,
    category: 'sedan',
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box', 'Leather Seats'],
    pricePerKm: 3.5,
    basePrice: 150,
    badge: 'Popular',
    description: 'Perfect for airport transfers and business meetings',
  },
  {
    id: 'business-suv',
    name: 'Business SUV',
    model: 'GMC YUKON OR SIMILAR',
    image: '/images/fleet/business-suv-desert.jpg',
    maxPassengers: 7,
    category: 'suv',
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box', 'Privacy Glass'],
    pricePerKm: 4.5,
    basePrice: 200,
    description: 'Ideal for families and group travel',
  },
  {
    id: 'first-class',
    name: 'First Class',
    model: 'ROLLS ROYCE OR SIMILAR',
    image: '/images/fleet/first-class-desert.jpg',
    maxPassengers: 4,
    category: 'sedan',
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box', 'Massage Seats', 'Ambient Lighting'],
    pricePerKm: 6,
    basePrice: 300,
    description: 'Ultimate luxury experience with premium amenities',
  },
  {
    id: 'electric',
    name: 'Electric',
    model: 'LUCID AIR OR SIMILAR',
    image: '/images/fleet/electric-sedan.jpg',
    maxPassengers: 4,
    category: 'sedan',
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box', 'Leather Seats'],
    pricePerKm: 3.5,
    basePrice: 180,
    badge: 'Eco-Friendly',
    description: 'Sustainable luxury with zero emissions',
    isElectric: true,
    availableCities: ['Riyadh'],
  },
]

const notes = [
  'All prices include professional chauffeur service',
  'Free waiting time: 60 min for airport, 15 min for other pickups',
  'Flight tracking included for airport transfers',
  'Meet & Greet service available at all airports',
  'Child seats available upon request (additional SAR 50)',
  '24/7 customer support available',
]

function BookingContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  
  const bookingType = searchParams.get('type') || 'oneway'
  const pickup = searchParams.get('pickup') || ''
  const dropoff = searchParams.get('dropoff') || ''
  const date = searchParams.get('date') || ''
  const time = searchParams.get('time') || ''
  const passengers = searchParams.get('passengers') || '1'
  const duration = searchParams.get('duration') || ''
  const flight = searchParams.get('flight') || ''

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  const handleSelectVehicle = (vehicleId: string) => {
    setSelectedVehicle(vehicleId)
    
    // Build new params with selected vehicle
    const params = new URLSearchParams(searchParams.toString())
    params.set('vehicle', vehicleId)
    
    // Navigate to passenger details page
    router.push(`/booking/details?${params.toString()}`)
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-[#0a0a0a]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Home</span>
          </Link>
          <Link href="/" className="text-2xl font-serif">
            <span className="text-white">Lux</span>
            <span className="text-[#C9A961]">Drive</span>
          </Link>
          <div className="w-24" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {['Vehicle', 'Details', 'Payment'].map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                index === 0 ? 'bg-[#C9A961] text-black' : 'bg-neutral-800 text-neutral-500'
              }`}>
                {index + 1}
              </div>
              <span className={index === 0 ? 'text-white' : 'text-neutral-500'}>{step}</span>
              {index < 2 && <div className={`w-12 h-0.5 ${index === 0 ? 'bg-[#C9A961]' : 'bg-neutral-800'}`} />}
            </div>
          ))}
        </div>

        {/* Booking Summary Card */}
        <div className="bg-[#141414] rounded-2xl border border-neutral-800 p-6 mb-8">
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-white mb-6">
            Select Your Vehicle
          </h1>
          
          {/* Trip Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-[#0a0a0a] rounded-xl">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[#C9A961] mt-0.5" />
              <div>
                <p className="text-neutral-500 text-xs uppercase tracking-wider">Pickup</p>
                <p className="text-white font-medium">{pickup || 'Not specified'}</p>
              </div>
            </div>
            
            {bookingType === 'oneway' && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#C9A961] mt-0.5" />
                <div>
                  <p className="text-neutral-500 text-xs uppercase tracking-wider">Drop-off</p>
                  <p className="text-white font-medium">{dropoff || 'Not specified'}</p>
                </div>
              </div>
            )}
            
            {bookingType === 'hourly' && (
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-[#C9A961] mt-0.5" />
                <div>
                  <p className="text-neutral-500 text-xs uppercase tracking-wider">Duration</p>
                  <p className="text-white font-medium">{duration || 'Not specified'}</p>
                </div>
              </div>
            )}
            
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-[#C9A961] mt-0.5" />
              <div>
                <p className="text-neutral-500 text-xs uppercase tracking-wider">Date & Time</p>
                <p className="text-white font-medium">{formatDate(date)}</p>
                <p className="text-neutral-400 text-sm">{time}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-[#C9A961] mt-0.5" />
              <div>
                <p className="text-neutral-500 text-xs uppercase tracking-wider">Passengers</p>
                <p className="text-white font-medium">{passengers} {parseInt(passengers) === 1 ? 'Passenger' : 'Passengers'}</p>
              </div>
            </div>
          </div>
          
          {flight && (
            <div className="mt-4 p-3 bg-[#C9A961]/10 border border-[#C9A961]/30 rounded-lg">
              <p className="text-[#C9A961] text-sm">
                Flight tracking enabled for: <span className="font-semibold">{flight}</span>
              </p>
            </div>
          )}
        </div>

        {/* Vehicle Selection - Clean Grid Layout */}
        <div className="mb-8">
          <h2 className="text-xl md:text-2xl font-serif font-bold text-white mb-6">
            Choose Your Vehicle
          </h2>
          
          {/* Responsive Grid - 1 col mobile, 2 cols tablet, 3 cols desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {vehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                onClick={() => handleSelectVehicle(vehicle.id)}
                className={`group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 ${
                  vehicle.isElectric 
                    ? 'border-2 border-green-500/40 hover:border-green-400 hover:shadow-[0_0_30px_rgba(34,197,94,0.15)]'
                    : 'border border-neutral-800 hover:border-[#C9A961]/50 hover:shadow-[0_0_30px_rgba(201,169,97,0.1)]'
                }`}
              >
                {/* Image Section */}
                <div className="relative h-44 overflow-hidden bg-neutral-900">
                  <Image
                    src={vehicle.image}
                    alt={vehicle.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
                  
                  {/* Badge */}
                  {vehicle.badge && (
                    <div className={`absolute top-3 left-3 px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 ${
                      vehicle.isElectric ? 'bg-green-500 text-white' : 'bg-[#C9A961] text-black'
                    }`}>
                      {vehicle.isElectric && <Zap className="w-3 h-3" />}
                      {vehicle.badge}
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="p-4 bg-[#141414]">
                  {/* Model */}
                  <p className={`text-[10px] font-semibold tracking-wider mb-1 ${vehicle.isElectric ? 'text-green-400' : 'text-[#C9A961]'}`}>
                    {vehicle.model}
                  </p>
                  
                  {/* Name */}
                  <h3 className="text-white text-lg font-serif font-bold mb-2">{vehicle.name}</h3>
                  
                  {/* Specs */}
                  <div className="flex items-center gap-4 mb-3 text-sm text-neutral-400">
                    <span className="flex items-center gap-1.5">
                      <Users className={`w-4 h-4 ${vehicle.isElectric ? 'text-green-400' : 'text-[#C9A961]'}`} />
                      {vehicle.maxPassengers}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Briefcase className={`w-4 h-4 ${vehicle.isElectric ? 'text-green-400' : 'text-[#C9A961]'}`} />
                      {vehicle.maxPassengers}
                    </span>
                  </div>
                  
                  {/* Electric Notice */}
                  {vehicle.isElectric && vehicle.availableCities && (
                    <p className="text-[11px] text-green-400 mb-3 flex items-center gap-1">
                      <Leaf className="w-3 h-3" />
                      Available in {vehicle.availableCities.join(', ')} only
                    </p>
                  )}
                  
                  {/* All Amenities with Icons */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {vehicle.amenities.map((amenity) => {
                      const IconComponent = amenityIcons[amenity] || Sparkles
                      return (
                        <span 
                          key={amenity} 
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] ${
                            vehicle.isElectric 
                              ? 'bg-green-500/10 text-green-400' 
                              : 'bg-[#C9A961]/10 text-[#C9A961]'
                          }`}
                        >
                          <IconComponent className="w-3 h-3" />
                          {amenity}
                        </span>
                      )
                    })}
                  </div>
                  
                  {/* Button */}
                  <button className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                    vehicle.isElectric
                      ? 'bg-green-500 text-white hover:bg-green-400'
                      : 'bg-[#C9A961] text-black hover:bg-[#d4b872]'
                  }`}>
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes Section */}
        <div className="bg-[#141414] rounded-2xl border border-neutral-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-5 h-5 text-[#C9A961]" />
            <h3 className="text-lg font-semibold text-white">Important Notes</h3>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {notes.map((note, index) => (
              <li key={index} className="flex items-start gap-2 text-neutral-400 text-sm">
                <Check className="w-4 h-4 text-[#C9A961] mt-0.5 shrink-0" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}

export default function BookingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#C9A961]">Loading...</div>
      </div>
    }>
      <BookingContent />
    </Suspense>
  )
}
