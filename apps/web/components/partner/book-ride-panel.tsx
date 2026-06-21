// ============================================
// !!! DESTINATION PATH: apps/web/components/partner/book-ride-panel.tsx
// ============================================
"use client";

// ============================================
// components/partner/book-ride/book-ride-panel.tsx
// Partner Portal — Book a Ride
//
// SETUP REQUIRED:
//   1. Install: yarn add @react-google-maps/api
//   2. Add to .env.local: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...
//   3. Enable in Google Cloud Console: Places API (New), Maps JavaScript API
// ============================================

import { useState, useEffect, useCallback, useRef } from "react";
import { partnerApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import { useLoadScript, Autocomplete } from "@react-google-maps/api";
import { PhoneInput, EmailInput } from "@/components/ui/form-fields";
import {
  Plus,
  Loader2,
  Plane,
  DollarSign,
  Leaf,
  Zap,
  AlertCircle,
  MapPin,
  ShieldAlert,
} from "lucide-react";

// Google Maps libraries to load
const GOOGLE_MAPS_LIBRARIES: "places"[] = ["places"];

// ============== TYPES ==============

interface RouteOption {
  id: string;
  routeName: string;
  pickupLocation: string;
  dropoffLocation: string;
  isPerKm: boolean;
  isHourly: boolean;
  isExtraHour: boolean;
  isAirport: boolean;
}

interface VehicleOption {
  vehicleClass: string;
  label: string;
  category: string;
  maxPassengers: number;
  price: number | null;
  basePrice: number | null;
  isElectric: boolean;
  available: boolean;
  isPeakActive: boolean;
  peakMultiplier: number | null;
  // Set by backend on HOURLY responses only. unavailableReason surfaces
  // the calculator's exact rejection ("Per Hour Rate is not configured
  // for X in Y"); pendingHours signals the partner hasn't picked hours
  // yet so prices are placeholders.
  unavailableReason?: string | null;
  pendingHours?: boolean;
}

interface PriceBreakdownData {
  basePrice: number;
  peakMultiplier: number;
  peakSurcharge: number;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalPrice: number;
  // Populated only for HOURLY bookings — backend returns a structured
  // breakdown of how the bracket logic resolved (day rate vs per-hour
  // vs day + extras).
  hourly?: {
    hours: number;
    tier: "PER_HOUR" | "DAY_RATE" | "DAY_RATE_PLUS_EXTRA";
    breakdown: Array<{
      label: string;
      hours: number | null;
      rate: number;
      amount: number;
    }>;
    subtotalBeforePeak: number;
  } | null;
}

// ============== CONSTANTS ==============

const CITIES = [
  { id: "RIYADH", name: "Riyadh", province: "Riyadh" },
  { id: "JEDDAH", name: "Jeddah", province: "Makkah" },
  { id: "MAKKAH", name: "Makkah", province: "Makkah" },
  { id: "MADINAH", name: "Madinah", province: "Madinah" },
];

// Bias autocomplete to Saudi Arabia city centers
const CITY_BOUNDS: Record<string, { lat: number; lng: number }> = {
  RIYADH: { lat: 24.7136, lng: 46.6753 },
  JEDDAH: { lat: 21.4858, lng: 39.1925 },
  MAKKAH: { lat: 21.3891, lng: 39.8579 },
  MADINAH: { lat: 24.4539, lng: 39.6142 },
};

const TRIP_TYPES = [
  { id: "ONE_WAY", label: "One Way" },
  { id: "HOURLY", label: "By the Hour" },
];

const PASSENGER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 23, 49];

const CATEGORY_LABELS: Record<string, string> = {
  sedan: "SEDANS",
  suv: "SUV",
  group: "GROUP TRANSPORT",
  ev: "ECO FLEET",
  other: "OTHER",
};

// ============== GOOGLE PLACES AUTOCOMPLETE INPUT ==============

interface PlacesInputProps {
  label: string;
  value: string;
  placeholder: string;
  required?: boolean;
  cityBias: { lat: number; lng: number };
  icon?: "pickup" | "dropoff";
  onSelect: (address: string, lat: number, lng: number) => void;
  onChange: (value: string) => void;
}

