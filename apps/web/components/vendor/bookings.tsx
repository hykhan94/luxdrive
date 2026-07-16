// ============================================
// !!! DESTINATION PATH: apps/web/components/vendor/bookings.tsx
// ============================================
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { vendorApi, ApiError } from "@/lib/api";
import { proxiedImageUrl } from "@/lib/image-url";
import {
  type BookingShareInput,
  buildCalendarUrl,
  buildBookingMapsUrl,
  buildWhatsAppUrl,
  WhatsAppIcon,
  formatBookingDate,
} from "@/lib/booking-share";
import {
  Search,
  Download,
  Calendar,
  Clock,
  MapPin,
  Car,
  User,
  Phone,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowRight,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Wrench,
  UserX,
  CarFront,
  FileText,
  Star,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useNotification } from "@/lib/notification-context";

// ============== TYPES ==============

interface Booking {
  id: string;
  bookingRef: string;
  guestName: string;
  guestPhone: string | null;
  route: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  tripDate: string;
  tripTime: string;
  tripType: string;
  tripTypeLabel: string;
  hours: number | null;
  hourlyDuration: string | null;
  vehicleClass: string;
  city: string;
  passengers: number;
  basePrice: number;
  vatAmount: number;
  totalPrice: number;
  // Stage 3B-1: the payout admin denormalized onto the booking when
  // the offer was accepted (or is currently outstanding). Optional
  // until backend exposes it on this endpoint — when present it's the
  // primary money figure the vendor should see. The partner-side
  // totalPrice above stays in the response for compat; under spec
  // ("vendor never sees partner price") it should eventually be
  // dropped from this endpoint and the frontend should fall back to
  // vendorPayoutAmount exclusively. TODO(backend): expose
  // vendorPayoutAmount in the vendor bookings list response (it's
  // already on the booking row).
  vendorPayoutAmount?: number | null;
  status: string;
  statusLabel: string;
  // True when there's a pending offer for this vendor that hasn't been
  // accepted or rejected. Distinct from `isOfferState(status)` which
  // returns true for both fresh offers AND re-offered bookings where
  // the vendor has already declined and is waiting on admin's revised
  // price. Use this — not isOfferState — to decide whether to show
  // Accept / Reject controls and the "New Request" tab.
  isActionable?: boolean;
  // Booking source attribution (PARTNER/DIRECT origin, partner
  // company name, "Partner: X" label) is intentionally NOT included
  // in the vendor-facing API response — see vendor/bookings.controller
  // for the rationale. Removed from the type so any future code
  // accidentally trying to read it gets a compile error.
  driverName: string | null;
  vehicleInfo: string | null;
  notes: string | null;
  createdAt: string;
}

interface BookingDetailData {
  id: string;
  bookingRef: string;
  status: string;
  statusLabel: string;
  isActionable?: boolean;
  timeline: Array<{
    key: string;
    label: string;
    description: string;
    status: "completed" | "current" | "upcoming";
    timestamp: string | null;
  }>;
  // No `source` / `isPartnerBooking` / `partnerName` / `sourceLabel`
  // here — the vendor-facing detail response intentionally omits
  // booking origin attribution. See list type above and the
  // vendor/bookings.controller comments for the rationale.
  customer: {
    name: string;
    phone: string;
    email: string | null;
  };
  trip: {
    tripType: string;
    tripTypeLabel: string;
    city: string;
    route: string | null;
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
    terminalLocation: string | null;
  };
  vehicleClass: string;
  passengers: number;
  assignedVehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    plateNumber: string;
    color: string | null;
    category: string;
    seats: number;
  } | null;
  assignedDriver: {
    id: string;
    name: string;
    phone: string;
    photoUrl: string | null;
    rating: number | null;
  } | null;
  pricing: {
    basePrice: number;
    vatAmount: number;
    totalPrice: number;
    // See same note on Booking.vendorPayoutAmount above.
    vendorPayoutAmount?: number | null;
  };
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
}

interface AssignmentVehicle {
  id: string;
  label: string;
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  color: string | null;
  seats: number;
  category: string;
  isBusy: boolean;
}

interface AssignmentDriver {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  rating: number | null;
  assignedVehicleId: string | null;
  isBusy: boolean;
}

interface AssignmentOption {
  bookingRef: string;
  requestedVehicleClass: string;
  tripDate: string;
  drivers: AssignmentDriver[];
  vehicles: AssignmentVehicle[];
  availableDriverCount: number;
  availableVehicleCount: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface VendorBookingsProps {
  initialSubTab?: string;
  initialDateFilter?: string | null;
  refreshBadges: () => void;
  // Vendor's current status. Used to gate write actions (accept new booking)
  // when the vendor isn't APPROVED. Rejection of pending bookings and start/
  // complete on already-assigned trips stay enabled regardless of status.
  vendorStatus?: string | null;
  // Required profile docs (CR/VAT/Chamber/Balady/National-Address/IBAN-Letter)
  // that are past their expiry date. When non-empty, write actions are locked
  // even if vendorStatus is APPROVED — vendor must renew via the profile
  // change-request flow before new bookings can be accepted.
  expiredRequiredDocs?: Array<{
    type: string;
    label: string;
    expiryDate: string;
  }>;
}

// ============== CONSTANTS ==============

const TABS = [
  { key: "new_requests", label: "New Requests" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50];

const VEHICLE_CLASS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  ECONOMY_SEDAN: {
    label: "Economy Sedan",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  BUSINESS_SEDAN: {
    label: "Business Sedan",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  FIRST_CLASS: {
    label: "First Class",
    color: "text-luxury-gold",
    bg: "bg-luxury-gold/10",
    border: "border-luxury-gold/20",
  },
  BUSINESS_SUV: {
    label: "Business SUV",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
  ELECTRIC: {
    label: "Electric",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
  },
  HIACE: {
    label: "Hiace",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
  },
  COASTER: {
    label: "Coaster",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
  },
  KING_LONG: {
    label: "King Long",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
};

function getVehicleClassConfig(vehicleClass: string) {
  return (
    VEHICLE_CLASS_CONFIG[vehicleClass] || {
      label: vehicleClass.replace(/_/g, " "),
      color: "text-gray-400",
      bg: "bg-neutral-800",
      border: "border-neutral-700",
    }
  );
}

// ============== HELPERS ==============

// Rejection reasons admin and backend recognize. Mirrors the backend's
// VALID_REASONS in `controller/vendor/bookings.controller.ts`. The
// labels here are the vendor-facing strings shown in the reject modal
// dropdown; values are sent verbatim as the `reason` field in the
// reject request body. Backend also still accepts free-text reasons
// for the transition period, but we always send enums now.
const REJECTION_REASONS = [
  { value: "CAR_DRIVER_UNAVAILABLE", label: "No car or driver available" },
  { value: "PRICE_TOO_LOW", label: "Offered price too low" },
  { value: "UNSUITABLE_ROUTE", label: "Unsuitable route" },
] as const;
type RejectionReason = (typeof REJECTION_REASONS)[number]["value"];

function getStatusColor(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "IN_PROGRESS":
      return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    case "COMPLETED":
      return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    // Stage 3B: ASSIGNMENT_OFFERED and ASSIGNMENT_RE_OFFERED are the
    // new "vendor action required" states. Both render the same way —
    // vendor sees a single "New Request" actionable row regardless of
    // whether it's a first offer or a price-revised re-offer. Old
    // AWAITING_VENDOR / VENDOR_REJECTED enum values dropped in Stage 2.
    case "ASSIGNMENT_OFFERED":
    case "ASSIGNMENT_RE_OFFERED":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "PENDING":
      return "bg-neutral-700/50 text-gray-400 border-neutral-600";
    case "CANCELLED":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    default:
      return "bg-neutral-800 text-gray-400";
  }
}

// Status pill color that distinguishes "vendor needs to act" from
// "waiting on admin to revise the offer" within ASSIGNMENT_RE_OFFERED.
// The base status alone can't differentiate those — only isActionable
// (computed server-side from latestOffer.status) tells us whether the
// vendor still owes a response. Without this differentiation, a vendor
// who rejected an offer for price still sees their booking pill in
// the same actionable yellow, which is the "status didn't change after
// my rejection" complaint.
function getBookingStatusColor(b: {
  status: string;
  isActionable?: boolean;
}): string {
  if (b.status === "ASSIGNMENT_RE_OFFERED" && b.isActionable === false) {
    // Vendor rejected, awaiting admin re-offer — neutral gray, not
    // yellow, because there's no action for the vendor to take.
    return "bg-neutral-700/50 text-gray-400 border-neutral-600";
  }
  return getStatusColor(b.status);
}

// Mirrors backend STATUS_LABELS in
// `controller/vendor/bookings.controller.ts`. Both offer states
// collapse to a single "New Request" label.
function formatStatus(status: string) {
  const map: Record<string, string> = {
    ASSIGNMENT_OFFERED: "New Request",
    ASSIGNMENT_RE_OFFERED: "New Request",
    CONFIRMED: "Confirmed",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    PENDING: "Pending Admin",
  };
  return map[status] || status.replace(/_/g, " ");
}

// Returns true when the booking is in either of the two offer states
// (new offer or price-revised re-offer). Used to gate the reject /
// accept actions, payout displays, and the "New Request" tab.
function isOfferState(status: string): boolean {
  return status === "ASSIGNMENT_OFFERED" || status === "ASSIGNMENT_RE_OFFERED";
}

// Map a BookingDetailData (returned by the single-booking endpoint with
// nested `customer` / `trip` / `pricing` objects) into the flat
// `Booking` shape used by the list endpoint and the open-modal
// handlers. The Accept and Reject buttons inside the detail panel
// trigger handlers that were originally written for list-row use and
// expect the flat shape; rather than duplicating those handlers or
// changing their signatures (which would propagate types through six
// call sites for one widening), we adapt at the call site.
function detailToBookingShape(d: BookingDetailData): Booking {
  return {
    id: d.id,
    bookingRef: d.bookingRef,
    guestName: d.customer.name,
    guestPhone: d.customer.phone || null,
    route: d.trip.route,
    pickupAddress: d.trip.pickupAddress,
    dropoffAddress: d.trip.dropoffAddress,
    tripDate: d.trip.tripDate,
    tripTime: d.trip.tripTime,
    tripType: d.trip.tripType,
    tripTypeLabel: d.trip.tripTypeLabel,
    hours: d.trip.hours,
    hourlyDuration: d.trip.hourlyDuration,
    vehicleClass: d.vehicleClass,
    city: d.trip.city,
    passengers: d.passengers,
    basePrice: d.pricing.basePrice,
    vatAmount: d.pricing.vatAmount,
    totalPrice: d.pricing.totalPrice,
    vendorPayoutAmount: d.pricing.vendorPayoutAmount ?? null,
    status: d.status,
    statusLabel: d.statusLabel,
    isActionable: d.isActionable,
    driverName: d.assignedDriver?.name ?? null,
    vehicleInfo: d.assignedVehicle
      ? `${d.assignedVehicle.make} ${d.assignedVehicle.model} (${d.assignedVehicle.plateNumber})`
      : null,
    notes: d.notes,
    createdAt: d.createdAt,
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString();
}

// ============== PO DOWNLOAD ==============
//
// Fetches the rendered PO HTML from the vendor endpoint and opens it
// in a new tab, then triggers the browser's print dialog so the user
// can save to PDF or send to a printer natively. Same shape as the
// admin and partner versions — the only difference is the API call
// hits the vendor route, which the backend gates to bookings
// assigned to this vendor and renders with "vendor" perspective
// (partner section hidden, source tag suppressed).
async function downloadPOWindow(bookingId: string): Promise<void> {
  const res: any = await vendorApi.getBookingPO(bookingId);
  const html = res?.data?.html;
  const title = res?.data?.meta?.title || "Purchase Order";
  if (!html) throw new Error("No PO content returned");
  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Popup blocked — allow popups to download the PO");
  }
  win.document.title = title;
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* user can still print manually via Cmd/Ctrl+P */
    }
  }, 300);
}

// ============== DRIVER QUICK-SHARE ==============
//
// Helpers for the WhatsApp + Calendar buttons in the chauffeur card.
// The reusable bits (URL templates, date math, WhatsApp brand SVG,
// phone normalization) live in @/lib/booking-share so the partner
// portal can use the same code. The portal-specific piece — what
// the message actually SAYS — stays here so vendor's driver-facing
// dispatch brief can diverge from partner's customer-facing
// confirmation as the brands evolve. Tone: operational, factual,
// minimal — driver is reading on a phone between trips.

function bookingToShareInput(b: BookingDetailData): BookingShareInput {
  // Normalize vendor's BookingDetailData (`assignedDriver`,
  // `assignedVehicle`) into the shape booking-share expects (`driver`,
  // `vehicle`). One adapter at the call site keeps the shared lib
  // unaware of vendor's vs partner's field naming.
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
    vehicle: b.assignedVehicle
      ? {
          year: b.assignedVehicle.year,
          make: b.assignedVehicle.make,
          model: b.assignedVehicle.model,
          plateNumber: b.assignedVehicle.plateNumber,
          color: b.assignedVehicle.color,
        }
      : null,
    driver: b.assignedDriver
      ? { name: b.assignedDriver.name, phone: b.assignedDriver.phone }
      : null,
  };
}

