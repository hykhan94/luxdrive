// ============================================
// !!! DESTINATION PATH: apps/web/app/trip/[token]/page.tsx
// ============================================
// ============================================
// apps/web/app/trip/[token]/page.tsx
//
// Customer-facing Trip Card. Public page (no auth) opened by tapping
// the link in the WhatsApp confirmation a partner sends out after
// booking. Mobile-first — vast majority of traffic comes from a
// phone — but scales gracefully to desktop for the few who open it
// on a laptop.
//
// Server component: fetches from /api/v1/public/trip/:token on the
// server, renders the card with the data inlined. Avoids a client-
// side loading spinner and ships less JS to the user (no auth
// libraries, no navigation chrome — just the card). Falls through to
// a friendly "trip no longer available" state for expired links
// (410 response from the backend, ~30 days post trip date) and a
// generic "trip not found" for invalid/non-existent tokens.
// ============================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  buildBookingMapsUrl,
  buildCalendarUrl,
  buildWhatsAppUrl,
  formatBookingDate,
  WhatsAppIcon,
  type TripGeometry,
} from "@/lib/booking-share";
import { proxiedImageUrl } from "@/lib/image-url";

// API shape, mirrors getPublicTrip's response payload on the server.
// Defined here as a local interface rather than imported because
// this is the only place that consumes it and pulling it in from
// the API client (which is auth-aware) would drag context this page
// doesn't need.
type TripCardData = {
  bookingRef: string;
  status: string;
  statusLabel: string;
  customer: { name: string };
  trip: {
    tripType: string;
    city: string;
    hours: number | null;
    pickupAddress: string;
    pickupLat: number | null;
    pickupLng: number | null;
    dropoffAddress: string | null;
    dropoffLat: number | null;
    dropoffLng: number | null;
    tripDate: string;
    tripTime: string;
    flightNumber: string | null;
    terminalNo: string | null;
  };
  driver: {
    name: string;
    phone: string;
    photoUrl: string | null;
    rating: number | null;
  } | null;
  vehicle: {
    make: string;
    model: string;
    year: number;
    plateNumber: string;
    color: string;
    category: string;
  } | null;
};

type FetchResult =
  | { kind: "ok"; data: TripCardData }
  | { kind: "expired"; bookingRef: string; tripDate: string }
  | { kind: "notFound" };

async function fetchTrip(token: string): Promise<FetchResult> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  try {
    const res = await fetch(
      `${apiBase}/api/v1/public/trip/${encodeURIComponent(token)}`,
      {
        // Public endpoint — no cookies needed, no caching at the
        // edge because the trip details could change (driver
        // assigned mid-day, vehicle swap, etc.) and the customer
        // tapping the link should see the latest state.
        cache: "no-store",
      },
    );
    if (res.status === 404) return { kind: "notFound" };
    if (res.status === 410) {
      const body = await res.json();
      return {
        kind: "expired",
        bookingRef: body?.data?.bookingRef || "",
        tripDate: body?.data?.tripDate || "",
      };
    }
    if (!res.ok) return { kind: "notFound" };
    const body = await res.json();
    return { kind: "ok", data: body.data };
  } catch {
    // Network error → treat as not found rather than throwing.
    // Avoids leaking infra details to a public surface; a stable
    // "trip not found" page is the right UX for any failure mode
    // the customer can't act on.
    return { kind: "notFound" };
  }
}

// Match the body's CSS variables for the brand. Inline so the page
// is self-contained — works even if globals.css conventions shift.
const BRAND_GOLD = "#C9A961";

// Conservative metadata. We deliberately do NOT include personal
// data (customer name, booking ref) in OpenGraph tags — a leaked
// link should not also leak the rider's identity to any chat
// preview unfurler.
export const metadata: Metadata = {
  title: "Your LuxDrive Booking",
  description:
    "View your chauffeur booking details, driver information, and trip route.",
  robots: { index: false, follow: false }, // never indexed
};

export default async function TripCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchTrip(token);

  if (result.kind === "notFound") {
    // Generic not-found page — no token echo, nothing about why.
    // Anyone enumerating tokens just sees the same blank wall.
    notFound();
  }

  if (result.kind === "expired") {
    return <ExpiredState bookingRef={result.bookingRef} />;
  }

  return <TripCard data={result.data} />;
}

