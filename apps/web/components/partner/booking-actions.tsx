"use client";

// ============================================
// !!! DESTINATION PATH: apps/web/components/partner/booking-actions.tsx
// ============================================
// Partner booking actions:
//   - ModifyBookingDrawer   — premium right slide-in to change a live booking:
//       * trip-type toggle (one-way / hourly)
//       * Google-Places pickup/drop-off (mirrors the Book-a-Ride form)
//       * themed DatePicker / TimePicker from components/ui
//       * airport-aware flight number + terminal + arrivals/departures,
//         with terminals keyed to the detected Saudi airport
//   - RequestDeletionDialog — confirm dialog to ask admin to delete it

import { useEffect, useMemo, useRef, useState } from "react";
import { useLoadScript, Autocomplete } from "@react-google-maps/api";
import {
  Loader2,
  X,
  Trash2,
  AlertTriangle,
  Route,
  Clock,
  MapPin,
  Navigation,
  CalendarDays,
  Car,
  Users,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Wallet,
  StickyNote,
  ArrowRight,
  Sparkles,
  Check,
  MessageCircle,
} from "lucide-react";
import { partnerApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { detectAirport } from "@/lib/saudi-airports";
import { openWhatsApp } from "@/lib/support-contact";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const GOOGLE_MAPS_LIBRARIES: "places"[] = ["places"];

// Subset of the partner BookingDetail this file relies on.
export interface ModifiableBooking {
  id: string;
  bookingRef: string;
  status: string;
  trip: {
    tripType: string;
    city: string;
    hours: number | null;
    hourlyDuration: string | null;
    pickupAddress: string;
    pickupLat?: number | null;
    pickupLng?: number | null;
    dropoffAddress: string;
    dropoffLat?: number | null;
    dropoffLng?: number | null;
    tripDate: string;
    tripTime: string;
    flightNumber: string | null;
    terminalNo?: string | null;
    terminalLocation?: string | null;
  };
  vehicle: {
    vehicleClass: string;
    passengers: number;
  };
  pricing: { totalPrice: number };
  notes: string | null;
}

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
    code: "BUSINESS_SUV",
    label: "Business SUV",
    tagline: "GMC Yukon, Chevrolet Tahoe or similar — 7 pax",
  },
  {
    code: "FIRST_CLASS",
    label: "First Class",
    tagline: "Mercedes S-Class, BMW 7-Series or similar — 3 pax",
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
  { code: "HIACE", label: "Hiace", tagline: "10-seat van" },
  { code: "COASTER", label: "Coaster", tagline: "23-seat coach" },
  { code: "KING_LONG", label: "King Long", tagline: "49-seat coach" },
];
const HOUR_PRESETS = [2, 4, 6, 8, 12];

function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const inputCls =
  "w-full px-3 py-2.5 rounded-lg bg-neutral-800/60 border border-neutral-700 text-white text-sm placeholder-neutral-500 transition-colors focus:outline-none focus:border-luxury-gold/70 focus:ring-2 focus:ring-luxury-gold/20";
const labelCls =
  "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1.5";

interface City {
  code: string;
  name: string;
  electricEnabled?: boolean;
  ultraLuxuryEnabled?: boolean;
}

// ============================================
// Places autocomplete input (mirrors book-ride-panel's PlacesInput)
// ============================================
function PlacesInput({
  mapsLoaded,
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  mapsLoaded: boolean;
  value: string;
  onChange: (v: string) => void;
  onSelect: (addr: string, coords: { lat: number; lng: number } | null) => void;
  placeholder: string;
}) {
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);
  function handlePlace() {
    if (!acRef.current) return;
    const place = acRef.current.getPlace();
    const addr = place.formatted_address || place.name || value;
    const loc = place.geometry?.location;
    onSelect(addr, loc ? { lat: loc.lat(), lng: loc.lng() } : null);
  }
  if (!mapsLoaded)
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    );
  return (
    <Autocomplete
      onLoad={(ac) => (acRef.current = ac)}
      onPlaceChanged={handlePlace}
      restrictions={{ country: "sa" }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </Autocomplete>
  );
}

