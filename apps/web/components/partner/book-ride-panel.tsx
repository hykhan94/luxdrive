// ============================================
// apps/web/components/partner/book-ride-panel.tsx
//
// Partner Portal — Book a Ride (post partner-priced refactor).
//
// The partner now sets the total price directly — there are no
// admin-defined tariffs to look up. The novel piece of UI in this
// panel is the "receipt card": a single hero SAR input that
// dominates the page, with base + VAT + total dropping out
// automatically as the partner types. It reads like an invoice
// preview, which is exactly what the partner will see on the PO
// after the booking is created — no surprises.
//
// Vehicle-class options are filtered by the selected city's per-city
// flags (electricEnabled, ultraLuxuryEnabled) which come from
// partnerApi.getCities().
// ============================================

"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { partnerApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import { useLoadScript, Autocomplete } from "@react-google-maps/api";
import { PhoneInput, EmailInput } from "@/components/ui/form-fields";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Loader2,
  Plane,
  MapPin,
  Users,
  Calendar,
  Clock,
  Car,
  Crown,
  Zap,
  StickyNote,
  Send,
  AlertCircle,
  Route,
  Info,
  ShieldAlert,
} from "lucide-react";

// Google Maps libraries to load
const GOOGLE_MAPS_LIBRARIES: "places"[] = ["places"];

// Saudi VAT rate — matches server splitVatInclusive helper. The
// partner input is treated as VAT-inclusive so what they type here is
// EXACTLY what appears on the PO/invoice total line.
const VAT_RATE = 0.15;

// Max passenger cap per class — mirrors the server-side
// VEHICLE_MAX_PASSENGERS map. Duplicated here so the picker can
// validate before the API round-trip and gray out impossible combos.
const VEHICLE_MAX_PASSENGERS: Record<string, number> = {
  ECONOMY_SEDAN: 3,
  BUSINESS_SEDAN: 3,
  FIRST_CLASS: 3,
  BUSINESS_SUV: 7,
  ELECTRIC: 3,
  ULTRA_LUXURY: 2,
  HIACE: 10,
  COASTER: 23,
  KING_LONG: 49,
};

// Vehicle class metadata for the picker — order here is the
// visible order in the UI. Taglines use "or similar" wording since
// the exact model depends on which vendor is assigned to the booking.
const VEHICLE_CLASSES: Array<{
  code: string;
  label: string;
  tagline: string;
  requiresFlag?: "electric" | "ultraLuxury";
}> = [
  {
    code: "ECONOMY_SEDAN",
    label: "Economy Sedan",
    tagline: "Ford Taurus or similar — 3 pax",
  },
  {
    code: "BUSINESS_SEDAN",
    label: "Business Sedan",
    tagline: "Mercedes E-Class, BMW 5-Series or similar — 3 pax",
  },
  {
    code: "FIRST_CLASS",
    label: "First Class",
    tagline: "Mercedes S-Class, BMW 7-Series or similar — 3 pax",
  },
  {
    code: "BUSINESS_SUV",
    label: "Business SUV",
    tagline: "GMC Yukon, Chevrolet Tahoe or similar — 7 pax",
  },
  {
    code: "ELECTRIC",
    label: "Electric",
    tagline: "Lucid Air or similar — 3 pax",
    requiresFlag: "electric",
  },
  {
    code: "ULTRA_LUXURY",
    label: "Ultra Luxury",
    tagline: "Rolls, Bentley, Maybach — 2 pax",
    requiresFlag: "ultraLuxury",
  },
  { code: "HIACE", label: "HiAce", tagline: "10-seat van" },
  { code: "COASTER", label: "Coaster", tagline: "23-seat coach" },
  { code: "KING_LONG", label: "King Long", tagline: "49-seat coach" },
];

interface City {
  code: string;
  name: string;
  region: string | null;
  electricEnabled: boolean;
  ultraLuxuryEnabled: boolean;
}

interface BookRidePanelProps {
  // Called after a booking is successfully created. Parent uses this
  // to jump the partner to the Bookings tab and refresh sidebar
  // badges so the new booking's status counter shows up right away.
  onSuccess?: () => void;
  // Partner's current status — accepted for API compatibility with
  // the parent page but not gated on here (the parent's route-level
  // isActivePartner middleware already handles suspension routing,
  // and the backend rejects create if docs are invalid).
  partnerStatus?: string | null;
  // Any required documents that have expired. Shown as a warning
  // banner so the partner knows submit will be rejected before they
  // fill out the form.
  expiredRequiredDocs?: Array<{
    type: string;
    label: string;
    expiryDate: string;
  }>;
}