// ============== EXPIRED STATE ==============

function ExpiredState({ bookingRef }: { bookingRef: string }) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div
          className="text-2xl font-bold tracking-wide"
          style={{ color: BRAND_GOLD }}
        >
          LUX<span className="text-neutral-200">DRIVE</span>
        </div>
        <h1 className="text-xl text-white font-light pt-4">
          Your trip has concluded
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed">
          The details for booking{" "}
          {bookingRef && (
            <span className="font-mono text-neutral-300">{bookingRef}</span>
          )}{" "}
          are no longer available here. We hope you had a pleasant journey.
        </p>
        <div className="pt-4">
          <a
            href="/"
            className="inline-block text-sm font-medium underline-offset-4 hover:underline"
            style={{ color: BRAND_GOLD }}
          >
            Book another trip
          </a>
        </div>
      </div>
    </div>
  );
}

// ============== TRIP CARD ==============

function TripCard({ data }: { data: TripCardData }) {
  const isHourly = data.trip.tripType === "HOURLY";
  const formattedDate = formatBookingDate(data.trip.tripDate);

  // Derive a friendly first-name greeting when possible — full name
  // works too but a single name reads warmer in a confirmation.
  const greetingName = data.customer.name?.split(" ")[0] || "there";

  // Status-driven badge color. We keep the labels but visually nudge
  // toward the trip state — pending/offered states stay neutral
  // amber, confirmed glows green, in-transit pulses blue, completed
  // mutes to neutral. The customer doesn't need internal vocabulary.
  const statusStyle = getStatusStyle(data.status);

  const tripGeometry: TripGeometry = {
    tripType: data.trip.tripType,
    pickupAddress: data.trip.pickupAddress,
    pickupLat: data.trip.pickupLat,
    pickupLng: data.trip.pickupLng,
    dropoffAddress: data.trip.dropoffAddress,
    dropoffLat: data.trip.dropoffLat,
    dropoffLng: data.trip.dropoffLng,
  };

  const mapsUrl = buildBookingMapsUrl(tripGeometry);

  // Shared calendar helper — we build a BookingShareInput-shaped
  // object inline since this page doesn't have a full booking
  // record, just the customer-facing slice.
  const calendarUrl = buildCalendarUrl(
    {
      bookingRef: data.bookingRef,
      customer: { name: data.customer.name },
      trip: data.trip,
      driver: data.driver
        ? { name: data.driver.name, phone: data.driver.phone }
        : null,
      vehicle: data.vehicle,
    },
    {
      title: `LuxDrive Transfer — ${data.bookingRef}`,
      extraDescriptionLines: [
        data.driver
          ? `Driver: ${data.driver.name}${data.driver.phone ? " · " + data.driver.phone : ""}`
          : "",
        data.vehicle
          ? `Vehicle: ${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model} (${data.vehicle.plateNumber})`
          : "",
      ],
    },
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-md mx-auto px-4 py-6 sm:py-10 space-y-5">
        {/* Brand header */}
        <header className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div
            className="text-xl font-bold tracking-wide"
            style={{ color: BRAND_GOLD }}
          >
            LUX<span className="text-neutral-200">DRIVE</span>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full border ${statusStyle.cls}`}
          >
            {data.statusLabel}
          </span>
        </header>

        {/* Greeting */}
        <section>
          <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-500 mb-1">
            Reference · <span className="font-mono">{data.bookingRef}</span>
          </p>
          <h1 className="text-2xl font-light text-white leading-snug">
            Welcome, {greetingName}
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Your chauffeur is confirmed for {formattedDate}.
          </p>
        </section>

        {/* Driver hero card */}
        <DriverHero driver={data.driver} />

        {/* Schedule */}
        <section>
          <SectionLabel>Schedule</SectionLabel>
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4">
            <p className="text-base text-white font-medium">{formattedDate}</p>
            <p
              className="text-3xl font-bold mt-1"
              style={{ color: BRAND_GOLD }}
            >
              {data.trip.tripTime || "—"}
            </p>
            <p className="text-xs text-neutral-400 mt-2">
              {isHourly
                ? `Hourly Service${data.trip.hours ? ` · ${data.trip.hours} hours` : ""}`
                : "One Way Transfer"}
              {data.trip.flightNumber && (
                <>
                  {" · Flight "}
                  <span className="text-neutral-200 font-medium">
                    {data.trip.flightNumber}
                  </span>
                  {data.trip.terminalNo &&
                    ` · Terminal ${data.trip.terminalNo}`}
                </>
              )}
            </p>
          </div>
        </section>

        {/* Route */}
        <section>
          <SectionLabel>Route</SectionLabel>
          <RouteCard trip={data.trip} mapsUrl={mapsUrl} />
        </section>

        {/* Vehicle */}
        {data.vehicle && (
          <section>
            <SectionLabel>Vehicle</SectionLabel>
            <VehicleCard vehicle={data.vehicle} />
          </section>
        )}

        {/* Action buttons */}
        <section className="grid grid-cols-2 gap-2 pt-1">
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-xs sm:text-sm font-medium py-3 rounded-xl bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
          >
            Add to Calendar
          </a>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-xs sm:text-sm font-medium py-3 rounded-xl border transition-colors"
            style={{
              backgroundColor: "rgba(201, 169, 97, 0.1)",
              color: BRAND_GOLD,
              borderColor: "rgba(201, 169, 97, 0.3)",
            }}
          >
            Open in Maps
          </a>
        </section>

        {/* Support strip */}
        <footer className="text-center pt-6 pb-2">
          <p className="text-xs text-neutral-400">
            Need to change anything?{" "}
            <a
              href="/contact"
              className="underline-offset-4 hover:underline"
              style={{ color: BRAND_GOLD }}
            >
              Contact LuxDrive
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

// ============== DRIVER HERO ==============

function DriverHero({ driver }: { driver: TripCardData["driver"] }) {
  // When the driver isn't assigned yet, we render a tasteful
  // placeholder rather than a silhouette icon. The framing — soft
  // gold border, descriptive copy — signals "details coming
  // shortly" without making the page look broken. Most customers
  // tap the trip card several times in the lead-up, and we want
  // the page to feel just as polished pre-assignment as it does
  // once the driver is locked in.
  if (!driver) {
    return (
      <section
        className="border rounded-2xl p-6 text-center"
        style={{
          borderColor: "rgba(201, 169, 97, 0.2)",
          background:
            "linear-gradient(180deg, rgba(201,169,97,0.04), transparent)",
        }}
      >
        <p
          className="text-[10px] tracking-[0.2em] mb-3"
          style={{ color: "rgba(201, 169, 97, 0.8)" }}
        >
          YOUR CHAUFFEUR
        </p>
        <p className="text-sm text-neutral-300">
          Your driver and vehicle details will appear here shortly.
        </p>
        <p className="text-xs text-neutral-500 mt-2">
          We're finalising arrangements for your transfer.
        </p>
      </section>
    );
  }

  // Photo: signed read URL from the backend, piped through the
  // resize proxy at ~220px (110px display × 2 for retina). The
  // proxy handles caching and webp conversion; we don't load the
  // original-resolution photo on this page.
  const photoSrc = driver.photoUrl
    ? proxiedImageUrl(driver.photoUrl, 110)
    : null;

  return (
    <section
      className="border rounded-2xl p-5 sm:p-6 text-center"
      style={{
        borderColor: "rgba(201, 169, 97, 0.3)",
        background:
          "linear-gradient(180deg, rgba(201,169,97,0.06), transparent)",
      }}
    >
      <div className="flex flex-col items-center">
        {photoSrc ? (
          // Plain <img>: server component, no client-side image
          // optimization needed. The proxy already serves a sized,
          // cached version. Object-cover keeps the framing sane
          // regardless of the source photo's aspect ratio.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt={driver.name}
            className="w-[110px] h-[110px] rounded-full object-cover mb-3"
            style={{
              border: "3px solid rgba(201, 169, 97, 0.5)",
              boxShadow: "0 8px 24px rgba(201,169,97,0.25)",
            }}
          />
        ) : (
          // No photo on the driver record. We don't render a
          // generic person icon — looks cheap on a luxury surface.
          // A clean monogram-style fallback in the brand gold
          // keeps the hero polished. First letter of first name,
          // serif typeface to match brand.
          <div
            className="w-[110px] h-[110px] rounded-full mb-3 flex items-center justify-center"
            style={{
              border: "3px solid rgba(201, 169, 97, 0.5)",
              background:
                "linear-gradient(135deg, rgba(201,169,97,0.15), rgba(201,169,97,0.05))",
              fontFamily: "var(--font-playfair), serif",
              fontSize: "40px",
              color: BRAND_GOLD,
              boxShadow: "0 8px 24px rgba(201,169,97,0.18)",
            }}
          >
            {driver.name.charAt(0).toUpperCase()}
          </div>
        )}

        <p
          className="text-[10px] tracking-[0.2em] mb-1.5"
          style={{ color: "rgba(201, 169, 97, 0.8)" }}
        >
          YOUR CHAUFFEUR
        </p>
        <p className="text-lg font-semibold text-white">{driver.name}</p>

        {driver.rating != null && (
          <div className="flex items-center gap-1 mt-1">
            <span style={{ color: BRAND_GOLD }}>★</span>
            <span className="text-xs" style={{ color: BRAND_GOLD }}>
              {driver.rating.toFixed(1)}
            </span>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <a
            href={`tel:${driver.phone}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium rounded-xl"
            style={{ backgroundColor: BRAND_GOLD, color: "black" }}
          >
            Call Driver
          </a>
          <a
            href={buildWhatsAppUrl(
              driver.phone,
              "Hello, I'm reaching out about my upcoming LuxDrive booking.",
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium rounded-xl bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30"
          >
            <WhatsAppIcon className="w-3.5 h-3.5" />
            WhatsApp
          </a>
        </div>
      </div>
    </section>
  );
}

// ============== ROUTE CARD ==============

function RouteCard({
  trip,
  mapsUrl,
}: {
  trip: TripCardData["trip"];
  mapsUrl: string;
}) {
  const isHourly = trip.tripType === "HOURLY";

  // Static map preview. Uses the Google Maps Static API — same
  // pattern as the in-app BookingMap components on the admin /
  // vendor panels, but with a public API key in NEXT_PUBLIC_… (the
  // key is HTTP-referrer restricted to luxdriveksa.com on Google
  // Cloud Console, so leaking it in client HTML is safe).
  const mapPreview = buildStaticMapUrl(trip);

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-hidden hover:border-neutral-700 transition-colors"
    >
      {mapPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mapPreview}
          alt={isHourly ? "Pickup location" : "Trip route"}
          className="w-full h-32 sm:h-40 object-cover"
        />
      ) : (
        // Coords missing — fall back to a clean gradient tile so
        // the section doesn't render as broken whitespace.
        <div
          className="w-full h-32 sm:h-40"
          style={{
            background:
              "linear-gradient(135deg, rgba(201,169,97,0.08), rgba(201,169,97,0.02))",
          }}
        />
      )}
      <div className="p-4 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: "#10b981" }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">
              Pickup
            </p>
            <p className="text-xs sm:text-sm text-neutral-200 mt-0.5 break-words">
              {trip.pickupAddress}
            </p>
          </div>
        </div>
        {!isHourly && trip.dropoffAddress && (
          <div className="flex items-start gap-2.5 pt-1 border-t border-neutral-800/60">
            <span
              className="mt-2.5 w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: "#f87171" }}
            />
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                Drop-off
              </p>
              <p className="text-xs sm:text-sm text-neutral-200 mt-0.5 break-words">
                {trip.dropoffAddress}
              </p>
            </div>
          </div>
        )}
      </div>
    </a>
  );
}