function PlacesAutocompleteInput({
  label,
  value,
  placeholder,
  required,
  cityBias,
  icon,
  onSelect,
  onChange,
}: PlacesInputProps) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const onLoad = useCallback(
    (autocomplete: google.maps.places.Autocomplete) => {
      autocompleteRef.current = autocomplete;
    },
    [],
  );

  const onPlaceChanged = useCallback(() => {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();
    if (place.geometry?.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const address = place.formatted_address || place.name || "";
      onSelect(address, lat, lng);
    }
  }, [onSelect]);

  // Update autocomplete bounds when city changes
  useEffect(() => {
    if (autocompleteRef.current && cityBias) {
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(cityBias.lat - 0.5, cityBias.lng - 0.5),
        new google.maps.LatLng(cityBias.lat + 0.5, cityBias.lng + 0.5),
      );
      autocompleteRef.current.setBounds(bounds);
    }
  }, [cityBias]);

  const iconColor =
    icon === "pickup"
      ? "text-green-400"
      : icon === "dropoff"
        ? "text-red-400"
        : "text-gray-400";

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-2 flex items-center gap-1.5">
        {icon && <MapPin className={`w-3.5 h-3.5 ${iconColor}`} />}
        {label}
      </label>
      <Autocomplete
        onLoad={onLoad}
        onPlaceChanged={onPlaceChanged}
        options={{
          componentRestrictions: { country: "sa" },
          fields: ["formatted_address", "geometry", "name"],
          types: ["establishment", "geocode"],
        }}
      >
        <input
          type="text"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none placeholder-gray-500"
        />
      </Autocomplete>
    </div>
  );
}

// ============== MAIN COMPONENT ==============

interface BookRidePanelProps {
  onSuccess: () => void;
  rebookData?: any | null;
  // Partner's current status — used to gate the booking form submit.
  // Only APPROVED partners can create new bookings.
  partnerStatus?: string | null;
  // Required profile docs (CR/VAT/Chamber/Balady/National-Address/IBAN-Letter)
  // that are past their expiry date. When non-empty, the booking form is
  // locked even if partnerStatus is APPROVED — partner must renew via the
  // profile change-request flow before new bookings can be created.
  expiredRequiredDocs?: Array<{
    type: string;
    label: string;
    expiryDate: string;
  }>;
}