// ============================================
// Root component
// ============================================
export default function BookRidePanel({
  onSuccess,
  expiredRequiredDocs,
}: BookRidePanelProps = {}) {
  const notify = useNotification();
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [tripType, setTripType] = useState<"ONE_WAY" | "HOURLY">("ONE_WAY");
  const [cityCode, setCityCode] = useState("");
  const [vehicleClass, setVehicleClass] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [dropoffCoords, setDropoffCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [tripDate, setTripDate] = useState<string>("");
  const [tripTime, setTripTime] = useState("");
  const [hours, setHours] = useState<number | "">("");
  const [passengers, setPassengers] = useState<number | "">("");
  const [flightNumber, setFlightNumber] = useState("");
  const [totalPriceInput, setTotalPriceInput] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Google Places for pickup/dropoff. Same pattern already used
  // elsewhere in the app.
  const { isLoaded: mapsLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
    region: "SA",
    language: "en",
  });

  // Load active cities on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await partnerApi.getCities();
        setCities(res.data);
      } catch (err: any) {
        notify.showNotification(
          "error",
          err?.message || "Failed to load cities",
        );
      } finally {
        setCitiesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The currently-selected city record — used by the vehicle-class
  // picker to filter ELECTRIC and ULTRA_LUXURY, and by validation.
  const selectedCity = useMemo(
    () => cities.find((c) => c.code === cityCode) || null,
    [cities, cityCode],
  );

  // Vehicle classes available for the selected city. When no city is
  // picked yet, we show only the always-available classes so the
  // partner sees the picker but understands ELECTRIC / ULTRA_LUXURY
  // are city-gated.
  const availableClasses = useMemo(() => {
    return VEHICLE_CLASSES.filter((vc) => {
      if (vc.requiresFlag === "electric") {
        return selectedCity?.electricEnabled === true;
      }
      if (vc.requiresFlag === "ultraLuxury") {
        return selectedCity?.ultraLuxuryEnabled === true;
      }
      return true;
    });
  }, [selectedCity]);

  // Reset vehicle class if the selected one is no longer available
  // (partner switched city to one without ELECTRIC while ELECTRIC
  // was selected, for example).
  useEffect(() => {
    if (
      vehicleClass &&
      !availableClasses.some((c) => c.code === vehicleClass)
    ) {
      setVehicleClass("");
    }
  }, [availableClasses, vehicleClass]);

  // VAT split — the receipt card renders directly from this. Number()
  // handles the raw string input; empty/invalid → 0 so the preview
  // shows a clean SAR 0.00 initial state.
  const priceSplit = useMemo(() => {
    const total = Number(totalPriceInput.replace(/,/g, ""));
    if (!Number.isFinite(total) || total <= 0) {
      return { total: 0, base: 0, vat: 0, isValid: false };
    }
    const base = Math.round((total / (1 + VAT_RATE)) * 100) / 100;
    const vat = Math.round((total - base) * 100) / 100;
    return { total, base, vat, isValid: true };
  }, [totalPriceInput]);

  // Implied hourly rate — useful convenience hint for HOURLY bookings.
  // Divides the partner-set total by the hours they entered.
  const impliedHourly = useMemo(() => {
    if (tripType !== "HOURLY") return null;
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return null;
    if (!priceSplit.isValid) return null;
    return Math.round((priceSplit.total / h) * 100) / 100;
  }, [tripType, hours, priceSplit]);

  // Airport-address detection — same heuristic as the server (matches
  // /airport|intl|international|terminal|kaia|ruh|jed|med/i). If either
  // pickup or dropoff contains an airport token, we surface the flight
  // number field and require it.
  const isAirport = useMemo(() => {
    const combined = `${pickupAddress} ${dropoffAddress}`.toLowerCase();
    return /\b(airport|intl|international|terminal|kaia|ruh|jed|med)\b/.test(
      combined,
    );
  }, [pickupAddress, dropoffAddress]);

  // Max passengers for the currently-selected vehicle class. Drives the
  // passenger input max/hint.
  const maxPax = vehicleClass
    ? VEHICLE_MAX_PASSENGERS[vehicleClass] || null
    : null;

  // ============== Validation ==============
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!guestName.trim()) e.guestName = "Guest name is required";
    if (!guestPhone.trim()) e.guestPhone = "Guest phone is required";
    if (!cityCode) e.city = "Select a city";
    if (!vehicleClass) e.vehicleClass = "Select a vehicle class";
    if (!pickupAddress.trim()) e.pickup = "Pickup address is required";
    if (tripType === "ONE_WAY" && !dropoffAddress.trim())
      e.dropoff = "Drop-off address is required";
    if (!tripDate) e.tripDate = "Trip date is required";
    if (!tripTime) e.tripTime = "Trip time is required";
    if (tripType === "HOURLY") {
      const h = Number(hours);
      if (!Number.isFinite(h) || h <= 0)
        e.hours = "Enter number of hours (> 0)";
    }
    if (!priceSplit.isValid) e.totalPrice = "Enter a total price";
    if (maxPax && passengers && Number(passengers) > maxPax) {
      // Look up the friendly label from the class metadata so the
      // error reads "Business Sedan seats 3" not "BUSINESS_SEDAN seats 3".
      const vc = VEHICLE_CLASSES.find((v) => v.code === vehicleClass);
      const label = vc?.label || vehicleClass;
      e.passengers =
        `Too many passengers for ${label}. This vehicle class seats ${maxPax} passenger${maxPax === 1 ? "" : "s"} — ` +
        `you entered ${Number(passengers)}. Reduce the passenger count or pick a larger vehicle class.`;
    }
    if (isAirport && !flightNumber.trim()) {
      e.flightNumber = "Flight number required for airport bookings";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ============== Submit ==============
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      notify.showNotification(
        "error",
        "Please fix the highlighted fields before submitting.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail.trim() || undefined,
        tripType,
        city: cityCode,
        vehicleClass,
        pickupAddress: pickupAddress.trim(),
        dropoffAddress: (dropoffAddress || pickupAddress).trim(),
        pickupLat: pickupCoords?.lat,
        pickupLng: pickupCoords?.lng,
        dropoffLat: dropoffCoords?.lat,
        dropoffLng: dropoffCoords?.lng,
        tripDate,
        tripTime,
        totalPrice: priceSplit.total,
        notes: notes.trim() || undefined,
      };
      if (tripType === "HOURLY") body.hours = Number(hours);
      if (passengers) body.passengers = Number(passengers);
      if (isAirport && flightNumber.trim())
        body.flightNumber = flightNumber.trim();

      const res = await partnerApi.createBooking(body);
      notify.showNotification(
        "success",
        `Booking ${res.data.bookingRef} created`,
      );
      // Reset form for the next booking
      resetForm();
      // Notify parent so it can navigate to Bookings + refresh badges
      onSuccess?.();
    } catch (err: any) {
      notify.showNotification(
        "error",
        err?.message || "Failed to create booking",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setTripType("ONE_WAY");
    setCityCode("");
    setVehicleClass("");
    setPickupAddress("");
    setPickupCoords(null);
    setDropoffAddress("");
    setDropoffCoords(null);
    setTripDate("");
    setTripTime("");
    setHours("");
    setPassengers("");
    setFlightNumber("");
    setTotalPriceInput("");
    setNotes("");
    setErrors({});
  }

  // ============== Render ==============
  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto min-w-0">
      {/* Browser autofill on inputs paints a white background by default.
          These overrides force our dark theme through the autofill
          shadow. Same trick used across the vendor/partner portals. */}
      <style jsx>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px #262626 inset !important;
          -webkit-text-fill-color: #ffffff !important;
          caret-color: #ffffff !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
      <div className="mb-6">
        <div className="text-2xl font-semibold text-white font-sans">
          Book a Ride
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Enter the ride details and the total the client is paying — LuxDrive
          will assign a vendor.
        </p>
      </div>

      {/* Expired-docs warning banner. Backend will reject submit anyway
          via requireApprovedAndDocsValid — surfacing it up front avoids
          the partner filling out the whole form before finding out. */}
      {expiredRequiredDocs && expiredRequiredDocs.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-amber-900">
                Booking is paused — required documents have expired
              </p>
              <p className="text-amber-800 mt-1">
                Renew the following before creating new bookings:{" "}
                {expiredRequiredDocs.map((d, i) => (
                  <span key={d.type}>
                    {i > 0 && ", "}
                    <span className="font-medium">{d.label}</span>
                  </span>
                ))}
                .
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="grid lg:grid-cols-3 gap-6">
        {/* ============ Left column: form fields ============ */}
        <div className="lg:col-span-2 space-y-6">
          <Section title="Guest">
            <FormRow>
              <Field label="Guest name" required error={errors.guestName}>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className={inputClass(!!errors.guestName)}
                  placeholder="Full name"
                />
              </Field>
              <Field label="Phone" required error={errors.guestPhone}>
                <PhoneInput
                  value={guestPhone}
                  onChange={setGuestPhone}
                  defaultCountry="SA"
                  label=""
                />
              </Field>
            </FormRow>
            <Field label="Email (optional)">
              <EmailInput
                value={guestEmail}
                onChange={setGuestEmail}
                label=""
              />
            </Field>
          </Section>

          <Section title="Trip">
            {/* Trip type — two-tab toggle */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <TripTypeButton
                active={tripType === "ONE_WAY"}
                onClick={() => setTripType("ONE_WAY")}
                icon={<Route className="w-4 h-4" />}
                label="One-way"
                subtitle="Point-to-point"
              />
              <TripTypeButton
                active={tripType === "HOURLY"}
                onClick={() => setTripType("HOURLY")}
                icon={<Clock className="w-4 h-4" />}
                label="Hourly"
                subtitle="By-the-hour"
              />
            </div>

            <FormRow>
              <Field label="City" required error={errors.city}>
                {citiesLoading ? (
                  <div className="h-10 flex items-center px-3 border border-neutral-700 rounded-lg bg-neutral-800/50">
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
                  </div>
                ) : (
                  <select
                    value={cityCode}
                    onChange={(e) => setCityCode(e.target.value)}
                    className={inputClass(!!errors.city)}
                  >
                    <option value="">Select city…</option>
                    {cities.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                        {c.region ? ` · ${c.region}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {tripType === "HOURLY" && (
                <Field label="Hours" required error={errors.hours}>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={hours}
                    onChange={(e) =>
                      setHours(
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className={inputClass(!!errors.hours)}
                    placeholder="e.g. 4"
                  />
                </Field>
              )}
            </FormRow>

            {/* Vehicle class chips */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-neutral-300 mb-2">
                Vehicle class <span className="text-red-500">*</span>
              </label>
              {!cityCode && (
                <div className="text-xs text-neutral-500 mb-2 flex items-center gap-1.5">
                  <Info className="w-3 h-3" />
                  Select a city first — Electric and Ultra Luxury availability
                  is per-city.
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableClasses.map((vc) => (
                  <VehicleChip
                    key={vc.code}
                    active={vehicleClass === vc.code}
                    onClick={() => setVehicleClass(vc.code)}
                    label={vc.label}
                    tagline={vc.tagline}
                    icon={vehicleIcon(vc.code)}
                  />
                ))}
              </div>
              {errors.vehicleClass && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.vehicleClass}
                </p>
              )}
            </div>
          </Section>

          <Section title="Locations">
            <Field
              label="Pickup address"
              required
              error={errors.pickup}
              icon={<MapPin className="w-4 h-4 text-neutral-500" />}
            >
              <PlacesInput
                mapsLoaded={mapsLoaded}
                value={pickupAddress}
                onChange={setPickupAddress}
                onSelect={(addr, coords) => {
                  setPickupAddress(addr);
                  setPickupCoords(coords);
                }}
                placeholder="Address or landmark"
                hasError={!!errors.pickup}
              />
            </Field>
            {tripType === "ONE_WAY" && (
              <Field
                label="Drop-off address"
                required
                error={errors.dropoff}
                icon={<MapPin className="w-4 h-4 text-neutral-500" />}
              >
                <PlacesInput
                  mapsLoaded={mapsLoaded}
                  value={dropoffAddress}
                  onChange={setDropoffAddress}
                  onSelect={(addr, coords) => {
                    setDropoffAddress(addr);
                    setDropoffCoords(coords);
                  }}
                  placeholder="Address or landmark"
                  hasError={!!errors.dropoff}
                />
              </Field>
            )}

            {/* Airport heuristic surfaces flight number */}
            {isAirport && (
              <Field
                label="Flight number"
                required
                error={errors.flightNumber}
                icon={<Plane className="w-4 h-4 text-luxury-gold" />}
              >
                <input
                  type="text"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  className={inputClass(!!errors.flightNumber)}
                  placeholder="e.g. SV1005"
                />
              </Field>
            )}
          </Section>

          <Section title="When">
            <FormRow>
              <Field
                label="Trip date"
                required
                error={errors.tripDate}
                icon={<Calendar className="w-4 h-4 text-neutral-500" />}
              >
                <DatePicker
                  value={tripDate}
                  onChange={setTripDate}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </Field>
              <Field
                label="Trip time"
                required
                error={errors.tripTime}
                icon={<Clock className="w-4 h-4 text-neutral-500" />}
              >
                <TimePicker value={tripTime} onChange={setTripTime} />
              </Field>
            </FormRow>
            <FormRow>
              <Field
                label="Passengers (optional)"
                error={
                  // Live check — surfaces the error the moment the
                  // partner types over the limit rather than waiting
                  // until submit. Same wording as validate() so nothing
                  // changes when they hit submit.
                  errors.passengers ||
                  (maxPax && passengers && Number(passengers) > maxPax
                    ? `Too many passengers for ${VEHICLE_CLASSES.find((v) => v.code === vehicleClass)?.label || vehicleClass}. ` +
                      `This vehicle class seats ${maxPax} passenger${maxPax === 1 ? "" : "s"} — ` +
                      `you entered ${Number(passengers)}.`
                    : undefined)
                }
                icon={<Users className="w-4 h-4 text-neutral-500" />}
              >
                <input
                  type="number"
                  min="1"
                  max={maxPax || undefined}
                  value={passengers}
                  onChange={(e) =>
                    setPassengers(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  className={inputClass(
                    !!errors.passengers ||
                      !!(maxPax && passengers && Number(passengers) > maxPax),
                  )}
                  placeholder={
                    maxPax ? `Max ${maxPax} for this vehicle` : "e.g. 2"
                  }
                />
              </Field>
              <div />
            </FormRow>
          </Section>

          <Section title="Notes (optional)">
            <Field icon={<StickyNote className="w-4 h-4 text-neutral-500" />}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${inputClass(false)} min-h-[80px] resize-y`}
                placeholder="Anything the vendor should know — luggage, special requests, etc."
              />
            </Field>
          </Section>
        </div>

        {/* ============ Right column: sticky receipt card ============ */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <ReceiptCard
              totalPriceInput={totalPriceInput}
              onChange={setTotalPriceInput}
              split={priceSplit}
              impliedHourly={impliedHourly}
              tripType={tripType}
              error={errors.totalPrice}
            />
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-luxury-gold hover:bg-luxury-gold/90 disabled:opacity-50 disabled:cursor-not-allowed text-black rounded-lg font-medium transition-colors shadow-sm"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? "Submitting…" : "Submit booking"}
            </button>
            <p className="text-xs text-neutral-500 mt-3 text-center">
              LuxDrive will assign a vendor and confirm shortly.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}

// ============================================
// The Tap-Fare card — mobile-first price entry.
//
// Design goal: on mobile, keyboards are slow and error-prone. The
// partner shouldn't have to type "1250.00" to price a fare — they
// should be able to tap once for a common preset, then fine-tune by
// tapping ±100 or ±50 buttons. Typing exact amounts remains available
// via the hero display (also editable) for edge cases.
//
// The receipt-style dashed separator + running VAT breakdown is
// preserved so what the partner sees here matches the PO/invoice
// the vendor will see — no surprise translation between screens.
// ============================================
function ReceiptCard({
  totalPriceInput,
  onChange,
  split,
  impliedHourly,
  tripType,
  error,
}: {
  totalPriceInput: string;
  onChange: (v: string) => void;
  split: { total: number; base: number; vat: number; isValid: boolean };
  impliedHourly: number | null;
  tripType: "ONE_WAY" | "HOURLY";
  error?: string;
}) {
  // Sanitize keystrokes so the input accepts digits + a single decimal
  // separator only. We store the raw string so the user can type
  // "1200." mid-entry without React clobbering it.
  function handleInput(raw: string) {
    const cleaned = raw.replace(/[^\d.,]/g, "");
    onChange(cleaned);
  }

  // Preset amounts vary by trip type — typical KSA totals a partner
  // would book at. HOURLY skews higher (4hr/8hr/12hr blocks); ONE_WAY
  // covers airport transfers to inter-city.
  const presets =
    tripType === "HOURLY"
      ? [400, 800, 1200, 1600, 2400]
      : [250, 500, 800, 1200, 2000];

  // Fine-tune steps. On mobile tapping these is faster than typing.
  const stepButtons = [-500, -100, -50, 50, 100, 500];

  function setAmount(next: number) {
    // Clamp at zero (no negative fares). Round to 2dp for tidy display.
    const clamped = Math.max(0, next);
    onChange(clamped ? clamped.toFixed(2) : "");
  }

  function step(delta: number) {
    const current = Number(totalPriceInput.replace(/,/g, "")) || 0;
    setAmount(current + delta);
  }

  function clear() {
    onChange("");
  }

  return (
    <div className="relative bg-neutral-900 rounded-xl border-2 border-luxury-gold/40 shadow-sm overflow-hidden">
      {/* Subtle top gold band, like a real receipt header */}
      <div className="h-1.5 bg-gradient-to-r from-luxury-gold via-luxury-gold/70 to-luxury-gold" />

      <div className="p-4 sm:p-5 space-y-4">
        {/* ============== Hero display ============== */}
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[10px] sm:text-xs font-medium tracking-widest text-luxury-gold uppercase">
              Total payable
            </div>
            <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
              VAT-inclusive
            </div>
          </div>

          {/* The hero display doubles as an input for exact typing. On
              mobile it uses inputMode="decimal" so the numeric keyboard
              opens. Chips + step buttons below make typing optional. */}
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xs sm:text-sm font-medium text-neutral-500 uppercase">
              SAR
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={totalPriceInput}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="0.00"
              className="flex-1 text-3xl sm:text-4xl font-bold text-white bg-transparent border-none outline-none focus:ring-0 placeholder:text-neutral-600 min-w-0 tabular-nums"
              aria-label="Total price (SAR)"
            />
            {totalPriceInput && (
              <button
                type="button"
                onClick={clear}
                className="text-[10px] text-neutral-500 hover:text-neutral-300 uppercase tracking-wider"
                aria-label="Clear amount"
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <div className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3" />
              {error}
            </div>
          )}
        </div>

        {/* ============== Preset chips ==============
            Tap once to jump to a common amount. Wraps naturally on
            small screens. Active state = current amount matches exactly. */}
        <div>
          <div className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-2">
            Quick amounts
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {presets.map((amount) => {
              const isActive = Math.abs(split.total - amount) < 0.01;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setAmount(amount)}
                  className={`px-2 py-2 rounded-lg text-xs sm:text-sm font-medium tabular-nums transition-colors ${
                    isActive
                      ? "bg-luxury-gold text-black"
                      : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700 active:bg-neutral-600"
                  }`}
                >
                  {formatCompact(amount)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ============== Fine-tune row ==============
            One-tap increments for adjusting the amount without opening
            the keyboard. Disabled state on decrements when we'd go
            below zero to avoid visual "why isn't this working?". */}
        <div>
          <div className="text-[10px] font-medium text-neutral-500 uppercase tracking-widest mb-2">
            Fine-tune
          </div>
          <div className="grid grid-cols-6 gap-1">
            {stepButtons.map((delta) => {
              const current = Number(totalPriceInput.replace(/,/g, "")) || 0;
              const wouldGoNegative = delta < 0 && current + delta < 0;
              return (
                <button
                  key={delta}
                  type="button"
                  onClick={() => step(delta)}
                  disabled={wouldGoNegative}
                  className={`px-1 py-2 rounded-md text-[11px] sm:text-xs font-medium tabular-nums transition-colors ${
                    delta > 0
                      ? "bg-luxury-gold/10 text-luxury-gold hover:bg-luxury-gold/20 border border-luxury-gold/30"
                      : "bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700 border border-neutral-700"
                  } disabled:opacity-30 disabled:cursor-not-allowed active:scale-95`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dashed separator, receipt-style */}
        <div className="border-t-2 border-dashed border-neutral-800" />

        {/* Live breakdown — read-only, no form controls */}
        <div
          className="space-y-2 text-sm"
          aria-live="polite"
          aria-label="VAT breakdown"
        >
          <BreakdownRow
            label="Base fare"
            hint="ex-VAT 15%"
            amount={split.base}
            muted
          />
          <BreakdownRow label="VAT (15%)" amount={split.vat} muted />
          <div className="border-t border-neutral-800 my-2" />
          <BreakdownRow label="Total" amount={split.total} bold />
        </div>

        {/* Hourly implied rate hint — only shows for HOURLY when
            enough info is present. Same figure will appear on the PO. */}
        {tripType === "HOURLY" && impliedHourly !== null && (
          <div className="rounded-lg bg-luxury-gold/10 border border-luxury-gold/30 px-3 py-2 text-xs text-luxury-gold flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Implied rate:{" "}
            <span className="font-semibold">
              SAR {formatMoney(impliedHourly)} / hour
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  hint,
  amount,
  muted,
  bold,
}: {
  label: string;
  hint?: string;
  amount: number;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <div
        className={`${bold ? "font-semibold text-white" : muted ? "text-neutral-500" : "text-neutral-300"}`}
      >
        {label}
        {hint && (
          <span className="ml-1 text-[10px] text-neutral-500 uppercase tracking-wider">
            {hint}
          </span>
        )}
      </div>
      <div
        className={`${bold ? "text-lg font-bold text-white" : muted ? "text-neutral-500" : "text-white"} tabular-nums`}
      >
        SAR {formatMoney(amount)}
      </div>
    </div>
  );
}

// ============================================
// Small components — sections, fields, chips
// ============================================
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-5">
      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-4">
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label,
  required,
  error,
  icon,
  children,
}: {
  label?: string;
  required?: boolean;
  error?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-neutral-300 mb-1">
          <span className="inline-flex items-center gap-1.5">
            {icon}
            {label}
          </span>
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function TripTypeButton({
  active,
  onClick,
  icon,
  label,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 rounded-lg border text-left transition-colors ${
        active
          ? "border-luxury-gold bg-luxury-gold/10"
          : "border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`${active ? "text-luxury-gold" : "text-neutral-500"}`}>
          {icon}
        </span>
        <span
          className={`text-sm font-medium ${active ? "text-white" : "text-neutral-300"}`}
        >
          {label}
        </span>
      </div>
      <div className="text-xs text-neutral-500 mt-0.5 ml-6">{subtitle}</div>
    </button>
  );
}

function VehicleChip({
  active,
  onClick,
  label,
  tagline,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tagline: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2.5 rounded-lg border text-left transition-colors ${
        active
          ? "border-luxury-gold bg-luxury-gold/10 ring-1 ring-luxury-gold/30"
          : "border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={active ? "text-luxury-gold" : "text-neutral-500"}>
          {icon}
        </span>
        <span
          className={`text-sm font-medium ${active ? "text-white" : "text-neutral-300"}`}
        >
          {label}
        </span>
      </div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{tagline}</div>
    </button>
  );
}

function PlacesInput({
  mapsLoaded,
  value,
  onChange,
  onSelect,
  placeholder,
  hasError,
}: {
  mapsLoaded: boolean;
  value: string;
  onChange: (v: string) => void;
  onSelect: (addr: string, coords: { lat: number; lng: number } | null) => void;
  placeholder: string;
  hasError: boolean;
}) {
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  function handlePlaceSelected() {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();
    const addr = place.formatted_address || place.name || value;
    const loc = place.geometry?.location;
    const coords = loc ? { lat: loc.lat(), lng: loc.lng() } : null;
    onSelect(addr, coords);
  }

  if (!mapsLoaded) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass(hasError)}
      />
    );
  }

  return (
    <Autocomplete
      onLoad={(ac) => (autocompleteRef.current = ac)}
      onPlaceChanged={handlePlaceSelected}
      restrictions={{ country: "sa" }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass(hasError)}
      />
    </Autocomplete>
  );
}

// ============================================
// Utils
// ============================================
function inputClass(hasError: boolean) {
  return `w-full px-3 py-2 border rounded-lg text-sm bg-neutral-800 text-white placeholder:text-neutral-500 transition-colors focus:outline-none ${
    hasError
      ? "border-red-500/50 focus:border-red-500"
      : "border-neutral-700 focus:border-luxury-gold"
  }`;
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Compact formatter for the preset chips — shows "1.5K" instead of
// "1,500" so chip text stays readable at small mobile widths.
function formatCompact(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}

function vehicleIcon(code: string): React.ReactNode {
  if (code === "ELECTRIC") return <Zap className="w-3.5 h-3.5" />;
  if (code === "ULTRA_LUXURY") return <Crown className="w-3.5 h-3.5" />;
  if (code === "FIRST_CLASS") return <Crown className="w-3.5 h-3.5" />;
  return <Car className="w-3.5 h-3.5" />;
}