function buildStaticMapUrl(trip: TripCardData["trip"]): string | null {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;
  if (trip.pickupLat == null || trip.pickupLng == null) return null;

  const isOneWay = trip.tripType === "ONE_WAY";
  const hasDropoff =
    isOneWay && trip.dropoffLat != null && trip.dropoffLng != null;

  // Dark map style — matches the page palette. The trailing
  // style= chain mutes default features (water, points of
  // interest, transit) so the map reads as a calm backdrop, not a
  // visual competitor to the brand surface.
  const darkStyle =
    "&style=feature:all|element:labels.text.fill|color:0x808080" +
    "&style=feature:all|element:labels.text.stroke|color:0x000000|lightness:13" +
    "&style=feature:administrative|element:geometry.fill|color:0x000000" +
    "&style=feature:landscape|element:geometry|color:0x111111" +
    "&style=feature:poi|element:geometry|color:0x1a1a1a" +
    "&style=feature:road|element:geometry|color:0x2a2a2a" +
    "&style=feature:road.highway|element:geometry|color:0x3a3a3a" +
    "&style=feature:water|element:geometry|color:0x0a0a0a";

  if (hasDropoff) {
    // Auto-fit both points + draw a path between them. The %7C is
    // a pipe-encoded delimiter for multi-point path coordinates;
    // Google's Static Maps API requires that exact form.
    return (
      `https://maps.googleapis.com/maps/api/staticmap?size=640x300&scale=2` +
      `&maptype=roadmap` +
      `&markers=color:0x10b981%7Csize:mid%7C${trip.pickupLat},${trip.pickupLng}` +
      `&markers=color:0xf87171%7Csize:mid%7C${trip.dropoffLat},${trip.dropoffLng}` +
      `&path=color:0xC9A961|weight:3|${trip.pickupLat},${trip.pickupLng}|${trip.dropoffLat},${trip.dropoffLng}` +
      darkStyle +
      `&key=${apiKey}`
    );
  }

  // HOURLY (single pickup pin) — center the map on pickup, mid
  // zoom for context.
  return (
    `https://maps.googleapis.com/maps/api/staticmap?size=640x300&scale=2` +
    `&maptype=roadmap&zoom=14&center=${trip.pickupLat},${trip.pickupLng}` +
    `&markers=color:0x10b981%7Csize:mid%7C${trip.pickupLat},${trip.pickupLng}` +
    darkStyle +
    `&key=${apiKey}`
  );
}

