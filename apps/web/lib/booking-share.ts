// ============================================
// !!! DESTINATION PATH: apps/web/lib/booking-share.ts
// ============================================
// ============================================
// apps/web/lib/booking-share.ts
//
// Shared utilities for the "send booking to driver/customer over
// WhatsApp" + "add booking to Google Calendar" flows. Pure URL
// template generators — no SDK, no auth, no backend round-trip.
// Consumed by both the vendor portal (vendor → driver) and the
// partner portal (partner → customer).
//
// The actual message body is portal-specific (driver-facing dispatch
// brief vs. customer-facing confirmation), so those builders live
// inside the portals. This module owns the boilerplate that's
// identical between them: URL formatting, date math, WhatsApp brand
// SVG, phone normalization, Google Calendar event composition.
// ============================================

import React from "react";

// Normalized input shape — each portal converts its own detail
// type (BookingDetailData / BookingDetail) into this before calling
// any of the helpers below. Avoids the helpers having to know
// portal-specific field paths (assignedVehicle vs vehicle.assigned,
// assignedDriver vs driver) while keeping the call sites tight.
export type BookingShareInput = {
  bookingRef: string;
  customer: { name: string; phone?: string | null };
  trip: {
    tripType: string; // "HOURLY" | "ONE_WAY"
    tripDate: string; // ISO date
    tripTime: string; // "HH:mm"
    hours: number | null;
    pickupAddress: string;
    pickupLat: number | null;
    pickupLng: number | null;
    dropoffAddress?: string | null;
    dropoffLat?: number | null;
    dropoffLng?: number | null;
    flightNumber?: string | null;
    terminalNo?: string | null;
  };
  vehicle?: {
    year: number;
    make: string;
    model: string;
    plateNumber: string;
    color?: string | null;
  } | null;
  driver?: {
    name: string;
    phone?: string | null;
  } | null;
};

// YYYYMMDDTHHmmss — Google Calendar treats this floating (no
// timezone) format as local time of the user's calendar, which for
// Saudi-time bookings + Saudi-based users is the intended
// interpretation. Using UTC ('Z') would land the event 3 hours off
// for most users; better to be timezone-naive and correct than
// precise-and-wrong.
function fmtDateForCal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export function bookingDuration(b: BookingShareInput): {
  start: Date;
  end: Date;
} {
  // Combine the date string + HH:mm time into a single local Date.
  // Falling back to 00:00 if tripTime is missing keeps the link
  // usable rather than failing to open at all.
  const date = new Date(b.trip.tripDate);
  const [hhStr, mmStr] = (b.trip.tripTime || "00:00").split(":");
  const hh = parseInt(hhStr, 10);
  const mm = parseInt(mmStr, 10);
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Number.isFinite(hh) ? hh : 0,
    Number.isFinite(mm) ? mm : 0,
    0,
  );
  // HOURLY → exact booked window. ONE_WAY → 2h placeholder so the
  // calendar block reserves a reasonable chunk; user can adjust in
  // the Google Calendar editor before saving. (No domain-side
  // route-duration estimate available here; 2h is conservative for
  // intra-city + airport runs in KSA.)
  const durationHours =
    b.trip.tripType === "HOURLY" && b.trip.hours ? b.trip.hours : 2;
  const end = new Date(start.getTime() + durationHours * 3_600_000);
  return { start, end };
}

