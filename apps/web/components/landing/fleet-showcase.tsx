'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Users, Briefcase, Wifi, Usb, Droplets, Shield, Baby, Sparkles, Headphones, Car, Armchair, Sun, Eye, Leaf, Zap } from 'lucide-react'

const categories = ['All', 'Economy', 'Business', 'First Class', 'Electric']

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
    className: 'Economy Sedan',
    model: 'Ford Taurus or Similar',
    category: 'Economy',
    tagline: 'Reliable comfort for everyday travel',
    image: '/images/fleet/economy-sedan.jpg',
    specs: {
      passengers: 4,
      luggage: 4,
    },
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box'],
    priceFrom: 200,
  },
  {
    id: 'business-sedan',
    className: 'Business Sedan',
    model: 'Mercedes E-Class or Similar',
    category: 'Business',
    tagline: 'Ideal for airport transfers & business meetings',
    image: '/images/fleet/business-sedan-desert.jpg',
    specs: {
      passengers: 4,
      luggage: 4,
    },
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box', 'Leather Seats'],
    priceFrom: 350,
    badge: 'Popular',
  },
  {
    id: 'business-suv',
    className: 'Business SUV',
    model: 'GMC Yukon or Similar',
    category: 'Business',
    tagline: 'Perfect for families & group travel',
    image: '/images/fleet/business-suv-desert.jpg',
    specs: {
      passengers: 7,
      luggage: 7,
    },
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box', 'Privacy Glass'],
    priceFrom: 450,
  },
  {
    id: 'first-class',
    className: 'First Class',
    model: 'Rolls Royce or Similar',
    category: 'First Class',
    tagline: 'The ultimate in luxury travel',
    image: '/images/fleet/first-class-desert.jpg',
    specs: {
      passengers: 4,
      luggage: 4,
    },
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box', 'Massage Seats', 'Ambient Lighting'],
    priceFrom: 750,
  },
  {
    id: 'electric',
    className: 'Electric',
    model: 'Lucid Air or Similar',
    category: 'Electric',
    tagline: 'Sustainable luxury with zero emissions',
    image: '/images/fleet/electric-sedan.jpg',
    specs: {
      passengers: 4,
      luggage: 4,
    },
    amenities: ['WiFi', 'USB Charger', 'Water', 'Tissue Box', 'Leather Seats'],
    priceFrom: 400,
    badge: 'Eco-Friendly',
    isElectric: true,
    availableCities: ['Riyadh'],
  },
]

const amenitiesData = [
  { icon: Shield, label: 'Professional Chauffeur', description: 'Trained & vetted drivers' },
  { icon: Droplets, label: 'Complimentary Water', description: 'Refreshments on board' },
  { icon: Car, label: 'Premium Vehicles', description: 'Latest luxury models' },
  { icon: Baby, label: 'Child Seats', description: 'Available on request' },
  { icon: Sparkles, label: 'Sanitized Cars', description: 'Cleaned after every trip' },
  { icon: Headphones, label: '24/7 Support', description: 'Always here for you' },
  { icon: Wifi, label: 'WiFi', description: 'Stay connected' },
  { icon: Usb, label: 'USB Charger', description: 'Power your devices' },
]