function Section({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-luxury-gold/40 bg-luxury-gold/[0.05]"
          : "border-neutral-800 bg-neutral-900/50"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-luxury-gold">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

// ============================================
// ModifyBookingDrawer
// ============================================
export function ModifyBookingDrawer({
  booking,
  onClose,
  onSaved,
}: {
  booking: ModifiableBooking;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showNotification } = useNotification();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const { isLoaded: mapsLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const original = useMemo(() => {
    // If this is already an airport run, pre-fill arrivals/departures as a
    // sensible default (pickup at the airport ⇒ arriving) — baked into the
    // baseline so it doesn't register as a phantom "change".
    const initAirportPickup = detectAirport(booking.trip.pickupAddress);
    const initAirport =
      initAirportPickup || detectAirport(booking.trip.dropoffAddress);
    const defaultTermLoc =
      booking.trip.terminalLocation ??
      (initAirport ? (initAirportPickup ? "Arrivals" : "Departures") : "");
    return {
      tripType: booking.trip.tripType ?? "ONE_WAY",
      city: booking.trip.city ?? "",
      hours: booking.trip.hours ?? "",
      pickupAddress: booking.trip.pickupAddress ?? "",
      dropoffAddress: booking.trip.dropoffAddress ?? "",
      tripDate: isoToDateInput(booking.trip.tripDate),
      tripTime: booking.trip.tripTime ?? "",
      flightNumber: booking.trip.flightNumber ?? "",
      terminalNo: booking.trip.terminalNo ?? "",
      terminalLocation: defaultTermLoc,
      vehicleClass: booking.vehicle.vehicleClass ?? "",
      passengers: booking.vehicle.passengers ?? 1,
      totalPrice: booking.pricing.totalPrice ?? 0,
      notes: booking.notes ?? "",
    };
  }, [booking]);

  const [form, setForm] = useState(original);
  const [coords, setCoords] = useState<{
    pickupLat?: number;
    pickupLng?: number;
    dropoffLat?: number;
    dropoffLng?: number;
  }>({});
  const [reason, setReason] = useState("");

  const isHourly = form.tripType === "HOURLY";

  const pickupAirport = useMemo(
    () => detectAirport(form.pickupAddress),
    [form.pickupAddress],
  );
  const dropoffAirport = useMemo(
    () => (isHourly ? null : detectAirport(form.dropoffAddress)),
    [form.dropoffAddress, isHourly],
  );
  const airport = pickupAirport || dropoffAirport;
  const isAirport = !!airport;

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    let alive = true;
    partnerApi
      .getCities()
      .then((res: any) => {
        if (!alive) return;
        const list = Array.isArray(res?.data)
          ? res.data
          : (res?.data?.cities ?? []);
        setCities(
          list.map((c: any) => ({
            code: c.code,
            name: c.name,
            electricEnabled: c.electricEnabled,
            ultraLuxuryEnabled: c.ultraLuxuryEnabled,
          })),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const set = (key: keyof typeof form, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  const selectedCity = useMemo(
    () => cities.find((c) => c.code === form.city) || null,
    [cities, form.city],
  );

  // City-gated classes: ELECTRIC / ULTRA_LUXURY only appear where admin has
  // enabled them. The booking's current class always stays selectable so a
  // grandfathered trip never loses its value.
  const availableClasses = useMemo(() => {
    return VEHICLE_CLASSES.filter((vc) => {
      if (vc.requiresFlag === "electric")
        return selectedCity?.electricEnabled === true;
      if (vc.requiresFlag === "ultraLuxury")
        return selectedCity?.ultraLuxuryEnabled === true;
      return true;
    });
  }, [selectedCity]);

  const selectedClass = VEHICLE_CLASSES.find(
    (v) => v.code === form.vehicleClass,
  );

  // Disabled premium classes the partner can ask admin to enable here.
  const requestableClasses = useMemo(() => {
    const out: Array<{ code: string; label: string }> = [];
    // Don't offer to "request" a class the booking already uses (a
    // grandfathered class stays selectable in the dropdown), nor one that's
    // already enabled for the city.
    if (selectedCity && !selectedCity.electricEnabled)
      out.push({ code: "ELECTRIC", label: "Electric" });
    if (selectedCity && !selectedCity.ultraLuxuryEnabled)
      out.push({ code: "ULTRA_LUXURY", label: "Ultra Luxury" });
    return out;
  }, [selectedCity]);

  // Open WhatsApp to the support line instead of filing an in-app request.
  const requestClass = (_code: string, label: string) => {
    const cityName = selectedCity?.name || form.city || "the selected city";
    openWhatsApp(
      `Hello, I'd like to modify booking ${booking.bookingRef} to use the ${label} vehicle class in ${cityName}, but it isn't available. Could you enable ${label} for this trip?`,
    );
  };

  // Once the city's flags are known, clear a class the city no longer
  // offers so it doesn't linger in the field. The partner then re-picks.
  useEffect(() => {
    if (!selectedCity) return; // wait for city flags to load
    if (
      form.vehicleClass &&
      !availableClasses.some((c) => c.code === form.vehicleClass)
    ) {
      setForm((f) => ({ ...f, vehicleClass: "" }));
    }
  }, [selectedCity, availableClasses, form.vehicleClass]);

  const LABELS: Record<string, string> = {
    tripType: "Trip type",
    city: "City",
    hours: "Duration (hrs)",
    pickupAddress: "Pickup",
    dropoffAddress: "Drop-off",
    tripDate: "Date",
    tripTime: "Time",
    flightNumber: "Flight",
    terminalNo: "Terminal",
    terminalLocation: "Terminal area",
    vehicleClass: "Vehicle class",
    passengers: "Passengers",
    totalPrice: "Total (SAR)",
    notes: "Notes",
  };

  const AIRPORT_FIELDS = ["flightNumber", "terminalNo", "terminalLocation"];

  // Changed + relevant fields only. Airport fields are blanked when the
  // trip is no longer an airport run (so stale flight/terminal clears).
  const changes = useMemo(() => {
    const eff: Record<string, any> = { ...form };
    if (!isAirport) AIRPORT_FIELDS.forEach((f) => (eff[f] = ""));
    const out: Array<{ key: string; from: any; to: any }> = [];
    Object.keys(eff).forEach((k) => {
      if (k === "dropoffAddress" && isHourly) return;
      if (k === "hours" && !isHourly) return;
      if (k === "vehicleClass" && eff[k] === "") return; // unset — keep as-is
      if (eff[k] !== (original as any)[k])
        out.push({ key: k, from: (original as any)[k], to: eff[k] });
    });
    return out;
  }, [form, original, isHourly, isAirport]);

  const patch = useMemo(() => {
    const p: Record<string, any> = {};
    changes.forEach((c) => (p[c.key] = c.to));
    if (changes.some((c) => c.key === "pickupAddress")) {
      if (coords.pickupLat != null) p.pickupLat = coords.pickupLat;
      if (coords.pickupLng != null) p.pickupLng = coords.pickupLng;
    }
    if (changes.some((c) => c.key === "dropoffAddress") && !isHourly) {
      if (coords.dropoffLat != null) p.dropoffLat = coords.dropoffLat;
      if (coords.dropoffLng != null) p.dropoffLng = coords.dropoffLng;
    }
    return p;
  }, [changes, coords, isHourly]);

  const handleClose = () => {
    setOpen(false);
    setTimeout(onClose, 300);
  };

  const handleSubmit = async () => {
    if (changes.length === 0)
      return showNotification("error", "Change at least one field to save.");
    if (isHourly && (!form.hours || Number(form.hours) < 1))
      return showNotification(
        "error",
        "Add the number of hours for an hourly trip.",
      );
    setSaving(true);
    try {
      const res: any = await partnerApi.modifyBooking(booking.id, {
        patch,
        reason: reason.trim() || undefined,
      });
      const needsVendor = res?.data?.requiresVendorConsent;
      const reassigns = res?.data?.affectsAssignment;
      showNotification(
        "success",
        needsVendor
          ? "Changes sent — the vendor needs to accept the updated trip."
          : reassigns
            ? "Booking updated — the vehicle-class/city change means it'll be reassigned to a vendor that serves it."
            : `Booking ${booking.bookingRef} updated.`,
      );
      onSaved();
      handleClose();
    } catch (err: any) {
      showNotification("error", err?.message || "Couldn't save the changes.");
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: any) => (v == null || v === "" ? "—" : String(v));

  return (
    // z-50 (not higher) so the DatePicker/TimePicker popovers, which portal
    // to <body> at z-50, still render above the drawer. It stacks above the
    // detail modal (also z-50) because it mounts later in the DOM.
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-lg bg-neutral-950 border-l border-neutral-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-neutral-800">
          <div className="absolute inset-0 bg-gradient-to-br from-luxury-gold/15 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-luxury-gold/15 border border-luxury-gold/30 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-luxury-gold" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-lg leading-tight">
                  Modify booking
                </h2>
                <p className="text-xs text-luxury-gold/80 font-medium tracking-wide">
                  {booking.bookingRef}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-neutral-800 text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Trip type */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                type: "ONE_WAY",
                icon: <Route className="w-5 h-5" />,
                label: "One-way",
                sub: "Point-to-point",
              },
              {
                type: "HOURLY",
                icon: <Clock className="w-5 h-5" />,
                label: "Hourly",
                sub: "By-the-hour",
              },
            ].map((t) => {
              const active = form.tripType === t.type;
              return (
                <button
                  key={t.type}
                  onClick={() => set("tripType", t.type)}
                  className={`group relative flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    active
                      ? "border-luxury-gold bg-luxury-gold/10 ring-2 ring-luxury-gold/20"
                      : "border-neutral-700 bg-neutral-900/40 hover:border-neutral-600"
                  }`}
                >
                  <span
                    className={active ? "text-luxury-gold" : "text-gray-400"}
                  >
                    {t.icon}
                  </span>
                  <span>
                    <span
                      className={`block text-sm font-semibold ${active ? "text-white" : "text-gray-300"}`}
                    >
                      {t.label}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      {t.sub}
                    </span>
                  </span>
                  {active && (
                    <Check className="w-4 h-4 text-luxury-gold absolute top-2.5 right-2.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Route — Maps powered */}
          <Section
            icon={<MapPin className="w-4 h-4" />}
            title={isHourly ? "Pickup & duration" : "Route"}
          >
            <div className="space-y-3">
              <div>
                <label className={labelCls}>
                  <Navigation className="w-3 h-3" /> Pickup location
                </label>
                <PlacesInput
                  mapsLoaded={mapsLoaded}
                  value={form.pickupAddress}
                  onChange={(v) => set("pickupAddress", v)}
                  onSelect={(addr, c) => {
                    set("pickupAddress", addr);
                    setCoords((p) => ({
                      ...p,
                      pickupLat: c?.lat,
                      pickupLng: c?.lng,
                    }));
                  }}
                  placeholder="Search pickup…"
                />
              </div>

              {isHourly ? (
                <div>
                  <label className={labelCls}>
                    <Clock className="w-3 h-3" /> Duration
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {HOUR_PRESETS.map((h) => (
                      <button
                        key={h}
                        onClick={() => set("hours", h)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          Number(form.hours) === h
                            ? "border-luxury-gold bg-luxury-gold/10 text-luxury-gold"
                            : "border-neutral-700 text-gray-400 hover:border-neutral-600"
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-1">
                      <input
                        type="number"
                        min={1}
                        step={0.5}
                        value={form.hours}
                        onChange={(e) =>
                          set(
                            "hours",
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                        className="w-20 px-3 py-1.5 rounded-lg bg-neutral-800/60 border border-neutral-700 text-white text-sm focus:outline-none focus:border-luxury-gold/70"
                        placeholder="Custom"
                      />
                      <span className="text-xs text-gray-500">hrs</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className={labelCls}>
                    <MapPin className="w-3 h-3" /> Drop-off location
                  </label>
                  <PlacesInput
                    mapsLoaded={mapsLoaded}
                    value={form.dropoffAddress}
                    onChange={(v) => set("dropoffAddress", v)}
                    onSelect={(addr, c) => {
                      set("dropoffAddress", addr);
                      setCoords((p) => ({
                        ...p,
                        dropoffLat: c?.lat,
                        dropoffLng: c?.lng,
                      }));
                    }}
                    placeholder="Search drop-off…"
                  />
                </div>
              )}
            </div>
          </Section>

          {/* Airport details — only when pickup/drop-off is an airport */}
          {isAirport && (
            <Section
              icon={<Plane className="w-4 h-4" />}
              title="Airport details"
              accent
            >
              <p className="text-[11px] text-gray-400 -mt-1 mb-3">
                {airport?.code === "GENERIC"
                  ? "Airport pickup detected."
                  : airport?.name}
              </p>

              {/* Arrivals / Departures */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  {
                    v: "Arrivals",
                    icon: <PlaneLanding className="w-4 h-4" />,
                    sub: "Meeting a landing flight",
                  },
                  {
                    v: "Departures",
                    icon: <PlaneTakeoff className="w-4 h-4" />,
                    sub: "Dropping for a flight",
                  },
                ].map((o) => {
                  const active = form.terminalLocation === o.v;
                  return (
                    <button
                      key={o.v}
                      onClick={() => set("terminalLocation", o.v)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                        active
                          ? "border-luxury-gold bg-luxury-gold/10 text-luxury-gold"
                          : "border-neutral-700 text-gray-400 hover:border-neutral-600"
                      }`}
                    >
                      {o.icon}
                      <span>
                        <span className="block text-sm font-medium">{o.v}</span>
                        <span className="block text-[10px] text-gray-500">
                          {o.sub}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Terminal</label>
                  {airport && airport.terminals.length > 0 ? (
                    <Select
                      value={form.terminalNo || undefined}
                      onValueChange={(v) => set("terminalNo", v)}
                    >
                      <SelectTrigger className="w-full h-11 px-3 rounded-lg bg-neutral-800/60 border-neutral-700 text-white text-sm hover:bg-neutral-800 focus:border-luxury-gold/70 focus:ring-2 focus:ring-luxury-gold/20 data-[state=open]:border-luxury-gold/70">
                        <span
                          className={
                            form.terminalNo
                              ? "truncate text-white"
                              : "text-neutral-500"
                          }
                        >
                          {form.terminalNo || "Select terminal…"}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="z-[60] max-h-72 bg-neutral-900 border-neutral-700 text-white shadow-2xl">
                        {airport.terminals.map((t) => (
                          <SelectItem
                            key={t}
                            value={t}
                            className="rounded-md py-2 pr-8 text-white focus:bg-neutral-800 focus:text-white data-[state=checked]:text-luxury-gold"
                          >
                            {t}
                          </SelectItem>
                        ))}
                        {/* keep a previously-entered custom terminal selectable */}
                        {form.terminalNo &&
                          !airport.terminals.includes(form.terminalNo) && (
                            <SelectItem
                              value={form.terminalNo}
                              className="rounded-md py-2 pr-8 text-white focus:bg-neutral-800 focus:text-white data-[state=checked]:text-luxury-gold"
                            >
                              {form.terminalNo}
                            </SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <input
                      value={form.terminalNo}
                      onChange={(e) => set("terminalNo", e.target.value)}
                      className={inputCls}
                      placeholder="e.g. Terminal 1"
                    />
                  )}
                </div>
                <div>
                  <label className={labelCls}>
                    <Plane className="w-3 h-3" /> Flight number
                  </label>
                  <input
                    value={form.flightNumber}
                    onChange={(e) => set("flightNumber", e.target.value)}
                    className={inputCls}
                    placeholder="e.g. SV1023"
                  />
                </div>
              </div>
            </Section>
          )}

          {/* Schedule — themed pickers */}
          <Section icon={<CalendarDays className="w-4 h-4" />} title="Schedule">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Trip date</label>
                <DatePicker
                  value={form.tripDate}
                  onChange={(v) => set("tripDate", v)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <label className={labelCls}>Trip time</label>
                <TimePicker
                  value={form.tripTime}
                  onChange={(v) => set("tripTime", v)}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>City</label>
                <Select
                  value={form.city || undefined}
                  onValueChange={(v) => set("city", v)}
                >
                  <SelectTrigger className="w-full h-11 px-3 rounded-lg bg-neutral-800/60 border-neutral-700 text-white text-sm hover:bg-neutral-800 focus:border-luxury-gold/70 focus:ring-2 focus:ring-luxury-gold/20 data-[state=open]:border-luxury-gold/70">
                    <span className="truncate text-white">
                      {cities.find((c) => c.code === form.city)?.name ||
                        form.city ||
                        "Select a city…"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="z-[60] max-h-72 bg-neutral-900 border-neutral-700 text-white shadow-2xl">
                    {cities.map((c) => (
                      <SelectItem
                        key={c.code}
                        value={c.code}
                        className="rounded-md py-2 pr-8 text-white focus:bg-neutral-800 focus:text-white data-[state=checked]:text-luxury-gold"
                      >
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* Vehicle & price */}
          <Section icon={<Car className="w-4 h-4" />} title="Vehicle & price">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Vehicle class</label>
                <Select
                  value={form.vehicleClass || undefined}
                  onValueChange={(v) => set("vehicleClass", v)}
                >
                  <SelectTrigger className="w-full h-11 px-3 rounded-lg bg-neutral-800/60 border-neutral-700 text-white text-sm hover:bg-neutral-800 focus:border-luxury-gold/70 focus:ring-2 focus:ring-luxury-gold/20 data-[state=open]:border-luxury-gold/70">
                    {selectedClass ? (
                      <span className="truncate text-white">
                        {selectedClass.label}
                      </span>
                    ) : (
                      <span className="text-neutral-500">
                        Select a vehicle class…
                      </span>
                    )}
                  </SelectTrigger>
                  <SelectContent className="z-[60] max-h-72 bg-neutral-900 border-neutral-700 text-white shadow-2xl">
                    {availableClasses.map((v) => (
                      <SelectItem
                        key={v.code}
                        value={v.code}
                        className="rounded-md py-2 pr-8 text-white focus:bg-neutral-800 focus:text-white data-[state=checked]:text-luxury-gold"
                      >
                        <div className="flex flex-col gap-0.5 text-left">
                          <span className="font-medium leading-tight">
                            {v.label}
                          </span>
                          <span className="text-[11px] leading-tight text-neutral-400">
                            {v.tagline}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!form.vehicleClass && (
                  <p className="mt-1.5 text-[11px] leading-snug text-amber-300/90">
                    Your previous class isn&apos;t available in this city — pick
                    one above
                    {requestableClasses.length
                      ? ", or request a premium class below"
                      : ""}
                    .
                  </p>
                )}
                {requestableClasses.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {requestableClasses.map((rc) => (
                      <button
                        key={rc.code}
                        type="button"
                        onClick={() => requestClass(rc.code, rc.label)}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-luxury-gold/30 text-luxury-gold/90 hover:bg-luxury-gold/10 transition-colors"
                        title={`${rc.label} isn't enabled here — message us to arrange it`}
                      >
                        <MessageCircle className="w-3 h-3" />
                        Request {rc.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>
                  <Users className="w-3 h-3" /> Passengers
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.passengers}
                  onChange={(e) =>
                    set("passengers", Number(e.target.value) || 1)
                  }
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>
                  <Wallet className="w-3 h-3" /> Total — SAR, incl. VAT
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.totalPrice}
                  onChange={(e) =>
                    set("totalPrice", Number(e.target.value) || 0)
                  }
                  className={inputCls}
                />
              </div>
            </div>
          </Section>

          {/* Notes & reason */}
          <Section
            icon={<StickyNote className="w-4 h-4" />}
            title="Notes & reason"
          >
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={2}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Reason for change (optional)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className={inputCls}
                  placeholder="Shared with admin and the assigned vendor"
                />
              </div>
            </div>
          </Section>

          {["ASSIGNMENT_OFFERED", "AWAITING_VENDOR", "CONFIRMED"].includes(
            booking.status,
          ) && (
            <div className="flex items-start gap-2 rounded-lg bg-luxury-gold/10 border border-luxury-gold/30 px-3 py-2.5 text-xs text-luxury-gold">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                This booking already has a vendor — your change will be sent to
                them to accept or decline.
              </span>
            </div>
          )}

          {/* Change preview */}
          {changes.length > 0 && (
            <div className="rounded-xl border border-luxury-gold/30 bg-luxury-gold/[0.06] overflow-hidden">
              <button
                onClick={() => setShowPreview((s) => !s)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-2 text-luxury-gold font-medium">
                  <Sparkles className="w-4 h-4" />
                  {changes.length} change{changes.length === 1 ? "" : "s"} ready
                </span>
                <span className="text-xs text-gray-400">
                  {showPreview ? "Hide" : "Review"}
                </span>
              </button>
              {showPreview && (
                <div className="px-4 pb-3 space-y-1.5">
                  {changes.map((c) => (
                    <div
                      key={c.key}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="w-24 flex-shrink-0 text-gray-400">
                        {LABELS[c.key] ?? c.key}
                      </span>
                      <span className="text-gray-500 line-through truncate max-w-[90px]">
                        {fmt(c.from)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      <span className="text-white truncate">{fmt(c.to)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-800 px-6 py-4 flex items-center justify-between gap-3 bg-neutral-950">
          <span className="flex items-center gap-2 text-xs text-gray-400">
            {changes.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-luxury-gold animate-pulse" />
            )}
            {changes.length === 0
              ? "No changes yet"
              : `${changes.length} change${changes.length === 1 ? "" : "s"}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || changes.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-luxury-gold hover:bg-luxury-gold/90 disabled:opacity-40 disabled:cursor-not-allowed text-black rounded-lg font-semibold text-sm transition-colors shadow-lg shadow-luxury-gold/10"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// RequestDeletionDialog
// ============================================
export function RequestDeletionDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: { id: string; bookingRef: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const { showNotification } = useNotification();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim())
      return showNotification(
        "error",
        "Add a reason for the deletion request.",
      );
    setSubmitting(true);
    try {
      await partnerApi.requestBookingDeletion(booking.id, {
        reason: reason.trim(),
      });
      showNotification("success", "Deletion request sent to admin for review.");
      onDone();
      onClose();
    } catch (err: any) {
      showNotification(
        "error",
        err?.message || "Couldn't submit the deletion request.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/30">
            <Trash2 className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">
              Request deletion
            </h3>
            <p className="text-xs text-gray-400">{booking.bookingRef}</p>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-2 text-xs text-gray-400">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              An admin reviews every deletion. Bookings that are already
              invoiced or paid can&apos;t be deleted.
            </span>
          </div>
          <div>
            <label className={labelCls}>Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Why should this booking be removed?"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-neutral-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-neutral-800 transition-colors"
          >
            Keep booking
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Request deletion
          </button>
        </div>
      </div>
    </div>
  );
}