function vendorCalendarUrl(b: BookingDetailData): string {
  const input = bookingToShareInput(b);
  return buildCalendarUrl(input, {
    title: `Booking ${b.bookingRef} — ${b.customer.name}`,
    extraDescriptionLines: [
      b.assignedVehicle
        ? `Vehicle: ${b.assignedVehicle.year} ${b.assignedVehicle.make} ${b.assignedVehicle.model} (${b.assignedVehicle.plateNumber})`
        : "",
      b.assignedDriver ? `Driver: ${b.assignedDriver.name}` : "",
      `Guest: ${b.customer.name}${b.customer.phone ? " · " + b.customer.phone : ""}`,
    ],
  });
}

function buildDriverMessage(b: BookingDetailData): string {
  const isHourly = b.trip.tripType === "HOURLY";
  const tripDate = formatBookingDate(b.trip.tripDate);
  const input = bookingToShareInput(b);
  // One maps link covers the whole trip — directions origin →
  // destination for ONE_WAY, point lookup for HOURLY. Two separate
  // links (one for pickup, one for drop-off) read as noisy and
  // forced the driver to mentally piece a route together.
  const tripMapsUrl = buildBookingMapsUrl(input.trip);
  const calendarUrl = vendorCalendarUrl(b);

  // Plain text, no emoji. Emoji boxes were rendering as `?` on many
  // recipient devices; even when they rendered they read more
  // festive than LuxDrive's brand wants for a dispatch handoff.
  // All-caps section labels carry the hierarchy without depending
  // on WhatsApp's inconsistent *bold* rendering. Only the title
  // line uses *bold*, where the cost of inconsistent rendering is
  // low (worst case: literal asterisks, still readable).
  const lines: string[] = [
    `*LuxDrive Dispatch — ${b.bookingRef}*`,
    ``,
    `GUEST`,
    b.customer.name,
  ];
  if (b.customer.phone) lines.push(b.customer.phone);

  lines.push(``, `SERVICE`);
  const serviceDetail = isHourly
    ? `By the Hour${b.trip.hours ? ` · ${b.trip.hours} hours` : ""}`
    : `One Way`;
  lines.push(`${serviceDetail} · ${tripDate} · ${b.trip.tripTime || "—"}`);

  lines.push(``, `PICKUP`, b.trip.pickupAddress);

  if (!isHourly && b.trip.dropoffAddress) {
    lines.push(``, `DROP-OFF`, b.trip.dropoffAddress);
    // For ONE_WAY: single ROUTE section below both endpoints with
    // the directions URL. Reads like a dispatch sheet — locations
    // first, then "here's the route" — instead of two competing
    // map links.
    lines.push(``, `ROUTE`, tripMapsUrl);
  } else {
    // HOURLY: keep the pickup map link inline since there's no
    // drop-off to relate it to. Driver clicks once for the point.
    lines.push(tripMapsUrl);
  }

  if (b.trip.flightNumber) {
    lines.push(``, `FLIGHT`);
    lines.push(
      `${b.trip.flightNumber}${b.trip.terminalNo ? ` · Terminal ${b.trip.terminalNo}` : ""}`,
    );
  }

  if (b.assignedVehicle) {
    lines.push(``, `VEHICLE`);
    lines.push(
      `${b.assignedVehicle.year} ${b.assignedVehicle.make} ${b.assignedVehicle.model}${b.assignedVehicle.color ? ` — ${b.assignedVehicle.color}` : ""}`,
    );
    lines.push(`Plate ${b.assignedVehicle.plateNumber}`);
  }

  lines.push(``, `ADD TO CALENDAR`, calendarUrl);
  lines.push(``, `—`, `LuxDrive`);

  return lines.join("\n");
}

// ============== BADGE COMPONENTS ==============