function VehicleCard({ vehicle }: { vehicle: typeof vehicles[0] }) {
  const isElectric = vehicle.isElectric
  
  return (
    <div className={`group relative bg-[#141414] rounded-xl overflow-hidden border transition-all duration-300 hover:-translate-y-1 ${
      isElectric 
        ? 'border-green-500/40 hover:border-green-400 hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]' 
        : 'border-neutral-800 hover:border-[#C9A961]/50 hover:shadow-[0_0_20px_rgba(201,169,97,0.1)]'
    }`}>
      {/* Image */}
      <div className="relative h-40 overflow-hidden bg-neutral-900">
        <Image
          src={vehicle.image}
          alt={vehicle.className}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
        
        {/* Badge */}
        {vehicle.badge && (
          <div className={`absolute top-3 left-3 px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 ${
            isElectric ? 'bg-green-500 text-white' : 'bg-[#C9A961] text-black'
          }`}>
            {isElectric && <Zap className="w-3 h-3" />}
            {vehicle.badge}
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Model */}
        <p className={`text-[10px] font-semibold tracking-wider uppercase mb-1 ${isElectric ? 'text-green-400' : 'text-[#C9A961]'}`}>
          {vehicle.model}
        </p>
        
        {/* Name */}
        <h3 className="text-white text-lg font-serif font-bold mb-3">{vehicle.className}</h3>
        
        {/* Specs */}
        <div className="flex items-center gap-4 mb-3 pb-3 border-b border-neutral-800">
          <span className="flex items-center gap-1.5 text-xs text-neutral-300">
            <Users className={`w-4 h-4 ${isElectric ? 'text-green-400' : 'text-[#C9A961]'}`} />
            {vehicle.specs.passengers} Passengers
          </span>
          <span className="flex items-center gap-1.5 text-xs text-neutral-300">
            <Briefcase className={`w-4 h-4 ${isElectric ? 'text-green-400' : 'text-[#C9A961]'}`} />
            {vehicle.specs.passengers} Luggage
          </span>
        </div>
        
        {/* Electric Notice */}
        {isElectric && vehicle.availableCities && (
          <div className="mb-3 px-2 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-[11px] text-green-400 flex items-center gap-1.5">
              <Leaf className="w-3 h-3" />
              Available in {vehicle.availableCities.join(', ')} only
            </p>
          </div>
        )}
        
        {/* All Amenities with Icons */}
        <div className="flex flex-wrap gap-2">
          {vehicle.amenities.map((amenity) => {
            const IconComponent = amenityIcons[amenity] || Sparkles
            return (
              <span 
                key={amenity} 
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] ${
                  isElectric 
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
      </div>
    </div>
  )
}

export default function FleetShowcase() {
  const [activeCategory, setActiveCategory] = useState('All')

  const filteredVehicles = activeCategory === 'All' 
    ? vehicles 
    : vehicles.filter(v => v.category === activeCategory)

  return (
    <section id="fleet" className="py-20 md:py-28 bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-serif font-bold text-white mb-4">
            Our Fleet
          </h2>
          <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
            Handpicked luxury vehicles for every occasion
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex bg-[#141414] rounded-xl p-1.5 border border-neutral-800">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
                  activeCategory === category
                    ? 'bg-[#C9A961] text-black'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Vehicle Cards - Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {filteredVehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>

        {/* Every Ride Includes - Large Feature Cards */}
        <div className="mt-24 pt-20 border-t border-neutral-800">
          <div className="text-center mb-16">
            <span className="text-[#C9A961] text-sm font-bold tracking-widest uppercase mb-4 block">
              Premium Experience
            </span>
            <h3 className="text-4xl md:text-5xl font-serif font-bold text-white mb-6">
              Every Ride Includes
            </h3>
            <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
              Exceptional amenities and world-class service with every booking
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {amenitiesData.map((amenity, index) => (
              <div
                key={amenity.label}
                className="group relative p-8 bg-gradient-to-b from-[#1a1a1a] to-[#141414] rounded-2xl border border-neutral-800 text-center transition-all duration-500 hover:border-[#C9A961]/50 hover:shadow-[0_0_40px_rgba(201,169,97,0.15)] hover:-translate-y-1 overflow-hidden"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Glow effect on hover */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#C9A961]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Icon */}
                <div className="relative w-14 h-14 mx-auto mb-5 rounded-2xl bg-[#C9A961]/10 flex items-center justify-center group-hover:bg-[#C9A961]/20 group-hover:scale-110 transition-all duration-500 group-hover:shadow-[0_0_20px_rgba(201,169,97,0.3)]">
                  <amenity.icon className="w-7 h-7 text-[#C9A961]" />
                </div>
                
                {/* Title */}
                <h4 className="relative text-white text-base font-semibold mb-2 group-hover:text-[#C9A961] transition-colors">
                  {amenity.label}
                </h4>
                
                {/* Description */}
                <p className="relative text-neutral-500 text-sm leading-relaxed">
                  {amenity.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