// ============== VEHICLE CARD ==============

function VehicleCard({
  vehicle,
}: {
  vehicle: NonNullable<TripCardData["vehicle"]>;
}) {
  const colorCss = vehicleColorToCss(vehicle.color);
  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 flex items-center gap-4">
      <div
        className="w-20 h-16 rounded-xl border flex items-center justify-center flex-shrink-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(201,169,97,0.2), rgba(201,169,97,0.05), #171717)",
          borderColor: "rgba(201, 169, 97, 0.3)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-playfair), serif",
            fontSize: "14px",
            color: BRAND_GOLD,
            letterSpacing: "-0.02em",
          }}
        >
          {vehicle.make.toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm sm:text-base text-white font-semibold">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-300">
            <span
              className="w-2.5 h-2.5 rounded-full border border-neutral-500"
              style={{ backgroundColor: colorCss }}
            />
            {vehicle.color}
          </span>
          <span className="text-neutral-600">·</span>
          <span className="font-mono text-xs" style={{ color: BRAND_GOLD }}>
            {vehicle.plateNumber}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============== HELPERS ==============

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 mb-2">
      {children}
    </p>
  );
}

function getStatusStyle(status: string): { cls: string } {
  switch (status) {
    case "CONFIRMED":
      return { cls: "bg-green-500/10 text-green-400 border-green-500/30" };
    case "EN_ROUTE_TO_PICKUP":
    case "ARRIVED_AT_PICKUP":
    case "IN_TRANSIT":
      return { cls: "bg-blue-500/10 text-blue-400 border-blue-500/30" };
    case "COMPLETED":
      return {
        cls: "bg-neutral-500/10 text-neutral-400 border-neutral-500/30",
      };
    case "CANCELLED":
      return { cls: "bg-red-500/10 text-red-400 border-red-500/30" };
    default:
      return {
        cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      };
  }
}

function vehicleColorToCss(name: string): string {
  // Inlined here (same table used in partner/vendor portals).
  // Duplicate of vehicleColorToCss elsewhere in the codebase —
  // worth hoisting to a shared lib in a future cleanup pass, but
  // tiny enough that copying it here keeps this page self-contained.
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
  for (const [key, value] of Object.entries(map)) {
    if (lower.includes(key)) return value;
  }
  return "#6b7280";
}