export default function BookRidePanel({
  onSuccess,
  rebookData,
  partnerStatus,
  expiredRequiredDocs,
}: BookRidePanelProps) {
  const { showNotification } = useNotification();

  // Doc-expiry is its own axis on top of partnerStatus. Same lock effect but
  // we surface a distinct, more actionable banner ("Balady Expired") instead
  // of the generic "profile under review" copy.
  const hasExpiredDocs = (expiredRequiredDocs?.length ?? 0) > 0;

  // Partner must be APPROVED AND have no expired required docs to book a new
  // ride. Other actions (browsing routes, viewing prices) remain available
  // because they're informational — partner needs to see them to understand
  // what they can/can't do.
  const canBookRide = partnerStatus === "APPROVED" && !hasExpiredDocs;
  const bookLockReason = hasExpiredDocs
    ? `The following profile document${expiredRequiredDocs!.length > 1 ? "s have" : " has"} expired: ${expiredRequiredDocs!.map((d) => d.label).join(", ")}. Submit a profile change request to renew before booking a new ride.`
    : partnerStatus === "INVITED"
      ? "Complete and submit your profile to start booking rides"
      : partnerStatus === "PENDING_REVIEW"
        ? "Your profile is being reviewed. Booking will be available once approved."
        : partnerStatus === "CHANGES_REQUESTED"
          ? "Admin has requested changes to your profile. Update the highlighted fields and resubmit before booking new rides."
          : "Your profile must be approved before you can book a ride.";

  // Load Google Maps SDK
  const { isLoaded: mapsLoaded, loadError: mapsError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // Step state
  const [city, setCity] = useState("RIYADH");
  const [tripType, setTripType] = useState("ONE_WAY");

  // API data
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [priceBreakdown, setPriceBreakdown] =
    useState<PriceBreakdownData | null>(null);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // Form data with lat/lng from Google Places
  const [formData, setFormData] = useState({
    guestName: "",
    guestPhone: "",
    guestEmail: "",
    routeId: "",
    pickupAddress: "",
    pickupLat: null as number | null,
    pickupLng: null as number | null,
    dropoffAddress: "",
    dropoffLat: null as number | null,
    dropoffLng: null as number | null,
    tripDate: "",
    tripTime: "",
    vehicleClass: "",
    passengers: "1",
    flightNumber: "",
    terminalNo: "",
    terminalLocation: "",
    hours: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derived
  const selectedRoute = routes.find((r) => r.id === formData.routeId);
  const selectedVehicle = vehicles.find(
    (v) => v.vehicleClass === formData.vehicleClass,
  );
  const isEcoSelected = selectedVehicle?.isElectric || false;
  const showAirportFields = selectedRoute?.isAirport || false;
  const cityBias = CITY_BOUNDS[city] || CITY_BOUNDS.RIYADH;

  // ============== FETCH ROUTES when city/tripType changes ==============
  const fetchRoutes = useCallback(async () => {
    setLoadingRoutes(true);
    setRoutes([]);
    setVehicles([]);
    setPriceBreakdown(null);
    setFormData((prev) => ({
      ...prev,
      routeId: "",
      vehicleClass: "",
      pickupAddress: "",
      pickupLat: null,
      pickupLng: null,
      dropoffAddress: "",
      dropoffLat: null,
      dropoffLng: null,
    }));
    try {
      const res = await partnerApi.getAvailableRoutes({ city, tripType });
      const fetchedRoutes: RouteOption[] = res.data?.routes || [];
      setRoutes(fetchedRoutes);

      // For HOURLY, the partner shouldn't be choosing among the three
      // tier rows — that's a calculator-internal detail. Auto-pick the
      // first available hourly row so the backend's routeId requirement
      // is satisfied transparently. The calculator (called downstream)
      // doesn't care which tier we hand it; it derives the right rate
      // from `hours` regardless.
      if (tripType === "HOURLY" && fetchedRoutes.length > 0) {
        setFormData((prev) => ({ ...prev, routeId: fetchedRoutes[0].id }));
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load routes");
    } finally {
      setLoadingRoutes(false);
    }
  }, [city, tripType, showNotification]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  // ============== FETCH VEHICLES when route selected ==============
  const fetchVehicles = useCallback(
    async (routeId: string, hoursForHourly: string | null) => {
      if (!routeId) return;
      setLoadingVehicles(true);
      setVehicles([]);
      setPriceBreakdown(null);
      setFormData((prev) => ({ ...prev, vehicleClass: "" }));
      try {
        // For HOURLY, hours drives the calculator-based per-vehicle
        // pricing. If hours isn't set yet, backend returns vehicles
        // with placeholder prices and pendingHours=true; we still
        // render them as disabled so the user knows what to do next.
        const params: Record<string, any> = { routeId };
        if (tripType === "HOURLY" && hoursForHourly) {
          params.hours = Number(hoursForHourly);
        }
        const res = await partnerApi.getVehicleOptions(params);
        if (res.data?.vehicles) setVehicles(res.data.vehicles);
        // Also accept allVehicles for HOURLY so users can see why a
        // class is unavailable. Falls back to vehicles[] when backend
        // doesn't return allVehicles.
        if (tripType === "HOURLY" && res.data?.allVehicles) {
          setVehicles(res.data.allVehicles);
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load vehicles");
      } finally {
        setLoadingVehicles(false);
      }
    },
    [showNotification, tripType],
  );

  // ============== FETCH PRICE when vehicle selected ==============
  const fetchPrice = useCallback(
    async (
      routeId: string,
      vehicleClass: string,
      hoursForHourly: string | number | null,
    ) => {
      if (!routeId || !vehicleClass) return;
      // For HOURLY, hours is mandatory. Don't kick off a request that
      // we already know will return a "hours required" error — just
      // wait until the partner picks a value.
      if (tripType === "HOURLY" && !hoursForHourly) {
        setPriceBreakdown(null);
        return;
      }
      setLoadingPrice(true);
      setPriceBreakdown(null);
      try {
        const res = await partnerApi.getPriceBreakdown({
          routeId,
          vehicleClass,
          // Backend reads hours when the route is HOURLY; harmless on ONE_WAY.
          ...(tripType === "HOURLY" && hoursForHourly
            ? { hours: Number(hoursForHourly) }
            : {}),
        });
        if (res.data) setPriceBreakdown(res.data);
      } catch (err: any) {
        showNotification("error", err.message || "Failed to calculate price");
      } finally {
        setLoadingPrice(false);
      }
    },
    [showNotification, tripType],
  );

  // Route selected → pre-fill hint text + fetch vehicles. For HOURLY,
  // also re-trigger when hours changes so the per-vehicle preview
  // prices reflect the new bracket.
  useEffect(() => {
    if (selectedRoute) {
      setFormData((prev) => ({
        ...prev,
        // Set route's default locations as placeholder hints (user replaces via autocomplete)
        pickupAddress: "",
        pickupLat: null,
        pickupLng: null,
        dropoffAddress: "",
        dropoffLat: null,
        dropoffLng: null,
      }));
      fetchVehicles(
        selectedRoute.id,
        tripType === "HOURLY" ? formData.hours : null,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute?.id, tripType === "HOURLY" ? formData.hours : null]);

  // Vehicle selected → fetch price. For HOURLY, also depends on hours.
  useEffect(() => {
    if (formData.routeId && formData.vehicleClass) {
      fetchPrice(
        formData.routeId,
        formData.vehicleClass,
        tripType === "HOURLY" ? formData.hours : null,
      );
    }
  }, [
    formData.routeId,
    formData.vehicleClass,
    formData.hours,
    tripType,
    fetchPrice,
  ]);

  // Pre-fill from rebook
  useEffect(() => {
    if (rebookData) {
      setFormData((prev) => ({
        ...prev,
        guestName: rebookData.guestName || rebookData.customer || "",
        guestPhone: rebookData.guestPhone || "",
        guestEmail: rebookData.guestEmail || "",
        notes: `Rebooking from ${rebookData.bookingRef || rebookData.id}`,
      }));
      if (rebookData.city) setCity(rebookData.city);
      if (rebookData.tripType) setTripType(rebookData.tripType);
    }
  }, [rebookData]);

  // ============== SUBMIT ==============
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.routeId || !formData.vehicleClass) {
      showNotification(
        "error",
        tripType === "HOURLY"
          ? "Please select hours and a vehicle"
          : "Please select a route and vehicle",
      );
      return;
    }
    if (tripType === "HOURLY" && !formData.hours) {
      showNotification("error", "Please select the number of hours");
      return;
    }
    if (!formData.pickupAddress) {
      showNotification("error", "Please enter a pickup address");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await partnerApi.createBooking({
        city,
        tripType,
        routeId: formData.routeId,
        guestName: formData.guestName,
        guestPhone: formData.guestPhone || undefined,
        guestEmail: formData.guestEmail || undefined,
        pickupAddress: formData.pickupAddress,
        pickupLat: formData.pickupLat,
        pickupLng: formData.pickupLng,
        dropoffAddress: formData.dropoffAddress,
        dropoffLat: formData.dropoffLat,
        dropoffLng: formData.dropoffLng,
        tripDate: formData.tripDate,
        tripTime: formData.tripTime,
        vehicleClass: formData.vehicleClass,
        passengers: parseInt(formData.passengers),
        flightNumber: formData.flightNumber || undefined,
        terminalNo: formData.terminalNo || undefined,
        terminalLocation: formData.terminalLocation || undefined,
        hours:
          tripType === "HOURLY" && formData.hours
            ? parseInt(formData.hours)
            : undefined,
        notes: formData.notes || undefined,
      });

      showNotification(
        "success",
        `Booking ${res.data?.bookingRef || ""} created! Total: SAR ${priceBreakdown?.totalPrice?.toLocaleString() || ""}`,
      );
      onSuccess();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to create booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group vehicles by category
  const groupedVehicles = vehicles.reduce<Record<string, VehicleOption[]>>(
    (acc, v) => {
      const cat = v.category || "other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(v);
      return acc;
    },
    {},
  );

  // ============== RENDER ==============
  return (
    <div className="max-w-3xl space-y-4 lg:space-y-6">
      {/* Lock banner — explains why booking is disabled. Doc-expired variant
          takes precedence (red, names the specific doc) over the generic
          status-based variant (amber). Both invite the partner to fix the
          underlying issue via the Profile section. */}
      {!canBookRide && (hasExpiredDocs || partnerStatus) && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            hasExpiredDocs
              ? "bg-red-500/5 border-red-500/20"
              : "bg-amber-500/5 border-amber-500/20"
          }`}
        >
          <ShieldAlert
            className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              hasExpiredDocs ? "text-red-400" : "text-amber-400"
            }`}
          />
          <div className="flex-1">
            <p
              className={`text-sm font-medium ${
                hasExpiredDocs ? "text-red-400" : "text-amber-400"
              }`}
            >
              {hasExpiredDocs
                ? expiredRequiredDocs!.length === 1
                  ? `${expiredRequiredDocs![0].label} has expired`
                  : `${expiredRequiredDocs!.length} required documents have expired`
                : partnerStatus === "INVITED"
                  ? "Profile not yet submitted"
                  : partnerStatus === "PENDING_REVIEW"
                    ? "Profile under review"
                    : partnerStatus === "CHANGES_REQUESTED"
                      ? "Admin requested profile changes"
                      : "Booking disabled"}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                hasExpiredDocs ? "text-red-400/70" : "text-amber-400/70"
              }`}
            >
              {hasExpiredDocs
                ? `Renew the expired document${expiredRequiredDocs!.length > 1 ? "s" : ""} via the profile change-request flow. You can still browse routes and pricing here, but cannot submit a new booking until renewed.`
                : "You can browse routes and pricing here, but new bookings cannot be submitted until your profile is approved."}
            </p>
          </div>
        </div>
      )}

      <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
        {/* STEP 1: City */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-3">
            Step 1: Select City
          </label>
          <div className="flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCity(c.id)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${city === c.id ? "bg-luxury-gold text-black" : "bg-neutral-800 text-gray-400 hover:text-white border border-neutral-700"}`}
              >
                <span>{c.name}</span>
                <span className="text-xs ml-1 opacity-70">({c.province})</span>
              </button>
            ))}
          </div>
        </div>

        {/* STEP 2: Trip Type */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-3">
            Step 2: Select Booking Type
          </label>
          <div className="flex gap-2">
            {TRIP_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTripType(t.id)}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${tripType === t.id ? "bg-luxury-gold text-black" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Guest Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Guest Name *
              </label>
              <input
                type="text"
                required
                value={formData.guestName}
                onChange={(e) =>
                  setFormData({ ...formData, guestName: e.target.value })
                }
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                placeholder="Enter guest name"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Guest Phone
              </label>
              <PhoneInput
                value={formData.guestPhone}
                onChange={(guestPhone) =>
                  setFormData({ ...formData, guestPhone })
                }
                label=""
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Guest Email
              </label>
              <EmailInput
                value={formData.guestEmail}
                onChange={(guestEmail) =>
                  setFormData({ ...formData, guestEmail })
                }
                label=""
              />
            </div>
          </div>

          {/* STEP 3: Route (ONE_WAY) or Hours (HOURLY) */}
          {tripType === "HOURLY" ? (
            // For HOURLY, the partner picks hours — not a tier. The
            // routeId is auto-set by fetchRoutes() to satisfy the
            // backend; the calculator derives the rate from hours.
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Step 3: Hours *
              </label>
              {loadingRoutes ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-neutral-800 rounded-lg">
                  <Loader2 className="w-4 h-4 text-luxury-gold animate-spin" />
                  <span className="text-sm text-gray-400">
                    Loading hourly rates...
                  </span>
                </div>
              ) : routes.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <p className="text-sm text-amber-400">
                    Hourly bookings are not available for{" "}
                    {CITIES.find((c) => c.id === city)?.name || city}. Please
                    contact admin or pick a different city.
                  </p>
                </div>
              ) : (
                <select
                  required
                  value={formData.hours}
                  onChange={(e) =>
                    setFormData({ ...formData, hours: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                >
                  <option value="">Select number of hours...</option>
                  {[4, 6, 8, 10, 12].map((h) => (
                    <option key={h} value={h}>
                      {h} hours
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Step 3: Select Route *
              </label>
              {loadingRoutes ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-neutral-800 rounded-lg">
                  <Loader2 className="w-4 h-4 text-luxury-gold animate-spin" />
                  <span className="text-sm text-gray-400">
                    Loading routes...
                  </span>
                </div>
              ) : (
                <select
                  required
                  value={formData.routeId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      routeId: e.target.value,
                      pickupAddress: "",
                      pickupLat: null,
                      pickupLng: null,
                      dropoffAddress: "",
                      dropoffLat: null,
                      dropoffLng: null,
                    })
                  }
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                >
                  <option value="">Select a route...</option>
                  {routes
                    .filter((r) => !r.isExtraHour)
                    .map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.pickupLocation} → {route.dropoffLocation}
                        {route.isPerKm ? " (Per KM)" : ""}
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}

          {/* STEP 4: Precise Pickup & Dropoff with Google Places */}
          {selectedRoute && (
            <div className="p-4 bg-neutral-800/30 rounded-lg border border-neutral-700/50 space-y-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-luxury-gold" />
                <p className="text-sm text-luxury-gold font-medium">
                  Enter precise locations
                </p>
              </div>
              <p className="text-xs text-gray-500 -mt-2">
                Start typing to search for the exact address within{" "}
                {CITIES.find((c) => c.id === city)?.name || city}.
              </p>

              {mapsLoaded ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <PlacesAutocompleteInput
                    label="Pickup Address *"
                    value={formData.pickupAddress}
                    placeholder={
                      selectedRoute.pickupLocation ||
                      "Search pickup location..."
                    }
                    required
                    cityBias={cityBias}
                    icon="pickup"
                    onChange={(val) =>
                      setFormData({
                        ...formData,
                        pickupAddress: val,
                        pickupLat: null,
                        pickupLng: null,
                      })
                    }
                    onSelect={(addr, lat, lng) =>
                      setFormData({
                        ...formData,
                        pickupAddress: addr,
                        pickupLat: lat,
                        pickupLng: lng,
                      })
                    }
                  />
                  {tripType === "ONE_WAY" && (
                    <PlacesAutocompleteInput
                      label="Drop-off Address *"
                      value={formData.dropoffAddress}
                      placeholder={
                        selectedRoute.dropoffLocation ||
                        "Search drop-off location..."
                      }
                      required
                      cityBias={cityBias}
                      icon="dropoff"
                      onChange={(val) =>
                        setFormData({
                          ...formData,
                          dropoffAddress: val,
                          dropoffLat: null,
                          dropoffLng: null,
                        })
                      }
                      onSelect={(addr, lat, lng) =>
                        setFormData({
                          ...formData,
                          dropoffAddress: addr,
                          dropoffLat: lat,
                          dropoffLng: lng,
                        })
                      }
                    />
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-green-400" /> Pickup
                      Address *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.pickupAddress}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          pickupAddress: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                      placeholder={selectedRoute.pickupLocation}
                    />
                  </div>
                  {tripType === "ONE_WAY" && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-red-400" /> Drop-off
                        Address *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.dropoffAddress}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            dropoffAddress: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                        placeholder={selectedRoute.dropoffLocation}
                      />
                    </div>
                  )}
                  {mapsError && (
                    <p className="sm:col-span-2 text-xs text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Google Maps
                      unavailable. Enter address manually.
                    </p>
                  )}
                </div>
              )}

              {/* Pinpoint status indicators */}
              <div className="flex gap-4 text-xs">
                <span
                  className={`flex items-center gap-1 ${formData.pickupLat ? "text-green-400" : "text-gray-500"}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${formData.pickupLat ? "bg-green-400" : "bg-gray-600"}`}
                  />
                  Pickup{" "}
                  {formData.pickupLat ? "pinpointed" : "not pinpointed yet"}
                </span>
                {tripType === "ONE_WAY" && (
                  <span
                    className={`flex items-center gap-1 ${formData.dropoffLat ? "text-green-400" : "text-gray-500"}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${formData.dropoffLat ? "bg-green-400" : "bg-gray-600"}`}
                    />
                    Drop-off{" "}
                    {formData.dropoffLat ? "pinpointed" : "not pinpointed yet"}
                  </span>
                )}
              </div>

              {/* Airport fields */}
              {showAirportFields && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-neutral-700/50">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      <Plane className="w-4 h-4 inline mr-1" /> Flight Number *
                    </label>
                    <input
                      type="text"
                      value={formData.flightNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          flightNumber: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                      placeholder="e.g. SV123"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Terminal No.
                    </label>
                    <input
                      type="text"
                      value={formData.terminalNo}
                      onChange={(e) =>
                        setFormData({ ...formData, terminalNo: e.target.value })
                      }
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                      placeholder="e.g. T1, T2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Terminal Location
                    </label>
                    <input
                      type="text"
                      value={formData.terminalLocation}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          terminalLocation: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
                      placeholder="e.g. Arrivals"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: Date, Time, Passengers
              (Hours moved to Step 3 for HOURLY trip type.) */}
          <div className="grid gap-4 grid-cols-3">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Date *</label>
              <input
                type="date"
                required
                value={formData.tripDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) =>
                  setFormData({ ...formData, tripDate: e.target.value })
                }
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Time *</label>
              <input
                type="time"
                required
                value={formData.tripTime}
                onChange={(e) =>
                  setFormData({ ...formData, tripTime: e.target.value })
                }
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Passengers *
              </label>
              <select
                value={formData.passengers}
                onChange={(e) =>
                  setFormData({ ...formData, passengers: e.target.value })
                }
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none"
              >
                {PASSENGER_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "Passenger" : "Passengers"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Passenger limit warning */}
          {selectedVehicle &&
            parseInt(formData.passengers) > selectedVehicle.maxPassengers && (
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-400">
                  {selectedVehicle.label} supports max{" "}
                  {selectedVehicle.maxPassengers} passengers.
                </p>
              </div>
            )}

          {/* STEP 6: Vehicle Class */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Step 6: Vehicle Class *
            </label>
            {loadingVehicles ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-neutral-800 rounded-lg">
                <Loader2 className="w-4 h-4 text-luxury-gold animate-spin" />
                <span className="text-sm text-gray-400">
                  Loading vehicles...
                </span>
              </div>
            ) : tripType === "HOURLY" && !formData.hours && formData.routeId ? (
              // HOURLY-specific empty state: backend can't price vehicles
              // until the partner selects hours. Don't show a sea of
              // disabled options — just tell them what to do next.
              <p className="text-sm text-gray-400 px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-luxury-gold flex-shrink-0" />
                Select hours above to see vehicle prices.
              </p>
            ) : vehicles.length === 0 && formData.routeId ? (
              <p className="text-sm text-gray-500 px-4 py-3 bg-neutral-800 rounded-lg">
                No vehicles available for this route.
              </p>
            ) : (
              <select
                value={formData.vehicleClass}
                onChange={(e) =>
                  setFormData({ ...formData, vehicleClass: e.target.value })
                }
                className={`w-full px-4 py-3 rounded-lg text-white focus:outline-none transition-colors ${
                  isEcoSelected
                    ? "bg-green-900/30 border-2 border-green-500/50 focus:border-green-400"
                    : "bg-neutral-800 border border-neutral-700 focus:border-luxury-gold"
                }`}
              >
                <option value="">Select vehicle...</option>
                {Object.entries(groupedVehicles).map(([cat, items]) => (
                  <optgroup
                    key={cat}
                    label={CATEGORY_LABELS[cat] || cat.toUpperCase()}
                  >
                    {items.map((v) => {
                      // For HOURLY unavailable vehicles, surface the
                      // calculator's exact reason (e.g. "Per Hour Rate
                      // not configured for King Long in Riyadh") so
                      // the partner knows what's wrong and can escalate
                      // to admin if needed.
                      const reason =
                        !v.available && (v as any).unavailableReason
                          ? ` — ${(v as any).unavailableReason}`
                          : !v.available
                            ? " (Unavailable)"
                            : "";
                      return (
                        <option
                          key={v.vehicleClass}
                          value={v.vehicleClass}
                          disabled={!v.available}
                        >
                          {v.label}{" "}
                          {v.price !== null
                            ? `- SAR ${v.price.toLocaleString()}`
                            : ""}
                          {reason}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
            )}
            {isEcoSelected && (
              <div className="flex items-center gap-2 mt-2 text-green-400 text-xs">
                <Leaf className="w-3.5 h-3.5" />
                <span>Zero Emissions - Eco-Friendly Choice</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:border-luxury-gold focus:outline-none resize-none"
              rows={2}
              placeholder="Any special requests..."
            />
          </div>

          {/* Price Breakdown */}
          {loadingPrice && (
            <div className="flex items-center gap-2 px-4 py-3 bg-neutral-800/50 rounded-lg">
              <Loader2 className="w-4 h-4 text-luxury-gold animate-spin" />
              <span className="text-sm text-gray-400">
                Calculating price...
              </span>
            </div>
          )}
          {/* HOURLY pre-quote hint: vehicle picked but hours not yet selected. */}
          {!loadingPrice &&
            !priceBreakdown &&
            tripType === "HOURLY" &&
            formData.routeId &&
            formData.vehicleClass &&
            !formData.hours && (
              <div className="flex items-center gap-2 px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-lg">
                <AlertCircle className="w-4 h-4 text-luxury-gold flex-shrink-0" />
                <span className="text-sm text-gray-300">
                  Select the number of hours to see the price.
                </span>
              </div>
            )}
          {priceBreakdown && !loadingPrice && (
            <div
              className={`p-4 rounded-lg transition-all ${isEcoSelected ? "bg-gradient-to-r from-green-500/10 to-transparent border-2 border-green-500/40" : "bg-gradient-to-r from-luxury-gold/10 to-transparent border border-luxury-gold/30"}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {isEcoSelected ? (
                    <Leaf className="w-5 h-5 text-green-400" />
                  ) : (
                    <DollarSign className="w-5 h-5 text-luxury-gold" />
                  )}
                  <span className="text-sm font-medium text-white">
                    Price Breakdown
                  </span>
                </div>
                {isEcoSelected && (
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30">
                    Eco-Friendly
                  </span>
                )}
              </div>
              <div className="space-y-2 text-sm">
                {/* Hourly bracket breakdown — shown only when backend
                    returned an hourly quote (HOURLY trip type). The
                    line items here explain how the partner's chosen
                    hours mapped onto day rate / per-hour rate / extras,
                    so the price isn't a mystery number. */}
                {priceBreakdown.hourly && (
                  <>
                    {priceBreakdown.hourly.breakdown.map((line, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-gray-300"
                      >
                        <span>{line.label}</span>
                        <span>SAR {line.amount.toLocaleString()}</span>
                      </div>
                    ))}
                    <div className="border-t border-neutral-700/50 my-1" />
                  </>
                )}
                <div className="flex justify-between text-gray-400">
                  <span>
                    {priceBreakdown.hourly ? "Subtotal (ex. VAT)" : "Base Fare"}
                  </span>
                  <span>SAR {priceBreakdown.basePrice.toLocaleString()}</span>
                </div>
                {priceBreakdown.peakSurcharge > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>
                      Peak Surcharge ({priceBreakdown.peakMultiplier}x)
                    </span>
                    <span>
                      SAR {priceBreakdown.peakSurcharge.toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-gray-400">
                  <span>VAT (15%)</span>
                  <span>SAR {priceBreakdown.vatAmount.toLocaleString()}</span>
                </div>
                <div
                  className={`flex justify-between text-white font-semibold pt-2 border-t ${isEcoSelected ? "border-green-500/30" : "border-neutral-700"}`}
                >
                  <span>Total</span>
                  <span
                    className={`text-lg ${isEcoSelected ? "text-green-400" : "text-luxury-gold"}`}
                  >
                    SAR {priceBreakdown.totalPrice.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500">
            All prices inclusive of 15% VAT & Municipality taxes (SAR)
          </p>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !formData.routeId ||
                !formData.vehicleClass ||
                !formData.tripDate ||
                !formData.tripTime ||
                !formData.guestName ||
                !canBookRide
              }
              title={canBookRide ? undefined : bookLockReason}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                !canBookRide
                  ? "bg-neutral-800 text-gray-500"
                  : isEcoSelected
                    ? "bg-green-500 text-white hover:bg-green-600"
                    : "bg-luxury-gold text-black hover:bg-luxury-gold/90"
              }`}
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : !canBookRide ? (
                <ShieldAlert className="w-5 h-5" />
              ) : isEcoSelected ? (
                <Leaf className="w-5 h-5" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
              {isSubmitting
                ? "Booking..."
                : !canBookRide
                  ? hasExpiredDocs
                    ? "Booking Locked — Renew Documents"
                    : "Booking Unavailable"
                  : priceBreakdown
                    ? `${isEcoSelected ? "Book Eco Ride" : "Book Ride"} - SAR ${priceBreakdown.totalPrice.toLocaleString()}`
                    : "Book Ride"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