function VehicleClassBadge({ vehicleClass }: { vehicleClass: string }) {
  const config = getVehicleClassConfig(vehicleClass);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border ${config.bg} ${config.color} ${config.border}`}
    >
      <Car className="w-3 h-3" />
      {config.label}
    </span>
  );
}

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
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border ${
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
      {isHourly
        ? hourlyDuration || (hours ? `${hours} Hours` : "By the Hour")
        : "One Way"}
    </span>
  );
}

// City chip — HOURLY only (one-way's city is implicit in its route).
// Same sky-blue language used in admin overview + partner dashboard,
// so the same booking reads the same way wherever it appears.
const CITY_LABEL: Record<string, string> = {
  RIYADH: "Riyadh",
  JEDDAH: "Jeddah",
  MAKKAH: "Makkah",
  MADINAH: "Madinah",
};

function CityBadge({ city }: { city: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border bg-sky-500/10 text-sky-300 border-sky-500/20">
      <MapPin className="w-3 h-3" />
      {CITY_LABEL[city] || city}
    </span>
  );
}

// ============== DRIVER AVATAR ==============
// Three visual states for the driver's photo in the booking detail sidebar:
//   - loading: spinner while the signed GCS URL is being fetched by the browser
//   - loaded:  the image (fades in via opacity transition)
//   - error / no-url: User icon fallback
//
// The state machine resets whenever the photoUrl prop changes — important when
// the sidebar is reused for different bookings without unmounting.

function DriverAvatar({ photoUrl }: { photoUrl: string | null }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">(
    photoUrl ? "loading" : "error",
  );

  useEffect(() => {
    setState(photoUrl ? "loading" : "error");
  }, [photoUrl]);

  return (
    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-luxury-gold/10 flex items-center justify-center flex-shrink-0">
      {state === "loading" && photoUrl && (
        <Loader2 className="w-4 h-4 text-luxury-gold animate-spin" />
      )}
      {state === "error" && <User className="w-5 h-5 text-luxury-gold" />}
      {photoUrl && state !== "error" && (
        <img
          src={photoUrl}
          alt="Driver"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
            state === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}

// 64px gold-bordered driver photo for the booking detail's
// chauffeur card. Distinct from DriverAvatar above (which is the
// 48px utility version used in row-level UI). This one ships with
// shadow + thicker border to read as a portrait, not a thumbnail —
// matches the partner portal's DriverPhoto exactly so the same
// booking presents the same way across portals. Mid-fetch fallback
// is the User icon rather than a spinner, since GCS signed URLs
// typically resolve before the user notices.
function DriverPhotoLarge({
  photoUrl,
  name,
}: {
  photoUrl: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  // proxiedImageUrl: null → null, GCS signed URL → proxy URL,
  // anything else → unchanged. Resize hint of 64 saves bandwidth
  // for an avatar that renders at exactly that size.
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
//   2. Substring keyword match — catches typos and compound names
//      ("super whitee" → contains "white" → uses white's value,
//      "midnight black metallic" → contains "black")
//   3. Neutral gray fallback so the swatch is always visible,
//      never an invisible/transparent empty circle
// Same table the partner portal uses; could be hoisted into a
// shared lib later if a third portal needs it.
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
  const lower = (name || "").toLowerCase().trim();
  if (map[lower]) return map[lower];
  for (const [key, value] of Object.entries(map)) {
    if (lower.includes(key)) return value;
  }
  return "#737373";
}

// ============== BOOKING MAP ==============
//
// Google Static Map showing the trip's location(s). Vendor copy of
// the same component admin and partner views use — dark map style
// matching the panel chrome, green P pin at pickup, red D pin at
// drop-off (ONE_WAY only) with faint connector line, single P pin
// for HOURLY since there's no fixed destination.
//
// Click anywhere on the map opens Google Maps in a new tab — useful
// for vendors planning the route before accepting the offer:
//   ONE_WAY → /maps/dir/?origin=...&destination=...  (directions)
//   HOURLY  → /maps/search/?query=lat,lng            (point lookup)
// Returns null if the API key isn't configured or coords missing,
// so the rest of the detail sidebar keeps rendering cleanly.

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
  if (!apiKey || pickupLat == null || pickupLng == null) return null;

  const isHourly = tripType === "HOURLY";
  const hasDropoff = !isHourly && dropoffLat != null && dropoffLng != null;

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

  const pickupMarker = `&markers=${encodeURIComponent(
    `color:0x10b981|label:P|${pickupLat},${pickupLng}`,
  )}`;

  let dropoffMarker = "";
  let path = "";
  if (hasDropoff) {
    dropoffMarker = `&markers=${encodeURIComponent(
      `color:0xef4444|label:D|${dropoffLat},${dropoffLng}`,
    )}`;
    // 50% alpha keeps the connector line subtle — viewers shouldn't
    // read it as an actual driving route, just a "these two endpoints
    // belong together" cue.
    path = `&path=${encodeURIComponent(
      `color:0x14b8a680|weight:4|${pickupLat},${pickupLng}|${dropoffLat},${dropoffLng}`,
    )}`;
  }

  const url =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?size=600x220&scale=2&maptype=roadmap` +
    pickupMarker +
    dropoffMarker +
    path +
    darkStyle +
    `&key=${apiKey}`;

  // Single click target — uses the shared helper so the URL pattern
  // stays in lockstep with what the WhatsApp message links to. For
  // ONE_WAY: a Directions URL (origin → destination). For HOURLY:
  // a single point lookup at pickup.
  const externalUrl = buildBookingMapsUrl({
    tripType,
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
  });

  return (
    <a
      href={externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden border border-neutral-700 bg-neutral-950 hover:border-luxury-gold/40 transition-colors group relative"
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
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 border border-white/10 text-[11px] text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 backdrop-blur-sm">
        <ChevronRight className="w-3 h-3" />
        {hasDropoff ? "View route in Google Maps" : "View on Google Maps"}
      </div>
    </a>
  );
}

// ============== SERVICE DAY TIMELINE ==============
//
// 24-hour strip showing where the booked window sits in the day.
// HOURLY-only. The map shows WHERE, the timeline shows WHEN — and
// crucially, *when in the day* (early morning vs evening vs
// overnight). Handles midnight wraparound by rendering two violet
// bars with a "Spans midnight" caption.

function ServiceDayTimeline({
  startTime,
  hours,
}: {
  startTime: string;
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

  const VB_W = 480;
  const VB_H = 72;
  const AXIS_LEFT = 28;
  const AXIS_RIGHT = 460;
  const AXIS_Y = 44;
  const BAR_H = 14;
  const AXIS_LEN = AXIS_RIGHT - AXIS_LEFT;

  const minuteToX = (m: number) => {
    const clamped = Math.max(0, Math.min(1440, m));
    return AXIS_LEFT + (clamped / 1440) * AXIS_LEN;
  };

  const startX = minuteToX(startMinutes);
  const segment1EndX = wrapsMidnight ? minuteToX(1440) : minuteToX(endMinutes);
  const segment2EndX = wrapsMidnight ? minuteToX(endMinutes - 1440) : AXIS_LEFT;
  const segment2Width = wrapsMidnight ? segment2EndX - AXIS_LEFT : 0;

  const pad = (n: number) => String(n).padStart(2, "0");
  const startLabel = `${pad(hh)}:${pad(mm)}`;
  const endTotalMin = endMinutes % 1440;
  const endLabel = `${pad(Math.floor(endTotalMin / 60))}:${pad(endTotalMin % 60)}`;

  const startAnchor: "start" | "middle" | "end" =
    startX > VB_W * 0.8 ? "end" : startX < VB_W * 0.1 ? "start" : "middle";
  const endX = wrapsMidnight ? segment2EndX : segment1EndX;
  const endAnchor: "start" | "middle" | "end" =
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
        <line
          x1={AXIS_LEFT}
          y1={AXIS_Y + BAR_H / 2}
          x2={AXIS_RIGHT}
          y2={AXIS_Y + BAR_H / 2}
          stroke="#3f3f46"
          strokeWidth="1"
        />
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
        <line
          x1={startX}
          y1={AXIS_Y - 6}
          x2={startX}
          y2={AXIS_Y}
          stroke="#a78bfa"
          strokeWidth="1"
        />
        <text
          x={startX}
          y={AXIS_Y - 9}
          textAnchor={startAnchor}
          fontSize="10"
          fill="#c4b5fd"
          fontWeight="500"
        >
          {startLabel}
        </text>
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

// ============== MAIN COMPONENT ==============

export default function VendorBookings({
  // Default to "all" — matches the parent page's bookingSubTab
  // default. Specific callers (the dashboard's urgent banner) still
  // pass "new" explicitly to land on New Requests; leaving the
  // fallback as "new" was misleading because most non-banner entry
  // points (sidebar click, View All link) don't want the New
  // Requests slice.
  initialSubTab = "all",
  initialDateFilter,
  refreshBadges,
  vendorStatus,
  expiredRequiredDocs,
}: VendorBookingsProps) {
  const { showNotification } = useNotification();

  // Doc-expiry is its own axis on top of vendorStatus. Vendor must be APPROVED
  // AND have no required profile doc past its expiry date to take new bookings.
  const hasExpiredDocs = (expiredRequiredDocs?.length ?? 0) > 0;

  // Vendor is only allowed to ACCEPT new bookings when their profile is APPROVED.
  // Other actions (reject, start, complete) remain available regardless — they
  // operate on already-known bookings, not on inbound demand.
  const canAcceptBookings = vendorStatus === "APPROVED" && !hasExpiredDocs;
  const acceptLockReason = hasExpiredDocs
    ? `The following profile document${expiredRequiredDocs!.length > 1 ? "s have" : " has"} expired: ${expiredRequiredDocs!.map((d) => d.label).join(", ")}. Submit a profile change request to renew before accepting new bookings.`
    : vendorStatus === "INVITED"
      ? "Complete and submit your profile to start accepting bookings"
      : vendorStatus === "CHANGES_REQUESTED"
        ? "Admin has requested changes to your profile. Update the highlighted fields and resubmit before accepting new bookings."
        : "Your profile must be approved before you can accept new bookings.";

  // ── activeTab: if a date filter is passed (e.g. from dashboard calendar
  //    click), land directly on "All" tab. Lazy initializer runs once on mount.
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (initialDateFilter) return "all";
    if (initialSubTab === "new") return "new_requests";
    return initialSubTab;
  });

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(initialDateFilter || "");
  const [dateTo, setDateTo] = useState(initialDateFilter || "");
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Detail sidebar
  const [selectedBooking, setSelectedBooking] =
    useState<BookingDetailData | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Accept/assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningBooking, setAssigningBooking] = useState<Booking | null>(
    null,
  );
  const [assignmentOptions, setAssignmentOptions] =
    useState<AssignmentOption | null>(null);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  // Reject modal — Stage 3B: now uses an enum dropdown instead of
  // free-text reason. The full booking is captured (not just the id)
  // so the modal can show context like the offer payout and which
  // reason → cascade behavior the vendor should expect.
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingBooking, setRejectingBooking] = useState<Booking | null>(
    null,
  );
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>(
    "CAR_DRIVER_UNAVAILABLE",
  );
  const [isRejecting, setIsRejecting] = useState(false);

  // Action loading (for start/complete)
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Tracks the last initialDateFilter value we reacted to. When the parent
  // sends a NEW date (user clicked a different calendar day while we were
  // already mounted), this lets us detect the change.
  const prevFilterRef = useRef(initialDateFilter);

  // ============== FETCH BOOKINGS ==============
  //
  // Single source of truth. Re-runs automatically whenever any of its deps
  // change (activeTab, dateFrom, dateTo, searchQuery, page, limit). No other
  // useEffect calls fetchBookings — every state change that should trigger
  // a refetch is already in this hook's dependency array.

  const fetchBookings = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, any> = {
        tab: activeTab,
        page: pagination.page,
        limit: pagination.limit,
      };
      if (searchQuery) params.search = searchQuery;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const res = await vendorApi.getBookings(params);
      if (res.success && res.data) {
        setBookings(res.data.bookings || []);
        if (res.data.pagination) {
          setPagination((prev) => ({ ...prev, ...res.data.pagination }));
        }
        if (res.data.tabs) setTabCounts(res.data.tabs);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load bookings");
    } finally {
      setIsLoading(false);
    }
  }, [
    activeTab,
    pagination.page,
    pagination.limit,
    searchQuery,
    dateFrom,
    dateTo,
    showNotification,
  ]);

  // Debounced refetch — 300ms after the latest input change. The debounce
  // protects against double-fires during the calendar-click sequence where
  // multiple state updates land in quick succession.
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchBookings();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchBookings]);

  // React to a parent that pushes a NEW initialDateFilter while we're already
  // mounted (e.g. user is on bookings tab, returns to dashboard, clicks a
  // different date). The useRef guard prevents an infinite loop and stops the
  // effect from firing on the initial mount (where useState already applied
  // initialDateFilter).
  useEffect(() => {
    if (initialDateFilter && initialDateFilter !== prevFilterRef.current) {
      prevFilterRef.current = initialDateFilter;
      setDateFrom(initialDateFilter);
      setDateTo(initialDateFilter);
      setActiveTab("all");
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [initialDateFilter]);

  // ============== HANDLERS THAT RESET PAGINATION ==============
  //
  // Anything that changes a filter MUST reset page to 1 — otherwise the user
  // can be on page 3 of unfiltered results, apply a filter, and see an empty
  // page even when results exist on page 1.

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleDateFromChange = (d: string) => {
    setDateFrom(d);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleDateToChange = (d: string) => {
    setDateTo(d);
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleResetDates = () => {
    setDateFrom("");
    setDateTo("");
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  const handleLimitChange = (limit: number) => {
    setPagination((prev) => ({ ...prev, limit, page: 1 }));
  };

  // ============== VIEW DETAIL ==============

  const handleViewDetail = async (bookingId: string) => {
    setIsLoadingDetail(true);
    try {
      const res = await vendorApi.getBooking(bookingId);
      if (res.success && res.data) setSelectedBooking(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load booking");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // ============== ACCEPT (ASSIGN) ==============

  const handleOpenAssign = async (booking: Booking) => {
    setAssigningBooking(booking);
    setShowAssignModal(true);
    setIsLoadingOptions(true);
    setSelectedDriver("");
    setSelectedVehicle("");
    try {
      const res = await vendorApi.getAssignmentOptions(booking.id);
      if (res.success && res.data) setAssignmentOptions(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load options");
      setShowAssignModal(false);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const handleAcceptAndAssign = async () => {
    if (!assigningBooking || !selectedDriver || !selectedVehicle) {
      showNotification("error", "Please select both driver and vehicle");
      return;
    }
    setIsAssigning(true);
    try {
      const res = await vendorApi.acceptBooking(assigningBooking.id, {
        driverId: selectedDriver,
        vehicleId: selectedVehicle,
      });
      if (res.success) {
        showNotification("success", res.message || "Booking accepted");
        setShowAssignModal(false);
        setAssigningBooking(null);
        setAssignmentOptions(null);
        fetchBookings();
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to accept booking");
    } finally {
      setIsAssigning(false);
    }
  };

  // ============== REJECT ==============

  const handleOpenReject = (booking: Booking) => {
    // Used to open a centered popup modal; now the rejection form
    // lives inline inside the detail panel (same shape as the driver
    // and fleet inline-edit affordances). When triggered from a list
    // row we also open the detail for that booking so the inline form
    // has a container to render in. If detail is already open for this
    // booking, we just flip the form-expanded flag.
    setRejectingBooking(booking);
    setRejectionReason("CAR_DRIVER_UNAVAILABLE");
    setShowRejectModal(true);
    if (!selectedBooking || selectedBooking.id !== booking.id) {
      // Fire-and-forget — detail will populate while admin sees the
      // form. selectedBooking gets set inside this; the form's content
      // already has everything it needs from `rejectingBooking`.
      handleViewDetail(booking.id);
    }
  };

  const handleReject = async () => {
    if (!rejectingBooking) return;
    setIsRejecting(true);
    try {
      // Backend accepts the enum value directly as `reason`. Stage 3B-1
      // branching:
      //   - PRICE_TOO_LOW at attempt 1 → booking transitions to
      //     ASSIGNMENT_RE_OFFERED, stays with this vendor; admin can
      //     send a revised offer.
      //   - Everything else (or PRICE_TOO_LOW at attempt 2) → booking
      //     cascades to the next eligible vendor in the pool.
      const res = await vendorApi.rejectBooking(rejectingBooking.id, {
        reason: rejectionReason,
      });
      if (res.success) {
        showNotification("info", res.message || "Booking rejected");
        setShowRejectModal(false);
        setRejectingBooking(null);
        // Close the detail panel — for non-PRICE_TOO_LOW rejections the
        // booking cascades away from this vendor so showing the detail
        // is no longer meaningful, and even for PRICE_TOO_LOW the
        // status moves to ASSIGNMENT_RE_OFFERED with stale data in
        // selectedBooking until a refetch lands. fetchBookings()
        // refreshes the list; user can reopen the booking if they
        // want to see the updated state.
        setSelectedBooking(null);
        fetchBookings();
        refreshBadges();
      }
    } catch (err: any) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err?.message || "Failed to reject booking";
      showNotification("error", msg);
    } finally {
      setIsRejecting(false);
    }
  };

  // ============== START / COMPLETE TRIP ==============

  const handleStartTrip = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      const res = await vendorApi.startTrip(bookingId);
      if (res.success) {
        showNotification("success", res.message || "Trip started");
        fetchBookings();
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to start trip");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteTrip = async (bookingId: string) => {
    setActionLoading(bookingId);
    try {
      const res = await vendorApi.completeTrip(bookingId);
      if (res.success) {
        showNotification("success", res.message || "Trip completed");
        fetchBookings();
        refreshBadges();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to complete trip");
    } finally {
      setActionLoading(null);
    }
  };

  // ============== EXPORT CSV ==============

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const params: Record<string, any> = { tab: activeTab };
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      await vendorApi.exportBookingsCsv(params);
      showNotification("success", "CSV export downloaded");
    } catch (err: any) {
      showNotification("error", err.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  // ============== ASSIGNMENT HELPERS ==============

  function getVehicleAvailabilitySummary(
    vehicles: AssignmentVehicle[],
    requestedClass: string,
  ) {
    const classLabel = getVehicleClassConfig(requestedClass).label;
    const matching = vehicles;
    const available = matching.filter((v) => !v.isBusy);
    const unavailable = matching.filter((v) => v.isBusy);
    return { classLabel, matching, available, unavailable };
  }

  function getDriverAvailabilitySummary(drivers: AssignmentDriver[]) {
    const available = drivers.filter((d) => !d.isBusy);
    const unavailable = drivers.filter((d) => d.isBusy);
    return { available, unavailable };
  }

  // ============== RENDER HELPERS ==============

  const renderRoute = (b: Booking) =>
    b.route || `${b.pickupAddress} → ${b.dropoffAddress}`;

  // PO icon button — appears alongside every row's state-specific
  // actions. Reusing it across branches (offer / confirmed / in-
  // progress / default) keeps each branch focused on the state's
  // primary action and gives the vendor one consistent place to
  // grab the PO regardless of state. Errors surface as toasts; the
  // PO opens in a new tab on success.
  const poButton = (bookingId: string) => (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await downloadPOWindow(bookingId);
        } catch (err: any) {
          showNotification("error", err?.message || "Could not open the PO");
        }
      }}
      title="Download PO"
      aria-label="Download Purchase Order"
      className="p-1.5 rounded-lg text-gray-400 hover:text-luxury-gold hover:bg-neutral-700/50 transition-colors flex-shrink-0"
    >
      <FileText className="w-3.5 h-3.5" />
    </button>
  );

  const renderActions = (booking: Booking) => {
    const isActionLoading = actionLoading === booking.id;

    // Accept / Reject only show when this vendor has an outstanding
    // offer awaiting their response. `isActionable` is the
    // authoritative flag — it accounts for ASSIGNMENT_RE_OFFERED's
    // two sub-states (just declined for price vs admin re-offered
    // with revised price). Fall back to isOfferState() for old API
    // responses that predate this field; new responses always set it.
    const showOfferActions =
      booking.isActionable !== undefined
        ? booking.isActionable
        : isOfferState(booking.status);

    if (showOfferActions) {
      return (
        <div className="flex gap-2 items-center">
          <button
            onClick={() => handleOpenReject(booking)}
            className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs hover:bg-red-500/20 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() =>
              canAcceptBookings
                ? handleOpenAssign(booking)
                : showNotification("warning", acceptLockReason)
            }
            disabled={!canAcceptBookings}
            title={canAcceptBookings ? undefined : acceptLockReason}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
              canAcceptBookings
                ? "bg-green-500 text-white hover:bg-green-400"
                : "bg-neutral-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {!canAcceptBookings && <ShieldAlert className="w-3 h-3" />}
            Accept
          </button>
          {poButton(booking.id)}
        </div>
      );
    }

    if (booking.status === "CONFIRMED") {
      return (
        <div className="flex gap-2 items-center">
          <button
            onClick={() => handleStartTrip(booking.id)}
            disabled={isActionLoading}
            className="px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg text-xs hover:bg-blue-500/20 transition-colors disabled:opacity-50"
          >
            {isActionLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              "Start Trip"
            )}
          </button>
          {poButton(booking.id)}
        </div>
      );
    }

    if (booking.status === "IN_PROGRESS") {
      return (
        <div className="flex gap-2 items-center">
          <button
            onClick={() => handleCompleteTrip(booking.id)}
            disabled={isActionLoading}
            className="px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg text-xs hover:bg-green-500/20 transition-colors disabled:opacity-50"
          >
            {isActionLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              "Complete"
            )}
          </button>
          {poButton(booking.id)}
        </div>
      );
    }

    return (
      <div className="flex gap-2 items-center">
        <button
          onClick={() => handleViewDetail(booking.id)}
          className="text-xs text-luxury-gold hover:underline"
        >
          View Details
        </button>
        {poButton(booking.id)}
      </div>
    );
  };

  // ============== RENDER ==============

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Status-aware lock banner — only shown when vendor cannot accept new
          bookings. Doc-expired takes precedence because it's the more
          actionable signal (vendor needs to renew a specific doc). */}
      {!canAcceptBookings && (hasExpiredDocs || vendorStatus) && (
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
                : vendorStatus === "INVITED"
                  ? "Profile not yet submitted"
                  : vendorStatus === "PENDING_REVIEW"
                    ? "Profile under review"
                    : vendorStatus === "CHANGES_REQUESTED"
                      ? "Admin requested profile changes"
                      : "Booking acceptance disabled"}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                hasExpiredDocs ? "text-red-400/70" : "text-amber-400/70"
              }`}
            >
              {hasExpiredDocs
                ? `Renew the expired document${expiredRequiredDocs!.length > 1 ? "s" : ""} via the profile change-request flow. You can continue ongoing trips and reject pending requests, but cannot accept new bookings until renewed.`
                : "You can view existing bookings, reject pending requests, and continue with active trips. Accepting new bookings will be available once your profile is approved."}
            </p>
          </div>
        </div>
      )}

      {/* Tabs & Search */}
      <div className="space-y-3 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-4">
        <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 -mx-1 px-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-3 lg:px-4 py-2 rounded-lg text-xs lg:text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-2 ${
                activeTab === tab.key
                  ? "bg-luxury-gold text-black"
                  : "bg-neutral-800 text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
              {/* Tab badges only make sense for tabs that represent
                  actionable work. New Requests is the only tab where
                  the vendor genuinely needs to act on each row
                  (accept/reject). Active/Completed/Cancelled/All are
                  pure filters over historical or in-flight data; their
                  counts already surface in the table footer via
                  pagination, and showing them up here makes idle rows
                  look like alerts. */}
              {tab.key === "new_requests" &&
                tabCounts[tab.key] !== undefined &&
                tabCounts[tab.key] > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-xs rounded-full ${
                      activeTab === tab.key
                        ? "bg-black/20 text-black"
                        : "bg-luxury-gold text-black"
                    }`}
                  >
                    {tabCounts[tab.key]}
                  </span>
                )}
            </button>
          ))}
        </div>

        <div className="flex gap-2 lg:contents">
          <div className="relative flex-1 lg:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search bookings..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full lg:w-64 pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none"
            />
          </div>

          <button
            onClick={handleExportCSV}
            disabled={isExporting || bookings.length === 0}
            className="lg:ml-auto flex items-center gap-2 px-3 lg:px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors text-sm disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Export</span>
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
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col flex-1 sm:flex-none">
            <label className="text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="w-full sm:w-auto px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none"
            />
          </div>
          <span className="text-gray-500 pb-2">-</span>
          <div className="flex flex-col flex-1 sm:flex-none">
            <label className="text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="w-full sm:w-auto px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={handleResetDates}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className={`bg-neutral-900 border rounded-xl p-4 ${
                  isOfferState(booking.status)
                    ? "border-yellow-500/30"
                    : "border-neutral-800"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-luxury-gold font-mono">
                      {booking.bookingRef}
                    </p>
                    <p className="text-sm font-medium text-white mt-0.5">
                      {booking.guestName}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded border ${getBookingStatusColor(booking)}`}
                  >
                    {/* Use the backend-derived statusLabel rather than
                        formatStatus(booking.status). The backend
                        differentiates ASSIGNMENT_OFFERED ("New Request"),
                        ASSIGNMENT_RE_OFFERED + PENDING offer ("Revised
                        Offer"), and ASSIGNMENT_RE_OFFERED + REJECTED
                        offer ("Awaiting Revised Offer"). Falling back
                        to formatStatus collapses these into a single
                        "New Request" pill, which is what caused the
                        "status didn't change after my rejection" bug. */}
                    {booking.statusLabel || formatStatus(booking.status)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-2">
                  <VehicleClassBadge vehicleClass={booking.vehicleClass} />
                  <TripTypeBadge
                    tripType={booking.tripType}
                    hours={booking.hours}
                    hourlyDuration={booking.hourlyDuration}
                  />
                  {booking.tripType === "HOURLY" && (
                    <CityBadge city={booking.city} />
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">
                    {booking.tripType === "HOURLY"
                      ? booking.pickupAddress
                      : renderRoute(booking)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(booking.tripDate)}</span>
                    <Clock className="w-3.5 h-3.5 ml-2" />
                    <span>{booking.tripTime}</span>
                  </div>
                  {/* Money display: prefer vendorPayoutAmount (what
                      admin offered/agreed with this vendor) when
                      backend exposes it; otherwise fall back to
                      totalPrice for backwards-compat. For offer-state
                      bookings the payout is the figure the vendor
                      needs to see when deciding whether to accept. */}
                  {booking.vendorPayoutAmount != null ? (
                    <div className="text-right">
                      <p className="text-[10px] text-gray-500 leading-none">
                        Your Payout
                      </p>
                      <span className="text-sm font-medium text-luxury-gold">
                        SAR{" "}
                        {Number(booking.vendorPayoutAmount).toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm font-medium text-white">
                      SAR {Number(booking.totalPrice).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="pt-3 border-t border-neutral-800">
                  {renderActions(booking)}
                </div>
              </div>
            ))}
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
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type / Class
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Route
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date/Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Amount
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
                  {bookings.map((booking) => (
                    <tr
                      key={booking.id}
                      className="border-b border-neutral-800 last:border-0 hover:bg-neutral-800/50"
                    >
                      <td className="px-4 py-3 text-sm text-luxury-gold font-mono">
                        {booking.bookingRef}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-white">
                          {booking.guestName}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <TripTypeBadge
                            tripType={booking.tripType}
                            hours={booking.hours}
                            hourlyDuration={booking.hourlyDuration}
                          />
                          {/* City chip only for HOURLY — one-way rows
                              carry their city implicitly via the route
                              cell, so a separate chip would be
                              redundant. Matches admin overview + partner
                              dashboard treatment. */}
                          {booking.tripType === "HOURLY" && (
                            <CityBadge city={booking.city} />
                          )}
                          <VehicleClassBadge
                            vehicleClass={booking.vehicleClass}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate">
                        {booking.tripType === "HOURLY"
                          ? booking.pickupAddress
                          : renderRoute(booking)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                        {formatDate(booking.tripDate)} {booking.tripTime}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                        {booking.vendorPayoutAmount != null ? (
                          <>
                            <span className="text-luxury-gold">
                              SAR{" "}
                              {Number(
                                booking.vendorPayoutAmount,
                              ).toLocaleString()}
                            </span>
                            <p className="text-[10px] text-gray-500 leading-none mt-0.5">
                              Your Payout
                            </p>
                          </>
                        ) : (
                          <span className="text-white">
                            SAR {Number(booking.totalPrice).toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-1 text-xs rounded border ${getBookingStatusColor(booking)}`}
                        >
                          {/* See list-view note above — same reasoning. */}
                          {booking.statusLabel || formatStatus(booking.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{renderActions(booking)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Empty State */}
          {bookings.length === 0 && !isLoading && (
            <Empty className="bg-neutral-900 border border-neutral-800 rounded-xl py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-neutral-800">
                  <Calendar className="w-5 h-5 text-gray-400" />
                </EmptyMedia>
                <EmptyTitle className="text-white">
                  No Bookings Found
                </EmptyTitle>
                <EmptyDescription className="text-gray-400">
                  {searchQuery || dateFrom || dateTo
                    ? "Try adjusting your filters or search terms"
                    : "Bookings will appear here"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {/* Pagination */}
          {pagination.total > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <p className="text-xs sm:text-sm text-gray-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total,
                  )}{" "}
                  of {pagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-gray-500">
                    Show:
                  </span>
                  <select
                    value={pagination.limit}
                    onChange={(e) => handleLimitChange(Number(e.target.value))}
                    className="px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:border-luxury-gold focus:outline-none"
                  >
                    {ITEMS_PER_PAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {pagination.totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1.5 bg-neutral-800 text-gray-400 rounded-lg text-sm hover:text-white disabled:opacity-50 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex gap-1">
                    {Array.from(
                      { length: Math.min(pagination.totalPages, 5) },
                      (_, i) => i + 1,
                    ).map((page) => (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          pagination.page === page
                            ? "bg-luxury-gold text-black"
                            : "bg-neutral-800 text-gray-400 hover:text-white"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 bg-neutral-800 text-gray-400 rounded-lg text-sm hover:text-white disabled:opacity-50 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ============== BOOKING DETAIL SIDEBAR ============== */}
      {selectedBooking && (
        // Detail-panel close handler. We always reset the inline
        // reject form state alongside the detail — without this,
        // opening detail A → expanding the reject form → closing →
        // opening detail B would leave the form's open flag stale
        // even though `rejectingBooking.id` no longer matches the
        // current selection.
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setSelectedBooking(null);
              setShowRejectModal(false);
              setRejectingBooking(null);
            }}
          />
          <div className="relative ml-auto w-full max-w-md bg-neutral-900 border-l border-neutral-700 shadow-2xl h-full overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
              <div className="min-w-0">
                {/* Header mirrors the admin booking detail modal: booking
                    ref is the primary heading, status pill sits directly
                    beneath. Removed the "Booking Details" title and the
                    separate badge row (trip type + vehicle class are now
                    surfaced in the Trip Details card and the meta row
                    respectively — same as admin). */}
                <h2 className="text-xl font-bold text-white font-mono truncate">
                  {selectedBooking.bookingRef}
                </h2>
                <span
                  className={`mt-1 inline-block px-2 py-0.5 text-xs rounded-full border ${getStatusColor(selectedBooking.status)}`}
                >
                  {selectedBooking.statusLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Download PO — also exposed inline on each row, but
                    surfaced prominently here since the detail panel
                    is where vendors spend the most time reviewing a
                    booking. Opens in a new tab, triggers print
                    dialog automatically. */}
                <button
                  onClick={async () => {
                    try {
                      await downloadPOWindow(selectedBooking.id);
                    } catch (err: any) {
                      showNotification(
                        "error",
                        err?.message || "Could not open the PO",
                      );
                    }
                  }}
                  title="Download Purchase Order"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 text-gray-300 hover:text-luxury-gold hover:bg-neutral-700 border border-neutral-700 rounded-lg text-xs transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  PO
                </button>
                <button
                  onClick={() => {
                    setSelectedBooking(null);
                    setShowRejectModal(false);
                    setRejectingBooking(null);
                  }}
                  className="p-1 hover:bg-neutral-800 rounded"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Trip type + vehicle class badges. Small metadata pills,
                  visually secondary to the status. Kept because the
                  vendor's list view surfaces them and users expect to
                  see them mirrored here. */}
              <div className="flex flex-wrap items-center gap-2">
                <TripTypeBadge
                  tripType={selectedBooking.trip.tripType}
                  hours={selectedBooking.trip.hours}
                  hourlyDuration={selectedBooking.trip.hourlyDuration}
                />
                <VehicleClassBadge
                  vehicleClass={selectedBooking.vehicleClass}
                />
              </div>

              {selectedBooking.timeline &&
                selectedBooking.timeline.length > 0 && (
                  <div className="p-4 bg-neutral-800/50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
                      Timeline
                    </p>
                    <div className="space-y-3">
                      {selectedBooking.timeline.map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div
                            className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                              step.status === "completed"
                                ? "bg-green-400"
                                : step.status === "current"
                                  ? "bg-luxury-gold"
                                  : "bg-neutral-600"
                            }`}
                          />
                          <div>
                            <p
                              className={`text-sm ${step.status === "upcoming" ? "text-gray-500" : "text-white"}`}
                            >
                              {step.label}
                            </p>
                            {step.timestamp && (
                              <p className="text-xs text-gray-500">
                                {new Date(step.timestamp).toLocaleString()}
                              </p>
                            )}
                            {step.description && step.status === "current" && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {step.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Customer card — mirrors the admin's booking-detail
                  layout: iconified section heading, label/value rows.
                  Email surfaces here too (vendor's detail payload
                  exposes it as nullable). Vendor detail intentionally
                  omits partner/origin attribution, so no Partner row
                  appears — that's admin-only. */}
              <div className="bg-neutral-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-luxury-gold" /> Customer
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500 flex-shrink-0">Name</span>
                    <span className="text-white text-right break-words">
                      {selectedBooking.customer.name}
                    </span>
                  </div>
                  {selectedBooking.customer.email && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500 flex-shrink-0">Email</span>
                      <span className="text-white text-right break-all">
                        {selectedBooking.customer.email}
                      </span>
                    </div>
                  )}
                  {selectedBooking.customer.phone && (
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-500 flex-shrink-0">Phone</span>
                      <span className="text-white text-right">
                        {selectedBooking.customer.phone}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Trip details — trip-type-aware
                  ────────────────────────────────────────────────
                  Mirrors the structured cards used in admin and
                  partner detail panels. HOURLY → violet Service
                  Window with Duration/Starts/Ends-approx grid;
                  ONE_WAY → teal Trip Route with pickup → dots →
                  drop-off. Both pair with a static map below;
                  HOURLY also gets the Service Day timeline so
                  the vendor sees *when* the booking sits in the
                  day at a glance. */}
              {selectedBooking.trip.tripType === "HOURLY" ? (
                (() => {
                  // Best-effort end-of-service computation. Failures
                  // (malformed time, edge math) just suppress the
                  // end-time line rather than throw.
                  let approxEnd: string | null = null;
                  try {
                    if (
                      selectedBooking.trip.hours &&
                      selectedBooking.trip.tripTime
                    ) {
                      const [hh, mm] = selectedBooking.trip.tripTime
                        .split(":")
                        .map((n) => parseInt(n, 10));
                      if (Number.isFinite(hh) && Number.isFinite(mm)) {
                        const start = new Date();
                        start.setHours(hh, mm, 0, 0);
                        const end = new Date(
                          start.getTime() +
                            selectedBooking.trip.hours * 3_600_000,
                        );
                        const pad = (n: number) => String(n).padStart(2, "0");
                        const sameDay =
                          end.getDate() === start.getDate() &&
                          end.getMonth() === start.getMonth();
                        approxEnd = `${pad(end.getHours())}:${pad(end.getMinutes())}${sameDay ? "" : " (next day)"}`;
                      }
                    }
                  } catch {
                    approxEnd = null;
                  }
                  return (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
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
                              {selectedBooking.trip.hours
                                ? `${selectedBooking.trip.hours} hours`
                                : "By the Hour"}
                            </p>
                            {selectedBooking.trip.hourlyDuration &&
                              selectedBooking.trip.hourlyDuration !==
                                `${selectedBooking.trip.hours} hours` && (
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                  {selectedBooking.trip.hourlyDuration}
                                </p>
                              )}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">
                              Starts
                            </p>
                            <p className="text-white font-medium">
                              {selectedBooking.trip.tripTime || "—"}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {new Date(
                                selectedBooking.trip.tripDate,
                              ).toLocaleDateString("en-SA", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
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
                            <p className="text-sm text-white">
                              {selectedBooking.trip.pickupAddress}
                            </p>
                          </div>
                        </div>
                        {selectedBooking.trip.flightNumber && (
                          <p className="text-xs text-gray-400">
                            Flight: {selectedBooking.trip.flightNumber}
                            {selectedBooking.trip.terminalNo
                              ? ` · Terminal: ${selectedBooking.trip.terminalNo}`
                              : ""}
                          </p>
                        )}
                      </div>
                      <ServiceDayTimeline
                        startTime={selectedBooking.trip.tripTime || ""}
                        hours={selectedBooking.trip.hours}
                      />
                      <BookingMap
                        tripType="HOURLY"
                        pickupLat={selectedBooking.trip.pickupLat}
                        pickupLng={selectedBooking.trip.pickupLng}
                        dropoffLat={null}
                        dropoffLng={null}
                      />
                    </div>
                  );
                })()
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-3">
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
                          {selectedBooking.trip.pickupAddress}
                        </p>
                      </div>
                    </div>
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
                          {selectedBooking.trip.dropoffAddress}
                        </p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-teal-500/15 flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        {new Date(
                          selectedBooking.trip.tripDate,
                        ).toLocaleDateString("en-SA", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="text-white font-medium">
                        {selectedBooking.trip.tripTime || "—"}
                      </span>
                    </div>
                    {selectedBooking.trip.flightNumber && (
                      <p className="text-xs text-gray-400">
                        Flight: {selectedBooking.trip.flightNumber}
                        {selectedBooking.trip.terminalNo
                          ? ` · Terminal: ${selectedBooking.trip.terminalNo}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <BookingMap
                    tripType="ONE_WAY"
                    pickupLat={selectedBooking.trip.pickupLat}
                    pickupLng={selectedBooking.trip.pickupLng}
                    dropoffLat={selectedBooking.trip.dropoffLat}
                    dropoffLng={selectedBooking.trip.dropoffLng}
                  />
                </div>
              )}

              {/* Vehicle + Passenger meta row — small metadata line
                  under the Trip Route/Service Window card, matches
                  the admin panel's structure. Date & time already
                  live inside the trip card above, so we don't
                  duplicate them here. */}
              <div className="bg-neutral-800 rounded-xl p-3 flex items-center gap-4 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-luxury-gold" />
                  <span className="text-gray-400">Vehicle:</span>
                  <span className="text-white">
                    {selectedBooking.vehicleClass || "—"}
                  </span>
                </div>
                {selectedBooking.passengers != null && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-luxury-gold" />
                    <span className="text-gray-400">Passengers:</span>
                    <span className="text-white">
                      {selectedBooking.passengers}
                    </span>
                  </div>
                )}
              </div>

              {/* Pricing card — admin-style icon header. Content
                  branches on backend payload (Stage 3B-1 direction
                  inversion): the vendor sees `vendorPayoutAmount`
                  (what they earn) when it's exposed; otherwise falls
                  back to the legacy basePrice/vat/total breakdown for
                  compat. Card chrome matches the admin panel exactly;
                  only the values shown differ. */}
              <div className="bg-neutral-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-luxury-gold" /> Pricing
                </h3>
                {selectedBooking.pricing.vendorPayoutAmount != null ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between pt-1 font-semibold">
                      <span className="text-white">Your Payout</span>
                      <span className="text-luxury-gold">
                        SAR{" "}
                        {Number(
                          selectedBooking.pricing.vendorPayoutAmount,
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug">
                      Amount you will be paid for this booking.
                      {isOfferState(selectedBooking.status) &&
                        " Accept to lock this rate, or reject if it doesn't work for you."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Base Price</span>
                      <span className="text-white">
                        SAR{" "}
                        {Number(
                          selectedBooking.pricing.basePrice,
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">VAT (15%)</span>
                      <span className="text-white">
                        SAR{" "}
                        {Number(
                          selectedBooking.pricing.vatAmount,
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-neutral-700 font-semibold">
                      <span className="text-white">Total</span>
                      <span className="text-luxury-gold">
                        SAR{" "}
                        {Number(
                          selectedBooking.pricing.totalPrice,
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* ============== CHAUFFEUR CARD ==============
                  Premium two-section card for the assigned driver +
                  vehicle. Same visual language as the partner
                  portal's detail panel — gold-tinted border, driver
                  section on top with gold gradient, vehicle section
                  below, brand wordmark tile, plate number in
                  monospace gold. The same booking should read the
                  same way regardless of which portal opens it.

                  Vendor-specific framing: labels say "Driver" and
                  "Vehicle" rather than "Your Chauffeur" / "Your
                  Vehicle" (partner-side, customer-facing language)
                  — vendor is the *provider* of these assets, not
                  the recipient, so the operational phrasing fits
                  better. Empty states ("Driver Not Yet Assigned" /
                  "Vehicle Not Yet Assigned") apply when the
                  booking is in offer state — vendor hasn't
                  accepted and picked their crew yet.

                  We render this section *only* when the booking
                  has progressed past offer state, OR when driver/
                  vehicle is already present. In pure offer state
                  the assignment is selected through the Accept
                  flow's inline form, not pre-displayed here. */}
              {(selectedBooking.assignedDriver ||
                selectedBooking.assignedVehicle ||
                !isOfferState(selectedBooking.status)) && (
                <div className="rounded-xl overflow-hidden border border-luxury-gold/30 bg-gradient-to-br from-luxury-gold/[0.03] to-transparent">
                  {/* ----- Driver section ----- */}
                  <div className="p-4 bg-gradient-to-r from-luxury-gold/10 to-transparent border-b border-luxury-gold/10">
                    <p className="text-[10px] tracking-[0.2em] uppercase text-luxury-gold/80 mb-3 font-medium">
                      Driver
                    </p>
                    {selectedBooking.assignedDriver ? (
                      <div className="flex items-start gap-4">
                        <DriverPhotoLarge
                          photoUrl={selectedBooking.assignedDriver.photoUrl}
                          name={selectedBooking.assignedDriver.name}
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-base font-semibold text-white truncate">
                            {selectedBooking.assignedDriver.name}
                          </h4>
                          {selectedBooking.assignedDriver.rating != null && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Star className="w-3.5 h-3.5 text-luxury-gold fill-luxury-gold" />
                              <span className="text-xs text-luxury-gold font-medium">
                                {Number(
                                  selectedBooking.assignedDriver.rating,
                                ).toFixed(1)}
                              </span>
                            </div>
                          )}
                          {selectedBooking.assignedDriver.phone && (
                            <a
                              href={`tel:${selectedBooking.assignedDriver.phone}`}
                              className="inline-flex items-center gap-1.5 mt-2 text-sm text-gray-300 hover:text-luxury-gold transition-colors"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              {selectedBooking.assignedDriver.phone}
                            </a>
                          )}
                          {/* Quick-share row — one tap from vendor
                              to either (a) shoot the full booking
                              brief to the driver's WhatsApp, or
                              (b) drop the trip onto a Google
                              Calendar. The WhatsApp message itself
                              embeds the calendar link too, so the
                              driver can add it to their calendar
                              from inside the chat without the
                              vendor doing anything extra.

                              WhatsApp button only renders when a
                              driver phone exists (no number → no
                              wa.me target). Calendar always
                              renders when a driver is assigned
                              since it's based on the booking, not
                              the driver. */}
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {selectedBooking.assignedDriver.phone && (
                              <a
                                href={buildWhatsAppUrl(
                                  selectedBooking.assignedDriver.phone,
                                  buildDriverMessage(selectedBooking),
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30 hover:bg-[#25D366]/25 transition-colors"
                                title="Send full booking brief to driver on WhatsApp"
                              >
                                <WhatsAppIcon className="w-3.5 h-3.5" />
                                WhatsApp
                              </a>
                            )}
                            <a
                              href={vendorCalendarUrl(selectedBooking)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
                              title="Open Google Calendar with this booking pre-filled"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              Add to Calendar
                            </a>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-gray-400 py-2">
                        <div className="w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center flex-shrink-0">
                          <User className="w-6 h-6 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-300">
                            Driver Not Yet Assigned
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Assign one of your drivers on acceptance
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ----- Vehicle section ----- */}
                  <div className="p-4">
                    <p className="text-[10px] tracking-[0.2em] uppercase text-luxury-gold/80 mb-3 font-medium">
                      Vehicle
                    </p>
                    {selectedBooking.assignedVehicle ? (
                      <div className="flex items-center gap-4">
                        {/* Brand wordmark tile — make's first word
                            in serif caps on a gold-tinted gradient.
                            Feels closer to how luxury automotive
                            brands present themselves than a clip-art
                            car icon would. */}
                        <div className="relative w-24 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-luxury-gold/20 via-luxury-gold/5 to-neutral-900 border border-luxury-gold/30 flex items-center justify-center">
                          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-luxury-gold/10" />
                          {selectedBooking.assignedVehicle.make?.trim() ? (
                            <span
                              className="relative font-serif text-base tracking-tight text-luxury-gold uppercase leading-none"
                              style={{ letterSpacing: "-0.02em" }}
                            >
                              {selectedBooking.assignedVehicle.make
                                .split(" ")[0]
                                .slice(0, 8)}
                            </span>
                          ) : (
                            <Car className="relative w-8 h-8 text-luxury-gold" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-base font-semibold text-white">
                            {selectedBooking.assignedVehicle.year}{" "}
                            {selectedBooking.assignedVehicle.make}{" "}
                            {selectedBooking.assignedVehicle.model}
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                            {selectedBooking.assignedVehicle.color && (
                              <>
                                <span className="flex items-center gap-1.5 text-gray-300">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full border border-gray-500/50 shadow-inner"
                                    style={{
                                      backgroundColor: vehicleColorToCss(
                                        selectedBooking.assignedVehicle.color,
                                      ),
                                    }}
                                    aria-hidden
                                  />
                                  {selectedBooking.assignedVehicle.color}
                                </span>
                                <span className="text-gray-600">•</span>
                              </>
                            )}
                            <span className="font-mono tracking-wider text-luxury-gold">
                              {selectedBooking.assignedVehicle.plateNumber}
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
                          <p className="text-sm text-gray-300">
                            Vehicle Not Yet Assigned
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Pick a vehicle when accepting this booking
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedBooking.notes && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-300">
                    {selectedBooking.notes}
                  </p>
                </div>
              )}

              {/* ============== INLINE ACTIONS (offer state) ==============
                  When the booking is in offer state (ASSIGNMENT_OFFERED
                  or ASSIGNMENT_RE_OFFERED), expose Accept + Reject right
                  inside the detail panel. Previously rejection happened
                  through a centered popup modal which looked
                  disconnected from the booking it referred to; this
                  matches the inline pattern used in admin's vendor
                  drivers / fleet review where Accept/Reject sit next to
                  the field they apply to. Clicking Reject expands an
                  inline form below (replacing the two buttons) without
                  navigating away from the detail context. */}
              {(selectedBooking.isActionable !== undefined
                ? selectedBooking.isActionable
                : isOfferState(selectedBooking.status)) && (
                <div className="pt-3 border-t border-neutral-800">
                  {showRejectModal &&
                  rejectingBooking?.id === selectedBooking.id ? (
                    // Inline reject form. Lives in the same content
                    // flow as the rest of the detail so scrolling and
                    // layout behave naturally on small screens.
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">
                          Reject this booking
                        </p>
                        {rejectingBooking.vendorPayoutAmount != null && (
                          <p className="text-xs text-gray-500">
                            Offered:{" "}
                            <span className="text-luxury-gold font-medium">
                              SAR{" "}
                              {Number(
                                rejectingBooking.vendorPayoutAmount,
                              ).toLocaleString()}
                            </span>
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5">
                          Reason for declining
                        </label>
                        <select
                          value={rejectionReason}
                          onChange={(e) =>
                            setRejectionReason(
                              e.target.value as RejectionReason,
                            )
                          }
                          disabled={isRejecting}
                          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 disabled:opacity-50"
                        >
                          {REJECTION_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* PRICE_TOO_LOW branch — booking stays with this
                          vendor at attempt 1 to let admin send a
                          revised offer. Any other reason cascades. */}
                      {rejectionReason === "PRICE_TOO_LOW" ? (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs text-amber-300 font-medium">
                              If admin revises the price, you'll get a
                              notification.
                            </p>
                            <p className="text-[11px] text-amber-300/70 mt-1">
                              Admin may send you a revised offer for the same
                              booking. If you decline again or pick a different
                              reason, the booking goes to the next eligible
                              vendor.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-500 leading-snug">
                          The booking will be re-offered to the next eligible
                          vendor in the pool. You won't receive this booking
                          again.
                        </p>
                      )}

                      <div className="flex gap-3 pt-1">
                        <button
                          onClick={() => {
                            setShowRejectModal(false);
                            setRejectingBooking(null);
                          }}
                          disabled={isRejecting}
                          className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={isRejecting}
                          className="flex-1 px-4 py-2.5 bg-red-500 text-white font-medium rounded-lg hover:bg-red-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                          {isRejecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Default state: side-by-side action buttons.
                    // Accept opens the slide-in Assign sidebar (which
                    // is a separate panel because it needs a richer UI
                    // for driver + vehicle selection); Reject expands
                    // the inline form above. Both handlers were
                    // written for the flat list-row Booking shape, so
                    // we adapt selectedBooking (BookingDetailData) at
                    // the call site rather than widening the handler
                    // signatures.
                    <div className="flex gap-3">
                      <button
                        onClick={() =>
                          handleOpenReject(
                            detailToBookingShape(selectedBooking),
                          )
                        }
                        className="flex-1 px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                      <button
                        onClick={() =>
                          canAcceptBookings
                            ? handleOpenAssign(
                                detailToBookingShape(selectedBooking),
                              )
                            : showNotification("warning", acceptLockReason)
                        }
                        disabled={!canAcceptBookings}
                        title={canAcceptBookings ? undefined : acceptLockReason}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                          canAcceptBookings
                            ? "bg-green-500 text-white hover:bg-green-400"
                            : "bg-neutral-800 text-gray-500 cursor-not-allowed"
                        }`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Accept
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============== ACCEPT & ASSIGN SIDEBAR ============== */}
      <div
        className={`fixed inset-0 z-50 ${showAssignModal ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${showAssignModal ? "opacity-100" : "opacity-0"}`}
          onClick={() => !isAssigning && setShowAssignModal(false)}
        />
        <div
          className={`absolute right-0 top-0 h-full w-full max-w-md bg-neutral-900 border-l border-neutral-700 shadow-2xl transition-transform duration-300 ease-out ${showAssignModal ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Accept Booking
                </h3>
                <p className="text-sm text-gray-400">Assign driver & vehicle</p>
              </div>
              <button
                onClick={() => !isAssigning && setShowAssignModal(false)}
                disabled={isAssigning}
                className="p-2 hover:bg-neutral-800 rounded-lg disabled:opacity-50"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {assigningBooking && (
              <div className="mx-5 mt-4 p-3 rounded-lg border bg-neutral-800/60 border-neutral-700">
                <p className="text-xs text-gray-500 mb-1.5 uppercase tracking-wider">
                  Requested Vehicle Class
                </p>
                <VehicleClassBadge
                  vehicleClass={assigningBooking.vehicleClass}
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  {assigningBooking.guestName} ·{" "}
                  {formatDate(assigningBooking.tripDate)} at{" "}
                  {assigningBooking.tripTime}
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {isLoadingOptions ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
                </div>
              ) : assignmentOptions && assigningBooking ? (
                <>
                  {(() => {
                    const vs = getVehicleAvailabilitySummary(
                      assignmentOptions.vehicles,
                      assigningBooking.vehicleClass,
                    );
                    return (
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Select Vehicle *
                        </label>

                        {vs.matching.length === 0 ? (
                          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                <CarFront className="w-5 h-5 text-red-400" />
                              </div>
                              <div>
                                <p className="text-sm text-red-400 font-medium">
                                  No {vs.classLabel} Vehicles Registered
                                </p>
                                <p className="text-xs text-red-400/70 mt-1">
                                  Your fleet does not have any{" "}
                                  {vs.classLabel.toLowerCase()} vehicles. Add
                                  one from the Fleet section to accept this
                                  booking.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : vs.available.length === 0 ? (
                          <div className="space-y-3">
                            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                              <div className="flex items-start gap-3">
                                <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                  <p className="text-sm text-amber-400 font-medium">
                                    All {vs.classLabel} Vehicles Unavailable
                                  </p>
                                  <p className="text-xs text-amber-400/70 mt-1">
                                    You have {vs.matching.length}{" "}
                                    {vs.classLabel.toLowerCase()}{" "}
                                    {vs.matching.length === 1
                                      ? "vehicle"
                                      : "vehicles"}
                                    , but{" "}
                                    {vs.matching.length === 1
                                      ? "it is"
                                      : "all are"}{" "}
                                    currently unavailable.
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {vs.unavailable.map((v) => (
                                <div
                                  key={v.id}
                                  className="flex items-center gap-3 p-3 bg-neutral-800/50 border border-neutral-700/50 rounded-lg opacity-60"
                                >
                                  <div className="w-8 h-8 bg-neutral-700 rounded-lg flex items-center justify-center">
                                    <Wrench className="w-4 h-4 text-gray-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-300 truncate">
                                      {v.label}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {v.plateNumber}
                                    </p>
                                  </div>
                                  <span className="text-xs text-red-400/80 bg-red-500/10 px-2 py-1 rounded">
                                    {v.isBusy
                                      ? "Assigned to another trip"
                                      : "Available"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-2">
                              {vs.matching.map((v) => {
                                const isSelected = selectedVehicle === v.id;
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    disabled={v.isBusy}
                                    onClick={() =>
                                      !v.isBusy &&
                                      setSelectedVehicle(isSelected ? "" : v.id)
                                    }
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                                      isSelected
                                        ? "bg-luxury-gold/10 border-luxury-gold/40"
                                        : !v.isBusy
                                          ? "bg-neutral-800/50 border-neutral-700 hover:border-neutral-600"
                                          : "bg-neutral-800/30 border-neutral-800 opacity-50 cursor-not-allowed"
                                    }`}
                                  >
                                    <div
                                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                                        isSelected
                                          ? "bg-luxury-gold/20"
                                          : "bg-neutral-700"
                                      }`}
                                    >
                                      {isSelected ? (
                                        <CheckCircle className="w-5 h-5 text-luxury-gold" />
                                      ) : (
                                        <Car
                                          className={`w-5 h-5 ${!v.isBusy ? "text-gray-300" : "text-gray-500"}`}
                                        />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p
                                        className={`text-sm truncate ${isSelected ? "text-white font-medium" : "text-gray-300"}`}
                                      >
                                        {v.label}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {v.plateNumber}
                                      </p>
                                    </div>
                                    {!v.isBusy ? (
                                      <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                                        Available
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                                        {"Assigned to another trip"}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            <p className="text-xs text-gray-500">
                              {vs.available.length} of {vs.matching.length}{" "}
                              {vs.classLabel.toLowerCase()}{" "}
                              {vs.matching.length === 1
                                ? "vehicle"
                                : "vehicles"}{" "}
                              available
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {(() => {
                    const ds = getDriverAvailabilitySummary(
                      assignmentOptions.drivers,
                    );
                    return (
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Select Driver *
                        </label>

                        {assignmentOptions.drivers.length === 0 ? (
                          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                <UserX className="w-5 h-5 text-red-400" />
                              </div>
                              <div>
                                <p className="text-sm text-red-400 font-medium">
                                  No Drivers Registered
                                </p>
                                <p className="text-xs text-red-400/70 mt-1">
                                  Add drivers from the Drivers section before
                                  accepting bookings.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : ds.available.length === 0 ? (
                          <div className="space-y-3">
                            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                              <div className="flex items-start gap-3">
                                <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                  <p className="text-sm text-amber-400 font-medium">
                                    All Drivers Unavailable
                                  </p>
                                  <p className="text-xs text-amber-400/70 mt-1">
                                    Your {assignmentOptions.drivers.length}{" "}
                                    {assignmentOptions.drivers.length === 1
                                      ? "driver is"
                                      : "drivers are"}{" "}
                                    currently assigned to other bookings or
                                    inactive.
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {ds.unavailable.map((d) => (
                                <div
                                  key={d.id}
                                  className="flex items-center gap-3 p-3 bg-neutral-800/50 border border-neutral-700/50 rounded-lg opacity-60"
                                >
                                  <div className="w-8 h-8 bg-neutral-700 rounded-full flex items-center justify-center">
                                    <User className="w-4 h-4 text-gray-400" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-300 truncate">
                                      {d.name}
                                    </p>
                                    {d.rating !== null && (
                                      <p className="text-xs text-gray-500">
                                        {Number(d.rating).toFixed(1)}★
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-xs text-red-400/80 bg-red-500/10 px-2 py-1 rounded">
                                    {d.isBusy
                                      ? "Assigned to another trip"
                                      : "Available"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-2">
                              {assignmentOptions.drivers.map((d) => {
                                const isSelected = selectedDriver === d.id;
                                return (
                                  <button
                                    key={d.id}
                                    type="button"
                                    disabled={d.isBusy}
                                    onClick={() =>
                                      !d.isBusy &&
                                      setSelectedDriver(isSelected ? "" : d.id)
                                    }
                                    className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                                      isSelected
                                        ? "bg-luxury-gold/10 border-luxury-gold/40"
                                        : !d.isBusy
                                          ? "bg-neutral-800/50 border-neutral-700 hover:border-neutral-600"
                                          : "bg-neutral-800/30 border-neutral-800 opacity-50 cursor-not-allowed"
                                    }`}
                                  >
                                    <div
                                      className={`w-9 h-9 rounded-full flex items-center justify-center ${
                                        isSelected
                                          ? "bg-luxury-gold/20"
                                          : "bg-neutral-700"
                                      }`}
                                    >
                                      {isSelected ? (
                                        <CheckCircle className="w-5 h-5 text-luxury-gold" />
                                      ) : (
                                        <User
                                          className={`w-5 h-5 ${!d.isBusy ? "text-gray-300" : "text-gray-500"}`}
                                        />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p
                                        className={`text-sm truncate ${isSelected ? "text-white font-medium" : "text-gray-300"}`}
                                      >
                                        {d.name}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {d.phone}
                                        {d.rating !== null &&
                                          ` · ${Number(d.rating).toFixed(1)}★`}
                                      </p>
                                    </div>
                                    {!d.isBusy ? (
                                      <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                                        Available
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                                        {"Assigned to another trip"}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            <p className="text-xs text-gray-500">
                              {ds.available.length} of{" "}
                              {assignmentOptions.drivers.length}{" "}
                              {assignmentOptions.drivers.length === 1
                                ? "driver"
                                : "drivers"}{" "}
                              available
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : null}
            </div>

            <div className="p-5 border-t border-neutral-800">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAssignModal(false)}
                  disabled={isAssigning}
                  className="flex-1 px-4 py-3 bg-neutral-800 text-gray-300 rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAcceptAndAssign}
                  disabled={
                    isAssigning ||
                    !selectedDriver ||
                    !selectedVehicle ||
                    !canAcceptBookings
                  }
                  title={canAcceptBookings ? undefined : acceptLockReason}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-400 transition-colors disabled:opacity-50"
                >
                  {isAssigning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Accept & Assign
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
