// ============================================
// !!! DESTINATION PATH: apps/web/components/landing/fleet-showcase.tsx
// ============================================
"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Users,
  Briefcase,
  Wifi,
  Usb,
  Droplets,
  Shield,
  Baby,
  Sparkles,
  Headphones,
  Car,
  Armchair,
  Sun,
  Eye,
  Leaf,
  Zap,
  Crown,
  Wine,
} from "lucide-react";

const categories = [
  "All",
  "Economy",
  "Business",
  "First Class",
  "Ultra Luxury",
  "Electric",
];

// Amenity icon mapping. Champagne Cooler added for Ultra Luxury.
const amenityIcons: Record<string, React.ElementType> = {
  WiFi: Wifi,
  "USB Charger": Usb,
  Water: Droplets,
  "Tissue Box": Sparkles,
  "Leather Seats": Armchair,
  "Privacy Glass": Eye,
  "Massage Seats": Armchair,
  "Ambient Lighting": Sun,
  "Champagne Cooler": Wine,
};

const vehicles = [
  {
    id: "economy-sedan",
    className: "Economy Sedan",
    model: "Ford Taurus / Lexus or Similar",
    category: "Economy",
    tagline: "Reliable comfort for everyday travel",
    image: "/images/fleet/economy-sedan.jpg",
    specs: { passengers: 3, luggage: 3 },
    amenities: ["WiFi", "USB Charger", "Water", "Tissue Box"],
    priceFrom: 200,
  },
  {
    id: "business-sedan",
    className: "Business Sedan",
    model: "Mercedes E-Class / BMW 5 series or Similar",
    category: "Business",
    tagline: "Ideal for airport transfers & business meetings",
    image: "/images/fleet/business-sedan-desert.jpg",
    specs: { passengers: 3, luggage: 3 },
    amenities: ["WiFi", "USB Charger", "Water", "Tissue Box", "Leather Seats"],
    priceFrom: 350,
    badge: "Popular",
  },
  {
    id: "business-suv",
    className: "Business SUV",
    model: "GMC Yukon / Chevrolet Tahoe or Similar",
    category: "Business",
    tagline: "Perfect for families & group travel",
    image: "/images/fleet/business-suv-desert.jpg",
    specs: { passengers: 7, luggage: 7 },
    amenities: ["WiFi", "USB Charger", "Water", "Tissue Box", "Privacy Glass"],
    priceFrom: 450,
  },
  {
    id: "first-class",
    className: "First Class",
    model: "BMW 7 series / Mercedes Benz S Class or Similar",
    category: "First Class",
    tagline: "The ultimate in luxury travel",
    image: "/images/fleet/first-class.jpg",
    specs: { passengers: 3, luggage: 3 },
    amenities: [
      "WiFi",
      "USB Charger",
      "Water",
      "Tissue Box",
      "Massage Seats",
      "Ambient Lighting",
    ],
    priceFrom: 750,
  },
  {
    id: "ultra-luxury",
    className: "Ultra Luxury",
    // No "or Similar" — for the Phantom, the car IS the offering.
    // Customers book this for weddings, royal transfers, and statement
    // occasions. The signature unit of the fleet.
    model: "Rolls-Royce Phantom",
    category: "Ultra Luxury",
    tagline: "Where craftsmanship becomes occasion",
    image: "/images/fleet/ultra-luxury.jpg",
    specs: { passengers: 2, luggage: 2 },
    amenities: [
      "WiFi",
      "USB Charger",
      "Water",
      "Tissue Box",
      "Leather Seats",
      "Privacy Glass",
      "Massage Seats",
      "Ambient Lighting",
      "Champagne Cooler",
    ],
    priceFrom: 1500,
    badge: "Signature",
    isFeatured: true,
    availableCities: ["Riyadh", "Jeddah"],
  },
  {
    id: "electric",
    className: "Electric",
    model: "Lucid Air or Similar",
    category: "Electric",
    tagline: "Sustainable luxury with zero emissions",
    image: "/images/fleet/electric-sedan.jpg",
    specs: { passengers: 3, luggage: 3 },
    amenities: ["WiFi", "USB Charger", "Water", "Tissue Box", "Leather Seats"],
    priceFrom: 400,
    badge: "Eco-Friendly",
    isElectric: true,
    availableCities: ["Riyadh"],
  },
];

const amenitiesData = [
  {
    icon: Shield,
    label: "Professional Chauffeur",
    description: "Trained & vetted drivers",
  },
  {
    icon: Droplets,
    label: "Complimentary Water",
    description: "Refreshments on board",
  },
  { icon: Car, label: "Premium Vehicles", description: "Latest luxury models" },
  { icon: Baby, label: "Child Seats", description: "Available on request" },
  {
    icon: Sparkles,
    label: "Sanitized Cars",
    description: "Cleaned after every trip",
  },
  {
    icon: Headphones,
    label: "24/7 Support",
    description: "Always here for you",
  },
  { icon: Wifi, label: "WiFi", description: "Stay connected" },
  { icon: Usb, label: "USB Charger", description: "Power your devices" },
];

