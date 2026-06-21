// ============================================
// !!! DESTINATION PATH: apps/web/components/partner/bookings-panel.tsx
// ============================================
"use client";

// ============================================
// components/partner/bookings/bookings-panel.tsx
// Partner Portal — Bookings Repository
// ============================================

import { useState, useEffect, useCallback, useRef } from "react";
import { partnerApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import {
  Car,
  MapPin,
  ArrowRight,
  Calendar,
  Clock,
  Download,
  Eye,
  X,
  ChevronRight,
  Loader2,
  Search,
  User,
  Phone,
  AlertCircle,
  Star,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { CalendarX } from "lucide-react";
import { proxiedImageUrl } from "@/lib/image-url";
import {
  type BookingShareInput,
  buildCalendarUrl,
  buildBookingMapsUrl,
  buildWhatsAppUrl,
  WhatsAppIcon,
  formatBookingDate,
} from "@/lib/booking-share";

// ============== TYPES ==============

interface BookingListItem {
  id: string;
  bookingRef: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  route: string;
  pickupAddress: string;
  dropoffAddress: string;
  tripType: string;
  hours: number | null;
  // Stored on the booking at creation time, e.g.
  //   "10 hours (day rate + 2 extra hours)"
  //   "4 hours (per-hour rate)"
  // Used in TripTypeBadge when present; falls back to `${hours} Hours`.
  hourlyDuration: string | null;
  tripDate: string;
  tripTime: string;
  createdAt: string;
  city: string;
  vehicleClass: string;
  passengers: number;
  totalPrice: number;
  status: string;
  statusLabel: string;
}

interface TabCounts {
  upcoming: number;
  pending: number;
  today: number;
  completed: number;
  cancelled: number;
  all: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface TimelineStep {
  key: string;
  label: string;
  description?: string;
  status: "completed" | "current" | "upcoming";
  timestamp: string | null;
}

interface BookingDetail {
  id: string;
  bookingRef: string;
  // Public trip-card token. Used to construct the customer-facing
  // URL (NEXT_PUBLIC_SITE_URL + /trip/{shareToken}) that ships
  // inside the WhatsApp confirmation. Nullable because pre-shareToken
  // bookings may not have one yet — the message builder falls back
  // to an inline-detail format in that case so older bookings still
  // get a useful confirmation.
  shareToken: string | null;
  status: string;
  statusLabel: string;
  timeline: TimelineStep[];
  customer: { name: string; phone: string; email: string | null };
  trip: {
    tripType: string;
    city: string;
    route: string;
    hours: number | null;
    hourlyDuration: string | null;
    pickupAddress: string;
    pickupLat: number | null;
    pickupLng: number | null;
    dropoffAddress: string;
    dropoffLat: number | null;
    dropoffLng: number | null;
    tripDate: string;
    tripTime: string;
    flightNumber: string | null;
    terminalNo: string | null;
  };
  vehicle: {
    vehicleClass: string;
    passengers: number;
    assigned: {
      make: string;
      model: string;
      year: number;
      plateNumber: string;
      color: string;
    } | null;
  };
  pricing: {
    basePrice: number;
    peakMultiplier: number;
    peakSurcharge: number;
    vatAmount: number;
    totalPrice: number;
  };
  driver: {
    name: string;
    phone: string;
    photoUrl: string | null;
    rating: number | null;
  } | null;
  vendor: { companyName: string } | null;
  notes: string | null;
  createdAt: string;
}

// ============== HELPERS ==============

const TAB_OPTIONS = [
  "upcoming",
  "pending",
  "today",
  "completed",
  "cancelled",
  "all",
] as const;
type TabFilter = (typeof TAB_OPTIONS)[number];

const PAGINATION_OPTIONS = [5, 10, 15, 20];

// ============== TRIP DESCRIPTOR BADGES ==============
// Visual language is intentionally aligned with the vendor portal's
// bookings table so partners and vendors recognise the same trip
// types at a glance:
//   - One Way   → teal,   ArrowRight icon
//   - By Hour   → violet, Clock icon (with duration label)
//   - City      → sky,    MapPin icon (HOURLY only — for ONE_WAY the
//                 city is implicit in the pickup/dropoff)
// VehicleClassBadge picks neutral chrome so it can sit next to either
// trip-type colour without clashing.

const CITY_LABEL: Record<string, string> = {
  RIYADH: "Riyadh",
  JEDDAH: "Jeddah",
  MAKKAH: "Makkah",
  MADINAH: "Madinah",
};

function TripTypeBadge({
  tripType,
  hours,
  hourlyDuration,
}: {
  tripType: string;
  hours?: number | null;
  hourlyDuration?: string | null;
}) {
  const isHourly = tripType === "HOURLY";
  // Prefer a compact label in the badge to avoid table-row blow-out:
  // backend may store "10 hours (day rate + 2 extra hours)" which is
  // useful in the detail panel but too long here. Fall back to that
  // descriptive string only when raw `hours` isn't available.
  const label = isHourly
    ? hours
      ? `${hours} Hours`
      : hourlyDuration || "By the Hour"
    : "One Way";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border whitespace-nowrap ${
        isHourly
          ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
          : "bg-teal-500/10 text-teal-400 border-teal-500/20"
      }`}
    >
      {isHourly ? (
        <Clock className="w-3 h-3" />
      ) : (
        <ArrowRight className="w-3 h-3" />
      )}
      {label}
    </span>
  );
}

function CityBadge({ city }: { city: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border bg-sky-500/10 text-sky-300 border-sky-500/20 whitespace-nowrap">
      <MapPin className="w-3 h-3" />
      {CITY_LABEL[city] || city}
    </span>
  );
}

function VehicleClassBadge({ vehicleClass }: { vehicleClass: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border bg-neutral-800 text-gray-300 border-neutral-700 whitespace-nowrap">
      <Car className="w-3 h-3" />
      {vehicleClass.replace(/_/g, " ")}
    </span>
  );
}

// ============== BOOKING MAP ==============
// Renders a Google Static Maps thumbnail beneath the location card.
// Implementation choice: Static Maps over interactive embed because:
//   - Single HTTP request, no JS deps, instant render in the slide-in
//   - Constant height (no re-layout shifts while panel is opening)
//   - Cheaper per view than full Maps JS — the detail panel may be
//     opened many times in a session
//
// For ONE_WAY: two markers (P = pickup, D = dropoff) plus a faint
// straight-line connector. We intentionally don't fetch the actual road
// route (Directions API call per render gets expensive) — the connector
// is just a visual hint that A and B are linked. The viewer's mental
// model fills in the rest.
//
// For HOURLY: a single pickup marker, since there's no fixed dropoff.
//
// Gracefully renders nothing when lat/lng aren't available or the
// public API key isn't configured. The addresses above remain visible.

function BookingMap({
  tripType,
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
}: {
  tripType: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  // Need both a key and a valid pickup coordinate to render anything.
  if (!apiKey || pickupLat == null || pickupLng == null) return null;

  const isHourly = tripType === "HOURLY";
  const hasDropoff = !isHourly && dropoffLat != null && dropoffLng != null;

  // Static dark style — keeps the map readable against the panel's
  // bg-neutral-900 backdrop without being so dark that pins disappear.
  // Style params have to be URL-encoded fragments; each `&style=...`
  // contributes one rule.
  const darkStyle = [
    "feature:all|element:geometry|color:0x1f2937",
    "feature:all|element:labels.text.fill|color:0x9ca3af",
    "feature:all|element:labels.text.stroke|color:0x111827",
    "feature:water|element:geometry|color:0x0f172a",
    "feature:road|element:geometry|color:0x374151",
    "feature:road.highway|element:geometry|color:0x4b5563",
    "feature:road|element:labels.text.fill|color:0xd1d5db",
    "feature:poi|element:geometry|color:0x1f2937",
    "feature:poi|element:labels|visibility:off",
    "feature:transit|visibility:off",
    "feature:administrative|element:geometry.stroke|color:0x374151",
  ]
    .map((s) => `&style=${encodeURIComponent(s)}`)
    .join("");

  // Pickup marker — green dot labelled P
  const pickupMarker = `&markers=${encodeURIComponent(
    `color:0x10b981|label:P|${pickupLat},${pickupLng}`,
  )}`;

  let dropoffMarker = "";
  let path = "";
  if (hasDropoff) {
    dropoffMarker = `&markers=${encodeURIComponent(
      `color:0xef4444|label:D|${dropoffLat},${dropoffLng}`,
    )}`;
    // 0x...80 = 50% alpha — keeps the straight line subtle so viewers
    // don't read it as an actual driving route.
    path = `&path=${encodeURIComponent(
      `color:0x14b8a680|weight:4|${pickupLat},${pickupLng}|${dropoffLat},${dropoffLng}`,
    )}`;
  }

  // size+scale: 600×220 at @2 = retina-sharp on standard monitors
  // without exploding bandwidth. Auto-zoom from markers/path means we
  // don't have to compute bounds client-side.
  const url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?size=600x220&scale=2&maptype=roadmap` +
    pickupMarker +
    dropoffMarker +
    path +
    darkStyle +
    `&key=${apiKey}`;

  // Click target. ONE_WAY opens the Google Maps directions flow
  // pre-filled with origin + destination; HOURLY opens a point lookup
  // on the pickup, which lets the partner explore the surrounding
  // area (nearby restaurants, parking, etc.) since there's no fixed
  // destination to plot.
  const externalUrl = hasDropoff
    ? `https://www.google.com/maps/dir/?api=1` +
      `&origin=${pickupLat},${pickupLng}` +
      `&destination=${dropoffLat},${dropoffLng}` +
      `&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1` +
      `&query=${pickupLat},${pickupLng}`;

  return (
    <a
      href={externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950 hover:border-luxury-gold/40 transition-colors group relative"
      title={
        hasDropoff
          ? "Open route in Google Maps"
          : "Open pickup location in Google Maps"
      }
    >
      <img
        src={url}
        alt={hasDropoff ? "Pickup and drop-off locations" : "Pickup location"}
        className="w-full h-auto block"
        loading="lazy"
      />
      {/* Subtle "open in Maps" affordance — fades in on hover so the
          static map stays clean by default. Bottom-right is the
          conventional spot for map-action overlays. */}
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 border border-white/10 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 backdrop-blur-sm">
        <ChevronRight className="w-3 h-3" />
        {hasDropoff ? "View route in Google Maps" : "View on Google Maps"}
      </div>
    </a>
  );
}

// ============== SERVICE DAY TIMELINE ==============
// Novel visualization for HOURLY bookings: a 24-hour strip placing the
// booked window inside the day's full context. The map shows WHERE,
// this shows WHEN — and crucially, *when in the day* (early morning vs
// late evening vs overnight). For a driver dispatcher that distinction
// matters more than the start/end numbers alone.
//
// Why a linear day strip instead of a clock face or duration ring:
//   - Clock faces are pretty but slow to read; partners want answers
//     in a glance, not a puzzle.
//   - The day's "shape" matters — a 10-hour booking starting at 06:00
//     covers the productive day; the same 10 hours starting at 20:00
//     is an overnight job. The strip makes that obvious without text.
//   - Midnight wraparound is handled visually as a second segment on
//     the same axis, which is more intuitive than abstract clock math.
//
// Visual contract:
//   - 24-hour axis, 00 → 24 left-to-right
//   - Booked window rendered as a solid violet bar (or two bars when
//     it wraps past midnight)
//   - Hour ticks at 00 / 06 / 12 / 18 / 24, labelled below
//   - Start and end times annotated above the bar with thin connectors
//   - "Today" / "Tomorrow" suffix on the end time when it wraps

function ServiceDayTimeline({
  startTime,
  hours,
}: {
  startTime: string; // "HH:MM" 24h
  hours: number | null;
}) {
  if (!startTime || !hours || hours <= 0) return null;

  const [hhStr, mmStr] = startTime.split(":");
  const hh = parseInt(hhStr, 10);
  const mm = parseInt(mmStr, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  const startMinutes = hh * 60 + mm;
  const endMinutes = startMinutes + hours * 60;
  const wrapsMidnight = endMinutes > 24 * 60;

  // SVG geometry. ViewBox is 480×72 so the strip stretches via CSS to
  // whatever width the card gives it. All x-positions below derive
  // from this layout — change once, propagates everywhere.
  const VB_W = 480;
  const VB_H = 72;
  const AXIS_LEFT = 28;
  const AXIS_RIGHT = 460;
  const AXIS_Y = 44;
  const BAR_H = 14;
  const AXIS_LEN = AXIS_RIGHT - AXIS_LEFT;

  // Map a minute-of-day (0..1440) onto the axis. Values > 1440 are
  // clamped to the right edge — used so a wrapped-past-midnight end
  // doesn't paint into the next-day segment by mistake.
  const minuteToX = (m: number) => {
    const clamped = Math.max(0, Math.min(1440, m));
    return AXIS_LEFT + (clamped / 1440) * AXIS_LEN;
  };

  const startX = minuteToX(startMinutes);
  // For a wrapping booking we render two violet bars:
  //   segment 1: start → 24:00 today
  //   segment 2: 00:00 → end-minutes-mod-1440 tomorrow
  // For a same-day booking, segment 2's width is 0.
  const segment1EndX = wrapsMidnight ? minuteToX(1440) : minuteToX(endMinutes);
  const segment2EndX = wrapsMidnight ? minuteToX(endMinutes - 1440) : AXIS_LEFT;
  const segment2Width = wrapsMidnight ? segment2EndX - AXIS_LEFT : 0;

  // Compute display strings for start/end so labels stay accurate
  // (endMinutes-mod-1440 when wrapping).
  const pad = (n: number) => String(n).padStart(2, "0");
  const startLabel = `${pad(hh)}:${pad(mm)}`;
  const endTotalMin = endMinutes % 1440;
  const endLabel = `${pad(Math.floor(endTotalMin / 60))}:${pad(endTotalMin % 60)}`;

  // Anchor logic for the start label: if the booking starts in the
  // last quarter of the day, anchor right so the label doesn't run
  // off the bar. Mirror for end label on early-morning ends.
  const startAnchor =
    startX > VB_W * 0.8 ? "end" : startX < VB_W * 0.1 ? "start" : "middle";
  const endX = wrapsMidnight ? segment2EndX : segment1EndX;
  const endAnchor =
    endX > VB_W * 0.9 ? "end" : endX < VB_W * 0.1 ? "start" : "middle";

  const hourTicks = [0, 6, 12, 18, 24];

  return (
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-violet-400" />
          <p className="text-xs uppercase tracking-wide text-violet-300">
            Service Day
          </p>
        </div>
        {wrapsMidnight && (
          <span className="text-[10px] text-violet-300/70 italic">
            Spans midnight
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Booking from ${startLabel} for ${hours} hours${wrapsMidnight ? ", spans midnight" : ""}`}
      >
        {/* Axis baseline */}
        <line
          x1={AXIS_LEFT}
          y1={AXIS_Y + BAR_H / 2}
          x2={AXIS_RIGHT}
          y2={AXIS_Y + BAR_H / 2}
          stroke="#3f3f46"
          strokeWidth="1"
        />

        {/* Hour ticks + labels */}
        {hourTicks.map((h) => {
          const x = minuteToX(h * 60);
          return (
            <g key={h}>
              <line
                x1={x}
                y1={AXIS_Y + BAR_H / 2 - 3}
                x2={x}
                y2={AXIS_Y + BAR_H / 2 + 3}
                stroke="#52525b"
                strokeWidth="1"
              />
              <text
                x={x}
                y={AXIS_Y + BAR_H + 14}
                textAnchor="middle"
                fontSize="9"
                fill="#6b7280"
              >
                {h === 24 ? "00" : pad(h)}
              </text>
            </g>
          );
        })}

        {/* Booked segment(s) — violet bars. When the booking wraps
            past midnight we draw two bars and let the eye stitch them
            back together; the "Spans midnight" caption tells the
            viewer what's happening. */}
        <rect
          x={startX}
          y={AXIS_Y}
          width={Math.max(2, segment1EndX - startX)}
          height={BAR_H}
          rx={3}
          fill="#8b5cf6"
        />
        {wrapsMidnight && segment2Width > 0 && (
          <rect
            x={AXIS_LEFT}
            y={AXIS_Y}
            width={Math.max(2, segment2Width)}
            height={BAR_H}
            rx={3}
            fill="#8b5cf6"
            opacity={0.6}
          />
        )}

        {/* Start time annotation */}
        <line
          x1={startX}
          y1={AXIS_Y - 6}
          x2={startX}
          y2={AXIS_Y}
          stroke="#a78bfa"
          strokeWidth="1"
        />
        <text
          x={
            startAnchor === "start"
              ? startX
              : startAnchor === "end"
                ? startX
                : startX
          }
          y={AXIS_Y - 9}
          textAnchor={startAnchor}
          fontSize="10"
          fill="#c4b5fd"
          fontWeight="500"
        >
          {startLabel}
        </text>

        {/* End time annotation */}
        <line
          x1={endX}
          y1={AXIS_Y - 6}
          x2={endX}
          y2={AXIS_Y}
          stroke="#a78bfa"
          strokeWidth="1"
        />
        <text
          x={endX}
          y={AXIS_Y - 9}
          textAnchor={endAnchor}
          fontSize="10"
          fill="#c4b5fd"
          fontWeight="500"
        >
          {endLabel}
          {wrapsMidnight ? " +1d" : ""}
        </text>
      </svg>
    </div>
  );
}

function getStatusColor(status: string) {
  switch (status.toUpperCase()) {
    case "PENDING":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "AWAITING_VENDOR":
      return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    case "VENDOR_REJECTED":
      return "bg-orange-500/10 text-orange-400 border-orange-500/30";
    case "CONFIRMED":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "IN_PROGRESS":
      return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    case "COMPLETED":
      return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    case "CANCELLED":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    default:
      return "bg-neutral-800 text-gray-400";
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ============== BOOKING DETAIL SIDEBAR ==============
//
// Right-sliding panel matching the pattern used in vendor fleet,
// vendor drivers, and other detail surfaces across the platform.
// Was previously a centered modal — switched to a sidebar so the
// partner can keep the list visible while reviewing a booking, and
// to align with the consistent "detail view = slide-in from right"
// convention.
//
// The component handles its own enter/exit animation:
//   mount  → open=false (translate-x-full, offscreen)
//   tick 2 → setOpen(true) via rAF → CSS slides it in
//   close  → setOpen(false) → wait 300ms → parent unmounts via onClose
// The 300ms wait matches the transition-duration so the user sees a
// smooth slide-out before the panel disappears.
//
// Chauffeur card is the centerpiece — driver photo (from photoUrl) +
// vehicle make/model/year/color/plate are all real fields that were
// already in the API response but the prior modal ignored.

// ============== CUSTOMER QUICK-SHARE ==============
//
// Partner-side counterpart to the vendor portal's driver-share
// helpers. Same machinery (URL templates from @/lib/booking-share)
// but the message body is rewritten for a customer recipient: it's
// a hospitality-style booking confirmation, not an operational
// dispatch brief.
//
// Where the vendor's WhatsApp message goes to the driver and reads
// like a job order ("GUEST", "PICKUP", "VEHICLE", "Plate"), the
// partner's message goes to the customer and reads like a hotel-
// grade confirmation ("Dear ...", "YOUR DRIVER", "YOUR VEHICLE")
// with a polite closing line and LuxDrive sign-off. The customer
// shouldn't be addressed as "GUEST" — they are the recipient, not
// a subject in someone else's record.

function bookingToShareInput(b: BookingDetail): BookingShareInput {
  // Normalize partner's BookingDetail (vehicle.assigned, driver)
  // into the shape booking-share expects. Mirrors the same adapter
  // pattern used on the vendor side.
  return {
    bookingRef: b.bookingRef,
    customer: { name: b.customer.name, phone: b.customer.phone },
    trip: {
      tripType: b.trip.tripType,
      tripDate: b.trip.tripDate,
      tripTime: b.trip.tripTime,
      hours: b.trip.hours,
      pickupAddress: b.trip.pickupAddress,
      pickupLat: b.trip.pickupLat,
      pickupLng: b.trip.pickupLng,
      dropoffAddress: b.trip.dropoffAddress,
      dropoffLat: b.trip.dropoffLat,
      dropoffLng: b.trip.dropoffLng,
      flightNumber: b.trip.flightNumber,
      terminalNo: b.trip.terminalNo,
    },
    vehicle: b.vehicle.assigned
      ? {
          year: b.vehicle.assigned.year,
          make: b.vehicle.assigned.make,
          model: b.vehicle.assigned.model,
          plateNumber: b.vehicle.assigned.plateNumber,
          color: b.vehicle.assigned.color,
        }
      : null,
    driver: b.driver ? { name: b.driver.name, phone: b.driver.phone } : null,
  };
}

function partnerCalendarUrl(b: BookingDetail): string {
  const input = bookingToShareInput(b);
  // Calendar event title is customer-facing — "LuxDrive Transfer"
  // reads better in a guest's calendar than "Booking LX-1234 —
  // Their Own Name" would. Description carries the operational
  // facts so they have everything in one place when the reminder
  // fires.
  return buildCalendarUrl(input, {
    title: `LuxDrive Transfer — ${b.bookingRef}`,
    extraDescriptionLines: [
      b.driver
        ? `Driver: ${b.driver.name}${b.driver.phone ? " · " + b.driver.phone : ""}`
        : "",
      b.vehicle.assigned
        ? `Vehicle: ${b.vehicle.assigned.year} ${b.vehicle.assigned.make} ${b.vehicle.assigned.model} (${b.vehicle.assigned.plateNumber})`
        : "",
    ],
  });
}

// Public origin for the customer trip card. Read from the
// project-standard NEXT_PUBLIC_SITE_URL (same env the root layout
// uses for metadata). No hardcoded fallback — if the env isn't
// configured we'd rather emit no link than the wrong one. A
// staging deploy without this set would otherwise produce
// confirmation messages pointing customers at the production
// domain, which is worse than the legacy inline-detail message.
const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

function buildCustomerMessage(b: BookingDetail): string {
  const tripDate = formatBookingDate(b.trip.tripDate);
  const input = bookingToShareInput(b);
  const tripMapsUrl = buildBookingMapsUrl(input.trip);
  const calendarUrl = partnerCalendarUrl(b);

  // PRIMARY PATH — bookings with a shareToken AND a configured
  // site URL get a short hospitality note + the trip-card link.
  // The customer taps once and opens a beautifully designed page
  // showing the driver's photo, vehicle, route, and add-to-
  // calendar button. Replaces the long inline dump that used to
  // ship the same info as plain text inside WhatsApp.
  //
  // The trip card link is the only action the customer needs.
  // Everything previously listed inline (driver name + phone,
  // vehicle details, route URL, calendar URL) now lives on that
  // page, presented far more professionally than WhatsApp's plain
  // text can manage.
  if (b.shareToken && PUBLIC_SITE_URL) {
    const tripCardUrl = `${PUBLIC_SITE_URL.replace(/\/$/, "")}/trip/${b.shareToken}`;
    return [
      `*LuxDrive — Booking Confirmation*`,
      ``,
      `Dear ${b.customer.name},`,
      ``,
      `Your chauffeur transfer is confirmed for ${tripDate} at ${b.trip.tripTime || "—"}.`,
      ``,
      `View your booking details, driver, and route:`,
      tripCardUrl,
      ``,
      `Reference: ${b.bookingRef}`,
      ``,
      `For any changes or assistance, please reply to this message.`,
      ``,
      `—`,
      `LuxDrive`,
    ].join("\n");
  }

  // FALLBACK PATH — older bookings without a shareToken get the
  // legacy inline-details message. Kept verbatim so partners can
  // still confirm pre-migration bookings with everything they need.
  // Once all in-flight bookings have rotated through to having
  // shareTokens (a few weeks max), this branch can be removed.
  const isHourly = b.trip.tripType === "HOURLY";

  const lines: string[] = [
    `*LuxDrive — Booking Confirmation*`,
    `Reference: ${b.bookingRef}`,
    ``,
    `Dear ${b.customer.name},`,
    ``,
    `Your chauffeur service is confirmed.`,
    ``,
    `SCHEDULE`,
    `${tripDate} at ${b.trip.tripTime || "—"}`,
  ];
  const serviceDetail = isHourly
    ? `Hourly Service${b.trip.hours ? ` · ${b.trip.hours} hours` : ""}`
    : `One Way Transfer`;
  lines.push(serviceDetail);

  lines.push(``, `PICKUP`, b.trip.pickupAddress);

  if (!isHourly && b.trip.dropoffAddress) {
    lines.push(``, `DROP-OFF`, b.trip.dropoffAddress);
    lines.push(``, `ROUTE`, tripMapsUrl);
  } else {
    lines.push(tripMapsUrl);
  }

  if (b.trip.flightNumber) {
    lines.push(``, `FLIGHT`);
    lines.push(
      `${b.trip.flightNumber}${b.trip.terminalNo ? ` · Terminal ${b.trip.terminalNo}` : ""}`,
    );
  }

  if (b.driver) {
    lines.push(``, `YOUR DRIVER`, b.driver.name);
    if (b.driver.phone) lines.push(b.driver.phone);
  }

  if (b.vehicle.assigned) {
    lines.push(``, `YOUR VEHICLE`);
    lines.push(
      `${b.vehicle.assigned.year} ${b.vehicle.assigned.make} ${b.vehicle.assigned.model}${b.vehicle.assigned.color ? ` — ${b.vehicle.assigned.color}` : ""}`,
    );
    lines.push(`Plate ${b.vehicle.assigned.plateNumber}`);
  }

  lines.push(``, `ADD TO CALENDAR`, calendarUrl);
  lines.push(
    ``,
    `For any changes or assistance, please reply to this message.`,
    ``,
    `—`,
    `LuxDrive`,
  );

  return lines.join("\n");
}

// Driver photo: 64px circle, gold-bordered. Direct <img> + the
// resize-proxy helper. Falls back to the User icon when no photo
// is set or the load fails. Simple and predictable — no fill mode,
// no absolute positioning, no surprises.
function DriverPhoto({
  photoUrl,
  name,
}: {
  photoUrl: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  // proxiedImageUrl: null → null, GCS signed URL → proxy URL,
  // anything else → unchanged. The browser handles a failed load
  // via onError, which flips failed=true and we drop to the icon.
  const url = !failed ? proxiedImageUrl(photoUrl, 64) : null;

  return (
    <div className="w-16 h-16 rounded-full border-2 border-luxury-gold/40 bg-luxury-gold/10 shadow-lg shadow-luxury-gold/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
      {url ? (
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <User className="w-8 h-8 text-luxury-gold" />
      )}
    </div>
  );
}

// Map vehicle color names to CSS values. Three-tier lookup so user
// data quality doesn't break the visual:
//   1. Exact match on the lowercased name ("pearl white" → #f7f4ec)
//   2. Substring match on any known keyword — catches typos and
//      compound names ("super whitee" → contains "white" → uses
//      white's value, "midnight black metallic" → contains "black")
//   3. Neutral gray fallback so the swatch dot is always visible,
//      never an invisible/transparent empty circle
function vehicleColorToCss(name: string): string {
  const map: Record<string, string> = {
    white: "#f5f5f5",
    "pearl white": "#f7f4ec",
    black: "#1a1a1a",
    "obsidian black": "#0a0a0a",
    silver: "#c5c5c5",
    "metallic silver": "#b8b8b8",
    gray: "#808080",
    grey: "#808080",
    "space gray": "#5a5a5a",
    red: "#b91c1c",
    "ruby red": "#9b1c1c",
    blue: "#1d4ed8",
    "navy blue": "#1e3a8a",
    navy: "#1e3a8a",
    gold: "#c9a961",
    champagne: "#e3d19c",
    beige: "#d9c5a0",
    brown: "#78350f",
    green: "#15803d",
  };
  const lower = name.toLowerCase().trim();
  if (map[lower]) return map[lower];
  // Substring keyword scan — handles typos & compound color names
  for (const [key, value] of Object.entries(map)) {
    if (lower.includes(key)) return value;
  }
  // Neutral fallback so the swatch never disappears
  return "#6b7280";
}

function BookingDetailModal({
  booking,
  onClose,
  onCancel,
  onDownloadPO,
  cancelling,
  downloadingPO,
}: {
  booking: BookingDetail;
  onClose: () => void;
  onCancel: () => void;
  onDownloadPO: () => void;
  cancelling: boolean;
  downloadingPO: boolean;
}) {
  const canCancel = ["PENDING", "AWAITING_VENDOR"].includes(booking.status);
  const [open, setOpen] = useState(false);

  // Slide-in on mount: open=false on first paint (offscreen right),
  // then flip to true on the next frame so the CSS transition runs.
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Slide-out then unmount. The 300ms matches the transition-duration
  // on the panel below — if you change one, change the other.
  const handleClose = () => {
    setOpen(false);
    setTimeout(onClose, 300);
  };

  const driver = booking.driver;
  const vehicle = booking.vehicle.assigned;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-lg bg-neutral-900 border-l border-neutral-700 shadow-2xl transition-transform duration-300 ease-out overflow-y-auto ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Booking Details
            </h3>
            <p className="text-sm text-luxury-gold font-mono">
              {booking.bookingRef}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-neutral-800 rounded"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status Timeline */}
          <div className="p-4 bg-neutral-800/50 rounded-lg">
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
              Status Timeline
            </p>
            <div className="flex items-center justify-between gap-1">
              {booking.timeline.map((step, idx) => (
                <div key={step.key} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                        step.status === "completed"
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : step.status === "current"
                            ? booking.status === "CANCELLED"
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-luxury-gold text-black"
                            : "bg-neutral-700 text-gray-500"
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <p
                      className={`text-[10px] mt-1 text-center max-w-[70px] leading-tight ${step.status !== "upcoming" ? "text-white" : "text-gray-500"}`}
                    >
                      {step.label}
                    </p>
                  </div>
                  {idx < booking.timeline.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 mt-[-14px] ${step.status === "completed" ? "bg-green-500/50" : "bg-neutral-700"}`}
                    />
                  )}
                </div>
              ))}
            </div>
            {booking.status === "CANCELLED" && (
              <p className="text-xs text-red-400 mt-3 text-center">
                This booking was cancelled
              </p>
            )}
          </div>

          {/* Customer + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Customer</p>
              <p className="text-white font-medium">{booking.customer.name}</p>
              {booking.customer.phone !== "—" && (
                <p className="text-xs text-gray-400">
                  {booking.customer.phone}
                </p>
              )}
              {booking.customer.email && (
                <p className="text-xs text-gray-400">
                  {booking.customer.email}
                </p>
              )}
              {/* Quick-share row — sends the booking confirmation
                  to the customer's WhatsApp and lets the partner
                  drop the trip onto a calendar in one tap each.

                  The WhatsApp button targets the *customer's* phone
                  (this is what differentiates it from the vendor
                  portal's version, which targets the driver). The
                  pre-composed message is hospitality-style ("Dear
                  ${"{name}"}, your chauffeur service is confirmed")
                  and embeds the calendar link so the customer can
                  add the event to their own calendar by tapping
                  inside WhatsApp.

                  Both buttons only render when a customer phone is
                  on the booking — direct-customer bookings always
                  have one; agency-routed bookings without a guest
                  number wouldn't have a usable wa.me target, so we
                  hide the WhatsApp button. Calendar is shown either
                  way since it doesn't need a phone, but we keep
                  the row hidden together so it doesn't look
                  half-broken when the phone is missing. */}
              {booking.customer.phone && booking.customer.phone !== "—" && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <a
                    href={buildWhatsAppUrl(
                      booking.customer.phone,
                      buildCustomerMessage(booking),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30 hover:bg-[#25D366]/25 transition-colors"
                    title="Send booking confirmation to guest on WhatsApp"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    Send via WhatsApp
                  </a>
                  <a
                    href={partnerCalendarUrl(booking)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
                    title="Open Google Calendar with this booking pre-filled"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Add to Calendar
                  </a>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Status</p>
              <span
                className={`inline-block px-2 py-1 text-xs rounded border ${getStatusColor(booking.status)}`}
              >
                {booking.statusLabel}
              </span>
            </div>
          </div>

          {/* Trip descriptor badges — same set as the list view so
              partners get immediate visual continuity between the table
              row and the detail. Sits above the location/service info
              so the trip nature is established before the specifics. */}
          <div className="flex flex-wrap gap-1.5">
            <TripTypeBadge
              tripType={booking.trip.tripType}
              hours={booking.trip.hours}
              hourlyDuration={booking.trip.hourlyDuration}
            />
            {booking.trip.tripType === "HOURLY" && (
              <CityBadge city={booking.trip.city} />
            )}
            <VehicleClassBadge vehicleClass={booking.vehicle.vehicleClass} />
          </div>

          {/* Location / service info — both trip types get a tinted
              card with a static map below. ONE_WAY is teal (Trip Route);
              HOURLY is violet (Service Window). The visual treatment is
              parallel so the section feels deliberate either way; only
              the content inside the card differs to match the trip's
              actual data shape. */}
          {booking.trip.tripType === "HOURLY"
            ? (() => {
                // Compute approximate end of service from start time +
                // hours. Best-effort: failures (malformed strings, edge
                // dates) just hide the end-time line rather than throw.
                let approxEnd: string | null = null;
                try {
                  if (booking.trip.hours && booking.trip.tripTime) {
                    const [hh, mm] = booking.trip.tripTime
                      .split(":")
                      .map((n) => parseInt(n, 10));
                    if (Number.isFinite(hh) && Number.isFinite(mm)) {
                      const start = new Date();
                      start.setHours(hh, mm, 0, 0);
                      const end = new Date(
                        start.getTime() + booking.trip.hours * 3_600_000,
                      );
                      const pad = (n: number) => String(n).padStart(2, "0");
                      const sameDay =
                        end.getDate() === start.getDate() &&
                        end.getMonth() === start.getMonth();
                      approxEnd = `${pad(end.getHours())}:${pad(end.getMinutes())}${
                        sameDay ? "" : " (next day)"
                      }`;
                    }
                  }
                } catch {
                  approxEnd = null;
                }
                return (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-violet-400" />
                        <p className="text-xs uppercase tracking-wide text-violet-300">
                          Service Window
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">
                            Duration
                          </p>
                          <p className="text-white font-medium">
                            {booking.trip.hours
                              ? `${booking.trip.hours} hours`
                              : "By the Hour"}
                          </p>
                          {booking.trip.hourlyDuration &&
                            booking.trip.hourlyDuration !==
                              `${booking.trip.hours} hours` && (
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                {booking.trip.hourlyDuration}
                              </p>
                            )}
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Starts</p>
                          <p className="text-white font-medium">
                            {booking.trip.tripTime}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {formatDate(booking.trip.tripDate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">
                            Ends (approx.)
                          </p>
                          <p className="text-white font-medium">
                            {approxEnd || "—"}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            No fixed drop-off
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 pt-3 border-t border-violet-500/15">
                        <MapPin className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-[11px] text-gray-500">Pickup</p>
                          <p className="text-sm text-white truncate">
                            {booking.trip.pickupAddress}
                          </p>
                        </div>
                      </div>
                      {booking.trip.flightNumber && (
                        <p className="text-xs text-gray-400">
                          Flight: {booking.trip.flightNumber}
                          {booking.trip.terminalNo
                            ? ` · Terminal: ${booking.trip.terminalNo}`
                            : ""}
                        </p>
                      )}
                    </div>
                    <ServiceDayTimeline
                      startTime={booking.trip.tripTime}
                      hours={booking.trip.hours}
                    />
                    <BookingMap
                      tripType="HOURLY"
                      pickupLat={booking.trip.pickupLat}
                      pickupLng={booking.trip.pickupLng}
                      dropoffLat={null}
                      dropoffLng={null}
                    />
                  </div>
                );
              })()
            : (() => {
                // ONE_WAY card mirrors the Service Window's structure
                // (header pill + bordered card + map below) so the detail
                // page feels parallel between trip types. The content
                // inside is what differs: pickup + dropoff stacked with
                // their colored map-pins, instead of duration/start/end.
                return (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-teal-400" />
                        <p className="text-xs uppercase tracking-wide text-teal-300">
                          Trip Route
                        </p>
                      </div>

                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-gray-500">Pickup</p>
                          <p className="text-sm text-white">
                            {booking.trip.pickupAddress}
                          </p>
                        </div>
                      </div>

                      {/* The vertical connector dot is a small visual
                        cue that the two addresses below belong to the
                        same trip — borrowed from how travel apps show
                        flight legs. */}
                      <div className="flex items-center gap-2 pl-1.5">
                        <div className="w-1 h-1 rounded-full bg-neutral-600" />
                        <div className="w-1 h-1 rounded-full bg-neutral-600" />
                        <div className="w-1 h-1 rounded-full bg-neutral-600" />
                      </div>

                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-gray-500">Drop-off</p>
                          <p className="text-sm text-white">
                            {booking.trip.dropoffAddress}
                          </p>
                        </div>
                      </div>

                      {booking.trip.flightNumber && (
                        <p className="text-xs text-gray-400 pt-3 border-t border-teal-500/15">
                          Flight: {booking.trip.flightNumber}
                          {booking.trip.terminalNo
                            ? ` · Terminal: ${booking.trip.terminalNo}`
                            : ""}
                        </p>
                      )}
                    </div>
                    <BookingMap
                      tripType="ONE_WAY"
                      pickupLat={booking.trip.pickupLat}
                      pickupLng={booking.trip.pickupLng}
                      dropoffLat={booking.trip.dropoffLat}
                      dropoffLng={booking.trip.dropoffLng}
                    />
                  </div>
                );
              })()}

          {/* Date/Time + Vehicle class (the BOOKED category — actual
              assigned car appears in the chauffeur card below) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Date & Time</p>
              <p className="text-white">
                {formatDate(booking.trip.tripDate)} at {booking.trip.tripTime}
              </p>
              {booking.trip.tripType === "ONE_WAY" && (
                <p className="text-xs text-gray-400">
                  {CITY_LABEL[booking.trip.city] || booking.trip.city}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Vehicle Class</p>
              <p className="text-white">
                {booking.vehicle.vehicleClass.replace(/_/g, " ")}
              </p>
              <p className="text-xs text-gray-400">
                {booking.vehicle.passengers} passenger(s)
              </p>
            </div>
          </div>

          {/* Fare */}
          <div className="p-4 bg-luxury-gold/10 border border-luxury-gold/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Booking Fare</p>
                <p className="text-2xl font-bold text-luxury-gold">
                  SAR {booking.pricing.totalPrice.toLocaleString()}
                </p>
                <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                  <p>Base: SAR {booking.pricing.basePrice.toLocaleString()}</p>
                  {booking.pricing.peakSurcharge > 0 && (
                    <p>
                      Peak ({booking.pricing.peakMultiplier}x): +SAR{" "}
                      {booking.pricing.peakSurcharge.toLocaleString()}
                    </p>
                  )}
                  <p>
                    VAT (15%): SAR {booking.pricing.vatAmount.toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                onClick={onDownloadPO}
                disabled={downloadingPO}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-luxury-gold text-black text-xs font-medium rounded-lg hover:bg-luxury-gold/80 transition-colors disabled:opacity-50"
              >
                {downloadingPO ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Download PO
              </button>
            </div>
          </div>

          {/* ============== CHAUFFEUR CARD ==============
              Two-section card showing the assigned driver AND the
              specific vehicle.

              Driver photo uses the local DriverPhoto helper defined
              at the top of this file — direct <img> + proxiedImageUrl
              helper for GCS signing, with the Lucide User icon as the
              error/empty fallback. The backend signs `photoUrl` via
              getReadUrl() in the booking-detail controller, so the URL
              the browser receives is always a fresh signed URL or
              null. (Before that backend fix, the raw GCS object path
              was being sent through unchanged, which the browser
              couldn't load — that was the underlying cause of the
              "broken image with alt text" symptom you were seeing.)

              Vehicle tile uses the make as a stylized wordmark
              instead of a generic car icon — feels closer to how
              luxury automotive brands present themselves (BMW,
              Mercedes, Bentley etc. all rely on their typography).
              `.split(' ')[0]` handles "Mercedes Benz" → "MERCEDES"
              cleanly. Substring color match below means even typos
              like "Super Whitee" still render a sensible swatch. */}
          <div className="rounded-xl overflow-hidden border border-luxury-gold/30 bg-gradient-to-br from-luxury-gold/[0.03] to-transparent">
            {/* ----- Driver section ----- */}
            <div className="p-4 bg-gradient-to-r from-luxury-gold/10 to-transparent border-b border-luxury-gold/10">
              <p className="text-[10px] tracking-[0.2em] uppercase text-luxury-gold/80 mb-3 font-medium">
                Your Chauffeur
              </p>
              {driver ? (
                <div className="flex items-start gap-4">
                  {/* Driver photo — simple direct img routed through
                      the resize-proxy helper. Falls back to the User
                      icon when no photo is set OR when the load fails
                      (broken signed URL, GCS object missing, etc.).
                      The backend signs photoUrl via getReadUrl before
                      sending, so the URL the browser receives is
                      always a fresh signed URL or null. */}
                  <DriverPhoto photoUrl={driver.photoUrl} name={driver.name} />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-white truncate">
                      {driver.name}
                    </h4>
                    {driver.rating != null && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Star className="w-3.5 h-3.5 text-luxury-gold fill-luxury-gold" />
                        <span className="text-xs text-luxury-gold font-medium">
                          {driver.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                    <a
                      href={`tel:${driver.phone}`}
                      className="inline-flex items-center gap-1.5 mt-2 text-sm text-gray-300 hover:text-luxury-gold transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {driver.phone}
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-400 py-2">
                  <div className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">
                      Awaiting Driver Assignment
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Your chauffeur will be confirmed shortly
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ----- Vehicle section ----- */}
            <div className="p-4">
              <p className="text-[10px] tracking-[0.2em] uppercase text-luxury-gold/80 mb-3 font-medium">
                Your Vehicle
              </p>
              {vehicle ? (
                <div className="flex items-center gap-4">
                  {/* Brand wordmark tile — uses the make's first word
                      in a serif display font on a gold-tinted gradient.
                      More premium than a clip-art car icon and works
                      across every luxury brand (BMW, MERCEDES, ROLLS,
                      BENTLEY, AUDI, LEXUS — they all read well in
                      serif caps). Falls back to a clean Car icon if
                      the make string is somehow empty. */}
                  <div className="relative w-24 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-luxury-gold/20 via-luxury-gold/5 to-neutral-900 border border-luxury-gold/30 flex items-center justify-center">
                    {/* Subtle inner glow */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-luxury-gold/10" />
                    {vehicle.make?.trim() ? (
                      <span
                        className="relative font-serif text-base tracking-tight text-luxury-gold uppercase leading-none"
                        style={{ letterSpacing: "-0.02em" }}
                      >
                        {vehicle.make.split(" ")[0].slice(0, 8)}
                      </span>
                    ) : (
                      <Car className="relative w-8 h-8 text-luxury-gold" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-semibold text-white">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                      {vehicle.color && (
                        <>
                          <span className="flex items-center gap-1.5 text-gray-300">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-gray-500/50 shadow-inner"
                              style={{
                                backgroundColor: vehicleColorToCss(
                                  vehicle.color,
                                ),
                              }}
                              aria-hidden
                            />
                            {vehicle.color}
                          </span>
                          <span className="text-gray-600">•</span>
                        </>
                      )}
                      <span className="font-mono tracking-wider text-luxury-gold">
                        {vehicle.plateNumber}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-gray-400 py-2">
                  <div className="w-24 h-20 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0">
                    <Car className="w-7 h-7 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-300">Vehicle Pending</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Confirmed alongside driver assignment
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {booking.notes && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-300">{booking.notes}</p>
            </div>
          )}
        </div>

        {/* Footer actions — sticky bottom inside the panel */}
        <div className="flex justify-end gap-3 p-5 border-t border-neutral-800 sticky bottom-0 bg-neutral-900">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Close
          </button>
          {canCancel && (
            <button
              onClick={onCancel}
              disabled={cancelling}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
            >
              {cancelling && <Loader2 className="w-4 h-4 animate-spin" />}
              Cancel Booking
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============== MAIN COMPONENT ==============

interface BookingsPanelProps {
  refreshBadges: () => void;
  initialDateFilter?: string | null;
}

export default function BookingsPanel({
  refreshBadges,
  initialDateFilter,
}: BookingsPanelProps) {
  const { showNotification } = useNotification();

  // List state
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [tabs, setTabs] = useState<TabCounts>({
    upcoming: 0,
    pending: 0,
    today: 0,
    completed: 0,
    cancelled: 0,
    all: 0,
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeTab, setActiveTab] = useState<TabFilter>(
    initialDateFilter ? "all" : "upcoming",
  );
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(initialDateFilter || "");
  const [dateTo, setDateTo] = useState(initialDateFilter || "");

  // Detail modal
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(
    null,
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [downloadingPO, setDownloadingPO] = useState<string | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  //for filtering bookings based upon date selected from dashboard's calendar
  const prevFilterRef = useRef(initialDateFilter);

  useEffect(() => {
    // Only react when the prop actually changes to a new value (not on initial mount)
    if (initialDateFilter && initialDateFilter !== prevFilterRef.current) {
      prevFilterRef.current = initialDateFilter;
      setDateFrom(initialDateFilter);
      setDateTo(initialDateFilter);
      setActiveTab("all");
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [initialDateFilter]);

  // ============== FETCH BOOKINGS ==============
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        tab: activeTab,
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const res = await partnerApi.getBookings(params);
      if (res.data) {
        setBookings(res.data.bookings || []);
        setTabs(res.data.tabs || tabs);
        if (res.data.pagination) {
          setPagination((prev) => ({ ...prev, ...res.data.pagination }));
        }
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    pagination.page,
    pagination.limit,
    search,
    dateFrom,
    dateTo,
    showNotification,
  ]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Auto-clear booking notifications
  useEffect(() => {
    partnerApi
      .markAllNotificationsAsRead({ category: "BOOKING" })
      .then(() => refreshBadges())
      .catch(() => {});
  }, []);

  // Reset page when filters change
  const handleTabChange = (tab: TabFilter) => {
    setActiveTab(tab);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };
  const handleSearch = (q: string) => {
    setSearch(q);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };
  const handleLimitChange = (l: number) => {
    setPagination((prev) => ({ ...prev, limit: l, page: 1 }));
  };

  // ============== VIEW BOOKING DETAIL ==============
  const handleViewDetail = async (bookingId: string) => {
    setLoadingDetail(true);
    try {
      const res = await partnerApi.getBookingDetail(bookingId);
      if (res.data) setSelectedBooking(res.data);
    } catch (err: any) {
      showNotification(
        "error",
        err.message || "Failed to load booking details",
      );
    } finally {
      setLoadingDetail(false);
    }
  };

  // ============== CANCEL BOOKING ==============
  const handleCancel = async () => {
    if (!selectedBooking) return;
    setCancelling(true);
    try {
      await partnerApi.cancelBooking(selectedBooking.id, {
        reason: "Cancelled by partner",
      });
      showNotification(
        "success",
        `Booking ${selectedBooking.bookingRef} cancelled`,
      );
      setSelectedBooking(null);
      fetchBookings();
      refreshBadges();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to cancel booking");
    } finally {
      setCancelling(false);
    }
  };

  // ============== DOWNLOAD PO ==============
  const handleDownloadPO = async (bookingId: string) => {
    setDownloadingPO(bookingId);
    try {
      const res = await partnerApi.getBookingPO(bookingId);
      if (res.data?.html) {
        // Open PO HTML in new window for printing
        const win = window.open("", "_blank", "width=800,height=900");
        if (win) {
          win.document.write(res.data.html);
          win.document.close();
        }
      }
      showNotification("success", "Purchase order opened");
    } catch (err: any) {
      showNotification("error", err.message || "Failed to download PO");
    } finally {
      setDownloadingPO(null);
    }
  };

  // ============== EXPORT CSV ==============
  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, any> = { tab: activeTab };
      if (search) params.search = search;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      // Backend returns CSV with Content-Disposition header
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/v1/partner/bookings/export?${new URLSearchParams(params as any).toString()}`,
        { credentials: "include" },
      );

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookings-export-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      showNotification("success", "Bookings exported");
    } catch (err: any) {
      showNotification("error", err.message || "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  // ============== RENDER ==============
  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Tab Filters + Search + Export */}
      <div className="space-y-3 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-4">
        <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 -mx-1 px-1">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm font-medium capitalize transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab
                  ? "bg-luxury-gold text-black"
                  : "bg-neutral-800 text-gray-400 hover:text-white"
              }`}
            >
              {tab}
              {/* Badge only on `pending` — that's where the partner's
                  booked trips are sitting without a confirmed vendor
                  or driver yet. Upcoming/today/completed/cancelled/all
                  are pure filters over historical or in-flight data;
                  their counts surface in the table footer via
                  pagination, and showing them up here makes idle rows
                  look like alerts. */}
              {tab === "pending" && tabs[tab] > 0 && (
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${activeTab === tab ? "bg-black/20 text-black" : "bg-luxury-gold text-black"}`}
                >
                  {tabs[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-2 lg:contents">
          <div className="flex-1 lg:flex-none relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search ref, guest, route..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full lg:w-64 pl-9 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || bookings.length === 0}
            className="lg:ml-auto flex items-center gap-2 px-3 lg:px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors text-sm disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4 p-3 lg:p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="text-xs lg:text-sm text-gray-400">
            Filter by date:
          </span>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col flex-1 sm:flex-none">
            <label className="text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full sm:w-auto px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none"
            />
          </div>
          <span className="text-gray-500 pb-2">–</span>
          <div className="flex flex-col flex-1 sm:flex-none">
            <label className="text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full sm:w-auto px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setActiveTab("upcoming");
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && bookings.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      )}

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-3">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-luxury-gold font-mono">
                  {b.bookingRef}
                </p>
                <p className="text-sm font-medium text-white mt-0.5">
                  {b.guestName}
                </p>
              </div>
              <span
                className={`px-2 py-1 text-xs rounded border ${getStatusColor(b.status)}`}
              >
                {b.statusLabel}
              </span>
            </div>

            {/* Trip descriptor row — same badge set as the desktop
                table's Type/Class column. Wraps when the city badge is
                present so the row degrades gracefully on narrow phones. */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <TripTypeBadge
                tripType={b.tripType}
                hours={b.hours}
                hourlyDuration={b.hourlyDuration}
              />
              {b.tripType === "HOURLY" && <CityBadge city={b.city} />}
              <VehicleClassBadge vehicleClass={b.vehicleClass} />
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">
                {b.tripType === "HOURLY" ? b.pickupAddress : b.route}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatDate(b.tripDate)}</span>
                <Clock className="w-3.5 h-3.5 ml-2" />
                <span>{b.tripTime}</span>
              </div>
              <span className="text-sm font-medium text-white">
                SAR {b.totalPrice.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-end pt-3 border-t border-neutral-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleViewDetail(b.id)}
                  className="text-xs text-luxury-gold hover:underline"
                >
                  View
                </button>
                <button
                  onClick={() => handleDownloadPO(b.id)}
                  disabled={downloadingPO === b.id}
                  className="text-xs text-green-400 hover:underline disabled:opacity-50"
                >
                  {downloadingPO === b.id ? "Loading..." : "PO"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {!loading && bookings.length === 0 && (
          <Empty className="bg-neutral-900 border border-neutral-800 rounded-xl py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-neutral-800">
                <CalendarX className="w-5 h-5 text-gray-400" />
              </EmptyMedia>
              <EmptyTitle className="text-white">No Bookings Found</EmptyTitle>
              <EmptyDescription className="text-gray-400">
                {search || activeTab !== "upcoming"
                  ? "Try adjusting your filters or search terms"
                  : "Your bookings will appear here once created"}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden lg:block bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Ref
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Guest
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type / Class
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Route
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date / Time
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Fare
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-neutral-800 last:border-0 hover:bg-neutral-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-luxury-gold font-mono">
                    {b.bookingRef}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-white">{b.guestName}</p>
                    {b.guestPhone !== "—" && (
                      <p className="text-xs text-gray-500">{b.guestPhone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {/* Stacked badges echo the vendor portal so the
                        same booking reads identically on both sides. */}
                    <div className="flex flex-col gap-1 items-start">
                      <TripTypeBadge
                        tripType={b.tripType}
                        hours={b.hours}
                        hourlyDuration={b.hourlyDuration}
                      />
                      {b.tripType === "HOURLY" && <CityBadge city={b.city} />}
                      <VehicleClassBadge vehicleClass={b.vehicleClass} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 max-w-[220px]">
                    {/* Route column branches on trip type:
                        - ONE_WAY: shows pickup → dropoff (or routeName fallback)
                        - HOURLY:  shows just the pickup with a map pin —
                          the city is conveyed via the CityBadge in the
                          Type/Class column, so duplicating it here would
                          be noise. */}
                    {b.tripType === "HOURLY" ? (
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                        <span className="truncate">{b.pickupAddress}</span>
                      </div>
                    ) : (
                      <div className="truncate">{b.route}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-400">
                      {formatDate(b.tripDate)}
                    </p>
                    <p className="text-xs text-gray-500">{b.tripTime}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-white">
                    SAR {b.totalPrice.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded border ${getStatusColor(b.status)}`}
                    >
                      {b.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewDetail(b.id)}
                        className="text-xs text-luxury-gold hover:underline"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleDownloadPO(b.id)}
                        disabled={downloadingPO === b.id}
                        className="text-xs text-green-400 hover:underline disabled:opacity-50"
                      >
                        {downloadingPO === b.id ? "..." : "PO"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && bookings.length === 0 && (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-neutral-800">
                  <CalendarX className="w-5 h-5 text-gray-400" />
                </EmptyMedia>
                <EmptyTitle className="text-white">
                  No Bookings Found
                </EmptyTitle>
                <EmptyDescription className="text-gray-400">
                  {search || activeTab !== "upcoming"
                    ? "Try adjusting your filters or search terms"
                    : "Your bookings will appear here once created"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <p className="text-xs sm:text-sm text-gray-500">
              {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm text-gray-500">Show:</span>
              <select
                value={pagination.limit}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                className="px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:border-luxury-gold focus:outline-none"
              >
                {PAGINATION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setPagination((p) => ({
                    ...p,
                    page: Math.max(1, p.page - 1),
                  }))
                }
                disabled={pagination.page === 1}
                className="px-3 py-1.5 bg-neutral-800 text-gray-400 rounded-lg text-sm hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <div className="flex gap-1">
                {Array.from(
                  { length: Math.min(pagination.totalPages, 7) },
                  (_, i) => {
                    // Smart page number display
                    let pageNum: number;
                    if (pagination.totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 4) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.totalPages - 3) {
                      pageNum = pagination.totalPages - 6 + i;
                    } else {
                      pageNum = pagination.page - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() =>
                          setPagination((p) => ({ ...p, page: pageNum }))
                        }
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          pagination.page === pageNum
                            ? "bg-luxury-gold text-black"
                            : "bg-neutral-800 text-gray-400 hover:text-white"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  },
                )}
              </div>
              <button
                onClick={() =>
                  setPagination((p) => ({
                    ...p,
                    page: Math.min(p.totalPages, p.page + 1),
                  }))
                }
                disabled={pagination.page === pagination.totalPages}
                className="px-3 py-1.5 bg-neutral-800 text-gray-400 rounded-lg text-sm hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading overlay for detail fetch */}
      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-6 py-4 bg-neutral-900 border border-neutral-700 rounded-xl">
            <Loader2 className="w-5 h-5 text-luxury-gold animate-spin" />
            <span className="text-white">Loading booking details...</span>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onCancel={handleCancel}
          onDownloadPO={() => handleDownloadPO(selectedBooking.id)}
          cancelling={cancelling}
          downloadingPO={downloadingPO === selectedBooking.id}
        />
      )}
    </div>
  );
}