// Customizable calendar URL — title + extra description lines come
// from the caller so each portal can tailor the wording (driver-side
// vs. customer-side). Location is always the pickup address.
export function buildCalendarUrl(
  b: BookingShareInput,
  opts: { title: string; extraDescriptionLines?: string[] },
): string {
  const { start, end } = bookingDuration(b);
  const isHourly = b.trip.tripType === "HOURLY";

  // Default description — facts every consumer needs, agnostic of
  // perspective. Callers append perspective-specific lines via
  // extraDescriptionLines (e.g. "Your driver: ..." for customer-
  // facing, "Guest: ..." for driver-facing).
  const baseLines = [
    `Booking ${b.bookingRef}`,
    `Trip: ${isHourly ? "By the Hour" : "One Way"}${
      isHourly && b.trip.hours ? ` (${b.trip.hours}h)` : ""
    }`,
    `Pickup: ${b.trip.pickupAddress}`,
    !isHourly && b.trip.dropoffAddress
      ? `Drop-off: ${b.trip.dropoffAddress}`
      : "",
    b.trip.flightNumber
      ? `Flight: ${b.trip.flightNumber}${
          b.trip.terminalNo ? ` · Terminal ${b.trip.terminalNo}` : ""
        }`
      : "",
  ];

  const description = [...baseLines, ...(opts.extraDescriptionLines || [])]
    .filter(Boolean)
    .join("\n");

  return (
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(opts.title)}` +
    `&dates=${fmtDateForCal(start)}/${fmtDateForCal(end)}` +
    `&details=${encodeURIComponent(description)}` +
    `&location=${encodeURIComponent(b.trip.pickupAddress)}`
  );
}

// Single Google Maps URL covering the whole trip. The previous
// approach exposed two separate links in the WhatsApp brief (one
// for pickup, one for drop-off), which read busy and unprofessional
// — recipients shouldn't have to figure out which link is which or
// piece a route together themselves. For ONE_WAY this now returns
// a single Directions URL (origin → destination, drive mode);
// Google Maps opens with the route already laid out. For HOURLY
// there's no fixed drop-off, so we keep a point-lookup URL on the
// pickup.
//
// Coordinate-first, address-fallback at each end. lat/lng are
// preferred because they don't depend on how clean the address
// string is; addresses kick in only when the booking lacks
// geocoded coordinates (older bookings before the geocode pipeline
// landed, or imports without lat/lng).
//
// Takes a trip-shaped input rather than the full BookingShareInput
// so the in-app BookingMap component (which only has trip
// geometry, not customer/vehicle/etc.) can call it directly
// without constructing a dummy parent object.
export type TripGeometry = {
  tripType: string;
  pickupAddress?: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffAddress?: string | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
};

export function buildBookingMapsUrl(trip: TripGeometry): string {
  const isOneWay = trip.tripType === "ONE_WAY";
  const hasDropoff =
    isOneWay &&
    ((trip.dropoffLat != null && trip.dropoffLng != null) ||
      !!trip.dropoffAddress);

  if (hasDropoff) {
    const hasBothCoords =
      trip.pickupLat != null &&
      trip.pickupLng != null &&
      trip.dropoffLat != null &&
      trip.dropoffLng != null;
    if (hasBothCoords) {
      return (
        `https://www.google.com/maps/dir/?api=1` +
        `&origin=${trip.pickupLat},${trip.pickupLng}` +
        `&destination=${trip.dropoffLat},${trip.dropoffLng}` +
        `&travelmode=driving`
      );
    }
    return (
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${encodeURIComponent(trip.pickupAddress || "")}` +
      `&destination=${encodeURIComponent(trip.dropoffAddress || "")}` +
      `&travelmode=driving`
    );
  }

  // HOURLY (or any ONE_WAY missing a drop-off, defensive) — single
  // pickup point. Search URL drops a pin and lets the user request
  // directions themselves from wherever they happen to be.
  if (trip.pickupLat != null && trip.pickupLng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${trip.pickupLat},${trip.pickupLng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    trip.pickupAddress || "",
  )}`;
}

// wa.me requires digits-only, international format, no '+'. Strip
// everything non-numeric — handles "+966 555 123 456", "(966)
// 555-123-456", and similar variants safely.
export function buildWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// WhatsApp brand mark — inlined as an SVG so it survives without
// extra dependencies and matches WhatsApp's actual logo (lucide-
// react has no first-party WhatsApp icon). currentColor lets the
// parent button drive the fill. React.createElement keeps this file
// .ts (not .tsx) so it can be imported from any portal without
// build config surprises.
export function WhatsAppIcon({ className }: { className?: string }) {
  return React.createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "currentColor",
      className,
      "aria-hidden": "true",
    },
    React.createElement("path", {
      d: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.465 3.488",
    }),
  );
}

// ============== DATE FORMATTING HELPERS ==============
//
// Consistent short date for both portals' message bodies. "Sat, 20
// Jun 2026" — UK/SA convention (day-month-year), short weekday
// for context, no comma after weekday because phones render it
// cleanly without.

export function formatBookingDate(tripDate: string): string {
  return new Date(tripDate).toLocaleDateString("en-SA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
