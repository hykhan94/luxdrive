"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Clock,
  Users,
  Car,
  Phone,
  Mail,
  User,
  Briefcase,
  Plane,
  Check,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";
import { PhoneInput, EmailInput } from "@/components/ui/form-fields";

const vehicles: Record<
  string,
  {
    name: string;
    model: string;
    basePrice: number;
    maxPassengers: number;
    maxLuggage: number;
  }
> = {
  "economy-sedan": {
    name: "Economy Sedan",
    model: "Ford Taurus or Similar",
    basePrice: 100,
    maxPassengers: 4,
    maxLuggage: 4,
  },
  "business-sedan": {
    name: "Business Sedan",
    model: "Mercedes E-Class or Similar",
    basePrice: 150,
    maxPassengers: 4,
    maxLuggage: 4,
  },
  "business-suv": {
    name: "Business SUV",
    model: "GMC Yukon or Similar",
    basePrice: 200,
    maxPassengers: 7,
    maxLuggage: 7,
  },
  "first-class": {
    name: "First Class",
    model: "Rolls Royce or Similar",
    basePrice: 300,
    maxPassengers: 4,
    maxLuggage: 4,
  },
  electric: {
    name: "Electric",
    model: "Lucid Air or Similar",
    basePrice: 180,
    maxPassengers: 4,
    maxLuggage: 4,
  },
};

const airlines = [
  "Saudi Airlines (Saudia)",
  "Flynas",
  "Emirates",
  "Qatar Airways",
  "Etihad Airways",
  "Turkish Airlines",
  "Other",
];

function DetailsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showNotification } = useNotification();

  const bookingType = searchParams.get("type") || "oneway";
  const pickup = searchParams.get("pickup") || "";
  const dropoff = searchParams.get("dropoff") || "";
  const date = searchParams.get("date") || "";
  const time = searchParams.get("time") || "";
  const passengers = searchParams.get("passengers") || "1";
  const duration = searchParams.get("duration") || "";
  const flight = searchParams.get("flight") || "";
  const vehicleId = searchParams.get("vehicle") || "business-sedan";

  const vehicle = vehicles[vehicleId] || vehicles["business-sedan"];

  // Form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [passengerCount, setPassengerCount] = useState(passengers);
  // Luggage = Passengers automatically (no separate selection)
  const [pickupInstructions, setPickupInstructions] = useState("");
  const [flightNumber, setFlightNumber] = useState(flight);
  const [airline, setAirline] = useState("");
  const [trackFlight, setTrackFlight] = useState(false);
  const [specialRequests, setSpecialRequests] = useState("");

  // Additional services
  const [meetGreet, setMeetGreet] = useState(false);
  const [childSeat, setChildSeat] = useState(false);
  const [water, setWater] = useState(true);
  const [extraStop, setExtraStop] = useState(false);
  const [wheelchair, setWheelchair] = useState(false);

  const isAirport =
    pickup.toLowerCase().includes("airport") ||
    dropoff.toLowerCase().includes("airport");

  // Calculate price
  const basePrice = vehicle.basePrice;
  const childSeatPrice = childSeat ? 50 : 0;
  const extraStopPrice = extraStop ? 75 : 0;
  const subtotal = basePrice + childSeatPrice + extraStopPrice;
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !lastName || !email || !phone) {
      showNotification("error", "Please fill in all required fields");
      return;
    }

    // Build params for payment page
    const params = new URLSearchParams(searchParams.toString());
    params.set("firstName", firstName);
    params.set("lastName", lastName);
    params.set("email", email);
    params.set("phone", phone);
    params.set("total", total.toFixed(2));

    router.push(`/booking/payment?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-[#0a0a0a]/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            href={`/booking?${searchParams.toString()}`}
            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </Link>
          <Link href="/" className="text-2xl font-serif">
            <span className="text-white">Lux</span>
            <span className="text-[#C9A961]">Drive</span>
          </Link>
          <div className="w-24" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Form */}
            <div className="lg:col-span-2 space-y-8">
              {/* Passenger Information */}
              <div className="bg-[#141414] rounded-2xl border border-neutral-800 p-6">
                <h2 className="text-xl font-serif font-bold text-white mb-6 flex items-center gap-2">
                  <User className="w-5 h-5 text-[#C9A961]" />
                  Passenger Information
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-neutral-400 text-sm mb-2">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 bg-[#0a0a0a] border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:border-[#C9A961] focus:outline-none transition-colors"
                      placeholder="John"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 text-sm mb-2">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 bg-[#0a0a0a] border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:border-[#C9A961] focus:outline-none transition-colors"
                      placeholder="Doe"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 text-sm mb-2">
                      Email *
                    </label>
                    <EmailInput
                      value={email}
                      onChange={setEmail}
                      label=""
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 text-sm mb-2">
                      Phone *
                    </label>
                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      label=""
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 text-sm mb-2">
                      Passengers
                    </label>
                    <select
                      value={passengerCount}
                      onChange={(e) => setPassengerCount(e.target.value)}
                      className="w-full px-4 py-3 bg-[#0a0a0a] border border-neutral-700 rounded-lg text-white focus:border-[#C9A961] focus:outline-none transition-colors"
                    >
                      {Array.from(
                        { length: vehicle.maxPassengers },
                        (_, i) => i + 1,
                      ).map((num) => (
                        <option key={num} value={num}>
                          {num} Passenger{num > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-neutral-400 text-sm mb-2">
                      Luggage
                    </label>
                    <div className="w-full px-4 py-3 bg-[#0a0a0a] border border-neutral-700 rounded-lg text-neutral-400">
                      {passengerCount} Luggage{" "}
                      <span className="text-neutral-600 text-xs">
                        (auto-matched to passengers)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pickup Information */}
              <div className="bg-[#141414] rounded-2xl border border-neutral-800 p-6">
                <h2 className="text-xl font-serif font-bold text-white mb-6 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#C9A961]" />
                  Pickup Information
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-neutral-400 text-sm mb-2">
                      Pickup Instructions
                    </label>
                    <textarea
                      value={pickupInstructions}
                      onChange={(e) => setPickupInstructions(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 bg-[#0a0a0a] border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:border-[#C9A961] focus:outline-none transition-colors resize-none"
                      placeholder="e.g., Meet at hotel lobby, Terminal 1 arrivals gate..."
                    />
                  </div>

                  {isAirport && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-neutral-400 text-sm mb-2">
                            Flight Number
                          </label>
                          <div className="relative">
                            <Plane className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                            <input
                              type="text"
                              value={flightNumber}
                              onChange={(e) => setFlightNumber(e.target.value)}
                              className="w-full pl-11 pr-4 py-3 bg-[#0a0a0a] border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:border-[#C9A961] focus:outline-none transition-colors"
                              placeholder="SV123"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-neutral-400 text-sm mb-2">
                            Airline
                          </label>
                          <select
                            value={airline}
                            onChange={(e) => setAirline(e.target.value)}
                            className="w-full px-4 py-3 bg-[#0a0a0a] border border-neutral-700 rounded-lg text-white focus:border-[#C9A961] focus:outline-none transition-colors"
                          >
                            <option value="">Select Airline</option>
                            {airlines.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={trackFlight}
                          onChange={(e) => setTrackFlight(e.target.checked)}
                          className="w-5 h-5 rounded border-neutral-600 bg-[#0a0a0a] text-[#C9A961] focus:ring-[#C9A961]"
                        />
                        <span className="text-white">
                          Track my flight for delays
                        </span>
                      </label>
                    </>
                  )}

                  <div>
                    <label className="block text-neutral-400 text-sm mb-2">
                      Special Requests
                    </label>
                    <textarea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 bg-[#0a0a0a] border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:border-[#C9A961] focus:outline-none transition-colors resize-none"
                      placeholder="Any special requirements or requests..."
                    />
                  </div>
                </div>
              </div>

              {/* Additional Services */}
              <div className="bg-[#141414] rounded-2xl border border-neutral-800 p-6">
                <h2 className="text-xl font-serif font-bold text-white mb-6">
                  Additional Services
                </h2>

                <div className="space-y-4">
                  {[
                    {
                      label: "Meet & Greet",
                      price: "Free",
                      state: meetGreet,
                      setState: setMeetGreet,
                    },
                    {
                      label: "Child Seat",
                      price: "+SAR 50",
                      state: childSeat,
                      setState: setChildSeat,
                    },
                    {
                      label: "Bottled Water",
                      price: "Free",
                      state: water,
                      setState: setWater,
                    },
                    {
                      label: "Extra Stop",
                      price: "+SAR 75",
                      state: extraStop,
                      setState: setExtraStop,
                    },
                    {
                      label: "Wheelchair Accessible",
                      price: "Free",
                      state: wheelchair,
                      setState: setWheelchair,
                    },
                  ].map((service) => (
                    <label
                      key={service.label}
                      className="flex items-center justify-between p-4 bg-[#0a0a0a] rounded-lg cursor-pointer hover:border-[#C9A961]/50 border border-transparent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={service.state}
                          onChange={(e) => service.setState(e.target.checked)}
                          className="w-5 h-5 rounded border-neutral-600 bg-[#0a0a0a] text-[#C9A961] focus:ring-[#C9A961]"
                        />
                        <span className="text-white">{service.label}</span>
                      </div>
                      <span
                        className={
                          service.price === "Free"
                            ? "text-green-500"
                            : "text-[#C9A961]"
                        }
                      >
                        {service.price}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column - Summary */}
            <div className="lg:col-span-1">
              <div className="bg-[#141414] rounded-2xl border border-neutral-800 p-6 sticky top-24">
                <h2 className="text-xl font-serif font-bold text-white mb-6">
                  Booking Summary
                </h2>

                {/* Route */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#C9A961] mt-2" />
                    <div>
                      <p className="text-neutral-500 text-xs">Pickup</p>
                      <p className="text-white text-sm">{pickup}</p>
                    </div>
                  </div>
                  {bookingType === "oneway" && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-white mt-2" />
                      <div>
                        <p className="text-neutral-500 text-xs">Drop-off</p>
                        <p className="text-white text-sm">{dropoff}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-2 mb-6 pb-6 border-b border-neutral-800">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-[#C9A961]" />
                    <span className="text-neutral-400">{formatDate(date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-[#C9A961]" />
                    <span className="text-neutral-400">{time}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Car className="w-4 h-4 text-[#C9A961]" />
                    <span className="text-neutral-400">{vehicle.name}</span>
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="space-y-2 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">Base Fare</span>
                    <span className="text-white">
                      SAR {basePrice.toFixed(2)}
                    </span>
                  </div>
                  {childSeat && (
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-400">Child Seat</span>
                      <span className="text-white">SAR 50.00</span>
                    </div>
                  )}
                  {extraStop && (
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-400">Extra Stop</span>
                      <span className="text-white">SAR 75.00</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-400">VAT (15%)</span>
                    <span className="text-white">SAR {vat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-neutral-800">
                    <span className="text-white">Total</span>
                    <span className="text-[#C9A961]">
                      SAR {total.toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-[#C9A961] text-black font-bold rounded-xl transition-all duration-300 hover:bg-[#d4b872] hover:shadow-[0_0_30px_rgba(201,169,97,0.3)]"
                >
                  Continue to Payment
                </button>

                <p className="text-neutral-500 text-xs text-center mt-4">
                  You won&apos;t be charged until you complete the booking
                </p>
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function BookingDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <div className="text-[#C9A961]">Loading...</div>
        </div>
      }
    >
      <DetailsContent />
    </Suspense>
  );
}