// ────────────────────────────────────────────────────────────
// Featured card — used for the Ultra Luxury (Phantom) tier.
// Wide horizontal layout on desktop (image left, content right);
// stacks vertically on mobile. Distinct gold-gradient treatment
// signals "signature offering," not just another card in the grid.
// ────────────────────────────────────────────────────────────
function FeaturedVehicleCard({ vehicle }: { vehicle: (typeof vehicles)[0] }) {
  return (
    <div className="relative group mb-12">
      {/* Outer glow — animates in on hover */}
      <div
        aria-hidden
        className="absolute -inset-px rounded-2xl bg-gradient-to-br from-amber-200/30 via-[#C9A961]/40 to-amber-700/30 opacity-50 group-hover:opacity-100 blur-sm transition-opacity duration-500"
      />

      <div className="relative bg-[#141414] rounded-2xl border border-[#C9A961]/40 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Image — left on desktop, top on mobile */}
          <div className="relative h-64 sm:h-80 lg:h-auto lg:col-span-7 overflow-hidden bg-neutral-900">
            <Image
              src={vehicle.image}
              alt={vehicle.className}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              sizes="(min-width: 1024px) 58vw, 100vw"
              priority
            />

            {/* Gradient overlay — fades into content panel on the right
                (or downward into content panel on mobile) for legibility */}
            <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-[#141414] via-[#141414]/30 to-transparent" />

            {/* Signature badge — gold gradient with crown glyph */}
            <div className="absolute top-4 left-4 px-3 py-1.5 bg-gradient-to-r from-amber-200 to-[#C9A961] text-black text-[11px] font-bold tracking-wide rounded-full flex items-center gap-1.5 shadow-lg shadow-black/30">
              <Crown className="w-3.5 h-3.5" />
              {vehicle.badge ?? "Signature"}
            </div>
          </div>

          {/* Content — right on desktop, bottom on mobile */}
          <div className="lg:col-span-5 p-6 lg:p-8 flex flex-col justify-center">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#C9A961] mb-2">
              {vehicle.model}
            </p>

            <h3 className="text-white text-3xl lg:text-4xl font-serif font-bold mb-3">
              {vehicle.className}
            </h3>

            <p className="text-neutral-400 text-sm italic mb-5 font-serif leading-relaxed">
              {vehicle.tagline}
            </p>

            {/* Specs */}
            <div className="flex items-center gap-6 mb-5 pb-5 border-b border-neutral-800">
              <span className="flex items-center gap-1.5 text-sm text-neutral-300">
                <Users className="w-4 h-4 text-[#C9A961]" />
                {vehicle.specs.passengers} Passengers
              </span>
              <span className="flex items-center gap-1.5 text-sm text-neutral-300">
                <Briefcase className="w-4 h-4 text-[#C9A961]" />
                {vehicle.specs.luggage} Luggage
              </span>
            </div>

            {/* Availability notice (Phantom is operated only in major hubs) */}
            {vehicle.availableCities && (
              <div className="mb-4 px-3 py-2 bg-[#C9A961]/10 border border-[#C9A961]/30 rounded-lg">
                <p className="text-xs text-[#C9A961] flex items-center gap-2">
                  <Crown className="w-3 h-3" />
                  Available on request
                </p>
              </div>
            )}

            {/* Amenities */}
            <div className="flex flex-wrap gap-2">
              {vehicle.amenities.map((amenity) => {
                const IconComponent = amenityIcons[amenity] || Sparkles;
                return (
                  <span
                    key={amenity}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-[#C9A961]/10 text-[#C9A961] border border-[#C9A961]/20"
                  >
                    <IconComponent className="w-3 h-3" />
                    {amenity}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Standard card — used for every tier except Ultra Luxury.
// Visually identical to the original, with two fixes:
//   1. Luggage line now reads vehicle.specs.luggage (was passengers)
//   2. Defensive amenity-icon lookup unchanged but harmonised
// ────────────────────────────────────────────────────────────
function StandardVehicleCard({ vehicle }: { vehicle: (typeof vehicles)[0] }) {
  const isElectric = vehicle.isElectric;

  return (
    <div
      className={`group relative bg-[#141414] rounded-xl overflow-hidden border transition-all duration-300 hover:-translate-y-1 ${
        isElectric
          ? "border-green-500/40 hover:border-green-400 hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]"
          : "border-neutral-800 hover:border-[#C9A961]/50 hover:shadow-[0_0_20px_rgba(201,169,97,0.1)]"
      }`}
    >
      {/* Image */}
      <div className="relative h-40 overflow-hidden bg-neutral-900">
        <Image
          src={vehicle.image}
          alt={vehicle.className}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />

        {/* Badge */}
        {vehicle.badge && (
          <div
            className={`absolute top-3 left-3 px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 ${
              isElectric ? "bg-green-500 text-white" : "bg-[#C9A961] text-black"
            }`}
          >
            {isElectric && <Zap className="w-3 h-3" />}
            {vehicle.badge}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <p
          className={`text-[10px] font-semibold tracking-wider uppercase mb-1 ${
            isElectric ? "text-green-400" : "text-[#C9A961]"
          }`}
        >
          {vehicle.model}
        </p>

        <h3 className="text-white text-lg font-serif font-bold mb-3">
          {vehicle.className}
        </h3>

        <div className="flex items-center gap-4 mb-3 pb-3 border-b border-neutral-800">
          <span className="flex items-center gap-1.5 text-xs text-neutral-300">
            <Users
              className={`w-4 h-4 ${isElectric ? "text-green-400" : "text-[#C9A961]"}`}
            />
            {vehicle.specs.passengers} Passengers
          </span>
          <span className="flex items-center gap-1.5 text-xs text-neutral-300">
            <Briefcase
              className={`w-4 h-4 ${isElectric ? "text-green-400" : "text-[#C9A961]"}`}
            />
            {vehicle.specs.luggage} Luggage
          </span>
        </div>

        {/* Electric availability notice */}
        {isElectric && vehicle.availableCities && (
          <div className="mb-3 px-2 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-[11px] text-green-400 flex items-center gap-1.5">
              <Leaf className="w-3 h-3" />
              Available in {vehicle.availableCities.join(", ")} only
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {vehicle.amenities.map((amenity) => {
            const IconComponent = amenityIcons[amenity] || Sparkles;
            return (
              <span
                key={amenity}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] ${
                  isElectric
                    ? "bg-green-500/10 text-green-400"
                    : "bg-[#C9A961]/10 text-[#C9A961]"
                }`}
              >
                <IconComponent className="w-3 h-3" />
                {amenity}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function FleetShowcase() {
  const [activeCategory, setActiveCategory] = useState("All");

  // Pull the featured vehicle (Ultra Luxury) out so we can render it
  // in its own hero card. Everything else flows through the standard
  // grid below.
  const featuredVehicle = vehicles.find((v) => v.isFeatured);
  const standardVehicles = vehicles.filter((v) => !v.isFeatured);

  const showFeatured =
    !!featuredVehicle &&
    (activeCategory === "All" || activeCategory === featuredVehicle.category);

  const filteredStandard =
    activeCategory === "All"
      ? standardVehicles
      : standardVehicles.filter((v) => v.category === activeCategory);

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

        {/* Filter Tabs
            Horizontally scrollable on narrow viewports (six categories
            don't fit in a pill row at ≤640px), centered on desktop.
            The negative-margin trick lets scroll extend edge-to-edge
            on mobile without showing a visible scrollbar. */}
        <div className="mb-12 -mx-4 px-4 md:mx-0 md:px-0 md:flex md:justify-center">
          <div className="overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="inline-flex bg-[#141414] rounded-xl p-1.5 border border-neutral-800 whitespace-nowrap">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-4 sm:px-5 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 whitespace-nowrap ${
                    activeCategory === category
                      ? "bg-[#C9A961] text-black"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Featured: Ultra Luxury (Phantom) */}
        {showFeatured && featuredVehicle && (
          <FeaturedVehicleCard vehicle={featuredVehicle} />
        )}

        {/* Standard Grid — five tiles wide on desktop, scales down gracefully */}
        {filteredStandard.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {filteredStandard.map((vehicle) => (
              <StandardVehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        )}

        {/* Every Ride Includes */}
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
                <div className="absolute inset-0 bg-gradient-to-b from-[#C9A961]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                <div className="relative w-14 h-14 mx-auto mb-5 rounded-2xl bg-[#C9A961]/10 flex items-center justify-center group-hover:bg-[#C9A961]/20 group-hover:scale-110 transition-all duration-500 group-hover:shadow-[0_0_20px_rgba(201,169,97,0.3)]">
                  <amenity.icon className="w-7 h-7 text-[#C9A961]" />
                </div>

                <h4 className="relative text-white text-base font-semibold mb-2 group-hover:text-[#C9A961] transition-colors">
                  {amenity.label}
                </h4>

                <p className="relative text-neutral-500 text-sm leading-relaxed">
                  {amenity.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
