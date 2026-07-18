// ============================================
// !!! DESTINATION PATH: apps/web/components/vendor/dashboard.tsx
// ============================================
"use client";

import { useState, useEffect, useCallback } from "react";
import { vendorApi } from "@/lib/api";
import {
  Wallet,
  CalendarDays,
  Car,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Star,
  MapPin,
  ChevronRight,
  User,
  AlertCircle,
  Loader2,
  Clock,
  ArrowRight,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

// ============== TYPES ==============

interface VendorDashboardProps {
  onTabChange: (tab: string, subTab?: string) => void;
  onCalendarDateClick?: (dateStr: string) => void;
  refreshBadges: () => void;
}

interface DashboardSummary {
  newBookingRequests: number;
  earnings: {
    current: number;
    percentChange: number;
    trend: Array<{ month: string; amount: number }>;
  };
  trips: {
    active: number;
    completedThisMonth: number;
    acceptanceRate: number;
  };
  fleet: {
    totalVehicles: number;
    activeVehicles: number;
    totalDrivers: number;
    activeDrivers: number;
    avgDriverRating: number | null;
  };
  compliance: {
    expiringDocs: number;
    expiringDriverDocs: number;
    expiringVehicleDocs: number;
  };
}

interface RecentBooking {
  id: string;
  bookingRef: string;
  guestName: string;
  route: string;
  pickupAddress: string;
  dropoffAddress: string;
  tripType: string;
  // Trip-type detail powers the violet HOURLY chip (with hours
  // label) and the sky city chip. Same shape partner + admin
  // recent-bookings consume — kept aligned so the same row-render
  // helpers could be hoisted into a shared module later.
  hours: number | null;
  hourlyDuration: string | null;
  city: string;
  tripDate: string;
  tripTime: string;
  vehicleClass: string;
  // Vendor's payout — the only price surface exposed on the vendor
  // side. Partner-facing totalPrice is not part of this shape;
  // backend response doesn't include it (see dashboard.controller
  // recent-bookings SELECT for the rationale).
  vendorPayoutAmount: number | null;
  status: string;
  // No isPartnerBooking / partnerName — vendor-facing responses
  // never expose booking-origin attribution (partner ↔ vendor
  // isolation rule). If older clients still expect these, treating
  // them as absent is correct.
  driverName: string | null;
  createdAt: string;
}

interface CalendarDay {
  date: string;
  bookings: Array<{
    id: string;
    bookingRef: string;
    guestName: string;
    tripTime: string;
    status: string;
    vehicleClass: string;
  }>;
  count: number;
  statuses: Record<string, number>;
}

interface TopDriver {
  rank: number;
  driverId: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  rating: number | null;
  completedTrips: number;
}

// ============== HELPERS ==============

function getStatusColor(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "IN_PROGRESS":
      return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    case "COMPLETED":
      return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    // Stage 3B: vendor sees ASSIGNMENT_OFFERED and ASSIGNMENT_RE_OFFERED
    // as the same actionable state — both mean "request needs my response".
    // Yellow for visibility — these are the rows the vendor should look
    // at first when they open the dashboard. Old AWAITING_VENDOR /
    // VENDOR_REJECTED enum values dropped in Stage 2; the rejection record
    // now lives on BookingAssignmentOffer rather than on the booking.
    case "ASSIGNMENT_OFFERED":
    case "ASSIGNMENT_RE_OFFERED":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    // PENDING means admin holds it pre-offer — vendor can't act yet.
    // Subdued treatment so the row isn't confused with the action-required
    // offer states above.
    case "PENDING":
      return "bg-neutral-700/50 text-gray-400 border-neutral-600";
    case "CANCELLED":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    default:
      return "bg-neutral-800 text-gray-400";
  }
}

// Vendor-facing label dictionary. Mirrors backend's STATUS_LABELS in
// `controller/vendor/bookings.controller.ts` so dashboard rows match
// what the bookings panel shows. Both offer states collapse to a
// single "New Request" label — vendor doesn't see the admin-side
// distinction between first offer and price-revised re-offer.
const VENDOR_STATUS_LABELS: Record<string, string> = {
  ASSIGNMENT_OFFERED: "New Request",
  ASSIGNMENT_RE_OFFERED: "New Request",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  PENDING: "Pending Admin",
};

function formatStatus(status: string) {
  if (!status) return "—";
  const mapped = VENDOR_STATUS_LABELS[status];
  if (mapped) return mapped;
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============== TOP PERFORMER PHOTO with loader + fallback ==============

function TopDriverAvatar({
  photoUrl,
  name,
}: {
  photoUrl: string | null;
  name: string;
}) {
  // States: "loading" while the image is fetching, "loaded" on success, "error" on failure.
  // We start in "loading" only when there IS a photoUrl to load.
  const [state, setState] = useState<"loading" | "loaded" | "error">(
    photoUrl ? "loading" : "error",
  );

  useEffect(() => {
    // Reset state if the photoUrl changes (e.g. dashboard re-fetched and signed URL was refreshed)
    setState(photoUrl ? "loading" : "error");
  }, [photoUrl]);

  return (
    <div className="relative w-10 h-10 rounded-full bg-luxury-gold/20 flex items-center justify-center overflow-hidden flex-shrink-0">
      {photoUrl && state !== "error" && (
        <img
          src={photoUrl}
          alt={name}
          className={`w-full h-full object-cover transition-opacity ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
        />
      )}
      {state === "loading" && (
        <Loader2 className="w-4 h-4 text-luxury-gold animate-spin absolute" />
      )}
      {state === "error" && (
        <User className="w-5 h-5 text-luxury-gold absolute" />
      )}
    </div>
  );
}

// ============== ROW DESCRIPTOR BADGES ==============
//
// Visual language is intentionally aligned with admin's overview and
// partner's dashboard recent-bookings so the same booking reads the
// same way wherever an internal user encounters it:
//   • Violet ⏱ HOURLY chip with hours suffix
//   • Teal → ONE_WAY chip
//   • Sky 📍 city chip (HOURLY only — one-way carries city in its
//     implicit route)
//   • Neutral 🚗 vehicle class chip (vendor needs to know which of
//     their classes is needed)
//
// Deliberately NO source/partner badge here — vendor-facing UI is
// kept blind to booking origin per the partner ↔ vendor isolation
// rule. Vendor sees the booking purely as their job: who's riding,
// what class, where, when, how much they get paid.

const CITY_LABEL_VENDOR: Record<string, string> = {
  RIYADH: "Riyadh",
  JEDDAH: "Jeddah",
  MAKKAH: "Makkah",
  MADINAH: "Madinah",
};

const VEHICLE_CLASS_LABEL_VENDOR: Record<string, string> = {
  ECONOMY_SEDAN: "Economy",
  BUSINESS_SEDAN: "Business",
  FIRST_CLASS: "First Class",
  BUSINESS_SUV: "Business SUV",
  HIACE: "Hiace",
  COASTER: "Coaster",
  KING_LONG: "King Long",
  ELECTRIC: "Electric",
};

function MiniTripTypeBadgeVendor({
  tripType,
  hours,
}: {
  tripType: string;
  hours: number | null;
}) {
  const isHourly = tripType === "HOURLY";
  const label = isHourly ? (hours ? `${hours}h` : "Hourly") : "One Way";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border whitespace-nowrap ${
        isHourly
          ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
          : "bg-teal-500/10 text-teal-400 border-teal-500/20"
      }`}
    >
      {isHourly ? (
        <Clock className="w-2.5 h-2.5" />
      ) : (
        <ArrowRight className="w-2.5 h-2.5" />
      )}
      {label}
    </span>
  );
}

function MiniCityBadgeVendor({ city }: { city: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border bg-sky-500/10 text-sky-300 border-sky-500/20 whitespace-nowrap">
      <MapPin className="w-2.5 h-2.5" />
      {CITY_LABEL_VENDOR[city] || city}
    </span>
  );
}

function MiniVehicleClassBadgeVendor({
  vehicleClass,
}: {
  vehicleClass: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border bg-neutral-700/40 text-gray-300 border-neutral-600/40 whitespace-nowrap">
      <Car className="w-2.5 h-2.5" />
      {VEHICLE_CLASS_LABEL_VENDOR[vehicleClass] || vehicleClass}
    </span>
  );
}

// ============== MAIN COMPONENT ==============

export default function VendorDashboard({
  onTabChange,
  onCalendarDateClick,
  refreshBadges,
}: VendorDashboardProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [topDrivers, setTopDrivers] = useState<TopDriver[]>([]);
  const [pendingPayoutAmount, setPendingPayoutAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // ============== FETCH DATA ==============

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const [summaryRes, bookingsRes, calendarRes, driversRes, payoutsRes] =
        await Promise.all([
          vendorApi.getDashboardSummary(),
          vendorApi.getDashboardBookings({ page: 1, limit: 5 }),
          vendorApi.getCalendarData(),
          vendorApi.getTopDrivers(),
          vendorApi.getPendingPayouts(),
        ]);

      if (summaryRes.success && summaryRes.data) setSummary(summaryRes.data);
      if (bookingsRes.success && bookingsRes.data)
        setRecentBookings(bookingsRes.data.bookings || []);
      if (calendarRes.success && calendarRes.data)
        setCalendarDays(calendarRes.data.days || []);
      if (driversRes.success && driversRes.data)
        setTopDrivers(driversRes.data.drivers || []);
      if (payoutsRes.success && payoutsRes.data)
        setPendingPayoutAmount(payoutsRes.data.totalPending || 0);
    } catch {
      // Silent — dashboard is non-critical
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // ============== LOADING STATE ==============

  if (isLoading || !summary) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  // ============== MINI CALENDAR ==============

  const VendorMiniCalendar = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const [hoveredDay, setHoveredDay] = useState<number | null>(null);

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const monthName = today.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    // Build a map of day number → calendar data.
    // IMPORTANT: cd.date may be an ISO datetime like "2025-05-14T00:00:00.000Z" — calling
    // new Date(cd.date).getDate() is locale-sensitive: a UTC-midnight date can render as the
    // previous day in a negative-offset timezone (e.g. May 14 UTC → May 13 in UTC-5). Parse
    // the YYYY-MM-DD prefix directly to stay anchored to the date the backend intends.
    const dayMap: Record<number, CalendarDay> = {};
    calendarDays.forEach((cd) => {
      const datePart = (cd.date || "").slice(0, 10); // "YYYY-MM-DD"
      if (datePart.length === 10) {
        const dayNum = parseInt(datePart.slice(8, 10), 10);
        if (!Number.isNaN(dayNum)) dayMap[dayNum] = cd;
      }
    });

    const getIntensity = (count: number) => {
      if (count === 0) return "";
      if (count <= 2) return "bg-luxury-gold/20";
      if (count <= 4) return "bg-luxury-gold/40";
      return "bg-luxury-gold/60";
    };

    const handleDayClick = (dayData: CalendarDay) => {
      // Use the date string the backend returned (already normalized to YYYY-MM-DD), instead
      // of reconstructing from `today`. Reconstructing from today.getFullYear()/today.getMonth()
      // breaks any time the calendar shows a different month than the system date — and also
      // could pick the wrong year if the server clock drifts.
      const dateStr = (dayData.date || "").slice(0, 10);
      if (!dateStr) return;
      if (onCalendarDateClick) {
        onCalendarDateClick(dateStr);
      } else {
        onTabChange("bookings");
      }
    };

    return (
      <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
        <h4 className="text-sm font-medium text-white mb-3">{monthName}</h4>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} className="text-gray-500 py-1">
              {d}
            </span>
          ))}
          {days.map((day, i) => {
            const dayData = day ? dayMap[day] : null;
            const hasBookings = dayData && dayData.count > 0;
            return (
              <div key={i} className="relative">
                <button
                  onClick={() => day && hasBookings && handleDayClick(dayData!)}
                  onMouseEnter={() => day && hasBookings && setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                  disabled={!day || !hasBookings}
                  className={`w-full py-1 rounded cursor-pointer transition-all ${
                    day === today.getDate()
                      ? "bg-luxury-gold text-black font-bold"
                      : day && hasBookings
                        ? `${getIntensity(dayData!.count)} text-luxury-gold hover:ring-1 hover:ring-luxury-gold`
                        : day
                          ? "text-gray-400"
                          : ""
                  } ${!day || !hasBookings ? "cursor-default" : ""}`}
                >
                  {day}
                </button>
                {hoveredDay === day && dayData && (
                  <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 p-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl text-left">
                    <p className="text-xs text-white font-medium mb-1">
                      {day} {monthName}
                    </p>
                    <p className="text-xs text-luxury-gold">
                      {dayData.count} booking{dayData.count !== 1 ? "s" : ""}
                    </p>
                    {dayData.statuses && (
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(dayData.statuses).map(
                          ([status, count]) => (
                            <p key={status} className="text-xs text-gray-400">
                              {count} {formatStatus(status)}
                            </p>
                          ),
                        )}
                      </div>
                    )}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-neutral-800 border-r border-b border-neutral-700 rotate-45" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3 text-center">
          Click a date to view bookings
        </p>
      </div>
    );
  };

  // ============== RENDER ==============

  return (
    <div className="space-y-6">
      {/* New Booking Requests Alert */}
      {summary.newBookingRequests > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-white font-medium">New Booking Requests</p>
                <p className="text-sm text-yellow-400">
                  You have {summary.newBookingRequests} pending request
                  {summary.newBookingRequests !== 1 ? "s" : ""} that need your
                  attention
                </p>
              </div>
            </div>
            <button
              onClick={() => onTabChange("bookings", "new")}
              className="px-4 py-2 bg-yellow-500 text-black text-sm font-medium rounded-lg hover:bg-yellow-400 transition-colors whitespace-nowrap"
            >
              View Requests
            </button>
          </div>
        </div>
      )}

      {/* KPI Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Earnings Card with Sparkline */}
        <div className="p-5 bg-gradient-to-br from-luxury-gold/20 to-luxury-gold/5 border border-luxury-gold/30 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-luxury-gold/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-luxury-gold" />
            </div>
            <span className="text-sm text-gray-400">Monthly Earnings</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-luxury-gold">
            SAR {summary.earnings.current.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {summary.earnings.percentChange >= 0 ? (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <TrendingUp className="w-4 h-4" />+
                {summary.earnings.percentChange}%
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-400 text-sm">
                <TrendingDown className="w-4 h-4" />
                {summary.earnings.percentChange}%
              </span>
            )}
            <span className="text-xs text-gray-500">vs last month</span>
          </div>
          {summary.earnings.trend.length > 0 && (
            <div className="mt-3 pt-3 border-t border-luxury-gold/20">
              <div className="flex items-end gap-1.5 h-10">
                {summary.earnings.trend.map((item, i) => {
                  const maxVal = Math.max(
                    ...summary.earnings.trend.map((t) => t.amount),
                  );
                  const heightPercent =
                    maxVal > 0 ? (item.amount / maxVal) * 100 : 0;
                  return (
                    <div
                      key={i}
                      className="flex-1 relative group"
                      style={{ height: "100%" }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
                        <p className="text-xs text-white">{item.month}</p>
                        <p className="text-xs text-luxury-gold">
                          SAR {item.amount.toLocaleString()}
                        </p>
                      </div>
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-luxury-gold/50 hover:bg-luxury-gold rounded-sm transition-colors cursor-pointer"
                        style={{ height: `${Math.max(heightPercent, 5)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                Last {summary.earnings.trend.length} months
              </p>
            </div>
          )}
        </div>

        {/* Trips & Performance Card */}
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Active Trips</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {summary.trips.active}
          </p>
          <div className="mt-3 pt-3 border-t border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Completed This Month</span>
              <span className="text-white font-medium">
                {summary.trips.completedThisMonth}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Acceptance Rate</span>
              <span className="text-green-400 font-medium">
                {summary.trips.acceptanceRate}%
              </span>
            </div>
          </div>
        </div>

        {/* Fleet & Drivers Summary */}
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Car className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-sm text-gray-400">Fleet Overview</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-white">
              {summary.fleet.activeVehicles}
            </p>
            <span className="text-sm text-gray-400">
              / {summary.fleet.totalVehicles} vehicles
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Active Drivers</span>
              <span className="text-white font-medium">
                {summary.fleet.activeDrivers} / {summary.fleet.totalDrivers}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Avg. Rating</span>
              <span className="flex items-center gap-1 text-luxury-gold font-medium">
                <Star className="w-3.5 h-3.5 fill-luxury-gold" />
                {summary.fleet.avgDriverRating?.toFixed(1) || "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Compliance Card */}
        <div
          className={`p-5 bg-neutral-900 border rounded-xl ${summary.compliance.expiringDocs > 0 ? "border-red-500/30" : "border-neutral-800"}`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${summary.compliance.expiringDocs > 0 ? "bg-red-500/10" : "bg-green-500/10"}`}
            >
              {summary.compliance.expiringDocs > 0 ? (
                <AlertTriangle className="w-5 h-5 text-red-400" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-400" />
              )}
            </div>
            <span className="text-sm text-gray-400">Compliance</span>
          </div>
          {summary.compliance.expiringDocs > 0 ? (
            <>
              <p className="text-3xl font-bold text-red-400">
                {summary.compliance.expiringDocs}
              </p>
              <p className="text-sm text-red-400 mt-1">
                {summary.compliance.expiringDocs === 1
                  ? "item needs renewal"
                  : "items need renewal"}
              </p>
              <div className="mt-2 space-y-1">
                {summary.compliance.expiringDriverDocs > 0 && (
                  <p className="text-xs text-gray-400">
                    {summary.compliance.expiringDriverDocs}{" "}
                    {summary.compliance.expiringDriverDocs === 1
                      ? "driver"
                      : "drivers"}{" "}
                    with expiring doc
                    {summary.compliance.expiringDriverDocs !== 1 ? "s" : ""}
                  </p>
                )}
                {summary.compliance.expiringVehicleDocs > 0 && (
                  <p className="text-xs text-gray-400">
                    {summary.compliance.expiringVehicleDocs}{" "}
                    {summary.compliance.expiringVehicleDocs === 1
                      ? "vehicle"
                      : "vehicles"}{" "}
                    with expiring doc
                    {summary.compliance.expiringVehicleDocs !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              {/* Quick navigation: link separately to Fleet and Drivers, only showing the
                  destinations that have at least one expiring doc */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {summary.compliance.expiringVehicleDocs > 0 && (
                  <button
                    onClick={() => onTabChange("fleet")}
                    className="text-xs text-luxury-gold hover:underline"
                  >
                    View Fleet →
                  </button>
                )}
                {summary.compliance.expiringDriverDocs > 0 && (
                  <button
                    onClick={() => onTabChange("drivers")}
                    className="text-xs text-luxury-gold hover:underline"
                  >
                    View Drivers →
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-green-400">All Clear</p>
              <p className="text-sm text-gray-400 mt-1">
                No documents expiring
              </p>
            </>
          )}
        </div>
      </div>

      {/* Recent Bookings & Calendar */}
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Recent Bookings */}
        <div className="lg:col-span-2 p-4 lg:p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-semibold text-white">
              Recent Bookings
            </h3>
            <button
              onClick={() => onTabChange("bookings", "all")}
              className="text-xs lg:text-sm text-luxury-gold hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            {recentBookings.slice(0, 4).map((booking) => {
              const isHourly = booking.tripType === "HOURLY";
              // Vendor headline figure is the payout only. Under
              // current backend rules a booking on the vendor's list
              // always has a payout set (Booking.vendorId is only
              // written alongside vendorPayoutAmount in the same
              // update — see admin/booking.controller and
              // vendor/bookings.controller). We render an em-dash for
              // the theoretical null case rather than falling back to
              // the partner's totalPrice, which would leak the
              // partner rate.
              const hasPayout = booking.vendorPayoutAmount != null;
              return (
                <div
                  key={booking.id}
                  className="p-3 bg-neutral-800/50 rounded-lg flex flex-col gap-2"
                >
                  {/* Top row — ref + descriptor badges + amount.
                      The badges sit next to the ref so the eye picks
                      up trip type + city + class in one glance. */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="text-sm font-medium text-white font-mono">
                        {booking.bookingRef}
                      </span>
                      <MiniTripTypeBadgeVendor
                        tripType={booking.tripType}
                        hours={booking.hours}
                      />
                      {isHourly && <MiniCityBadgeVendor city={booking.city} />}
                      <MiniVehicleClassBadgeVendor
                        vehicleClass={booking.vehicleClass}
                      />
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-luxury-gold">
                        {hasPayout
                          ? `SAR ${Number(booking.vendorPayoutAmount).toLocaleString()}`
                          : "—"}
                      </p>
                      <p className="text-[10px] text-gray-500">Payout</p>
                    </div>
                  </div>

                  {/* Guest + route line. HOURLY shows pickup only
                      (no fixed drop-off); ONE_WAY shows the route
                      string. Same logic admin and partner apply so
                      the row reads the same way across portals. */}
                  <div className="flex items-start gap-2 text-xs text-gray-400">
                    <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5 text-green-400" />
                    <span className="truncate min-w-0 flex-1">
                      <span className="text-gray-300">{booking.guestName}</span>
                      <span className="text-gray-500"> · </span>
                      {isHourly
                        ? booking.pickupAddress
                        : booking.route ||
                          `${booking.pickupAddress} → ${booking.dropoffAddress}`}
                    </span>
                  </div>

                  {/* Footer — date/time on the left, status pill on
                      the right. Date format intentionally short so
                      the row stays one-line on most viewports. */}
                  <div className="flex items-center justify-between pt-1 border-t border-neutral-700/50">
                    <p className="text-[11px] text-gray-500">
                      {new Date(booking.tripDate).toLocaleDateString("en-SA", {
                        month: "short",
                        day: "numeric",
                      })}{" "}
                      at {booking.tripTime}
                    </p>
                    <span
                      className={`inline-block px-2 py-0.5 text-[10px] rounded-full border ${getStatusColor(booking.status)}`}
                    >
                      {formatStatus(booking.status)}
                    </span>
                  </div>
                </div>
              );
            })}
            {recentBookings.length === 0 && (
              <Empty className="py-8 border border-dashed border-neutral-700 rounded-lg">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="bg-neutral-800">
                    <CalendarDays className="w-5 h-5 text-gray-400" />
                  </EmptyMedia>
                  <EmptyTitle className="text-white text-base">
                    No Recent Bookings
                  </EmptyTitle>
                  <EmptyDescription className="text-gray-400">
                    Your bookings will appear here
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </div>

        {/* Calendar & Quick Stats */}
        <div className="space-y-4">
          <VendorMiniCalendar />

          {/* Top Driver */}
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
            <h4 className="text-sm font-medium text-white mb-3">
              Top Performer
            </h4>
            {topDrivers.length > 0 ? (
              <div className="flex items-center gap-3">
                <TopDriverAvatar
                  photoUrl={topDrivers[0].photoUrl}
                  name={topDrivers[0].name}
                />
                <div>
                  <p className="text-sm text-white font-medium">
                    {topDrivers[0].name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {topDrivers[0].completedTrips} trips
                    {topDrivers[0].rating &&
                      ` • ${topDrivers[0].rating.toFixed(1)} rating`}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No driver data yet</p>
            )}
          </div>

          {/* Pending Payout */}
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
            <h4 className="text-sm font-medium text-white mb-2">
              Pending Payout
            </h4>
            <p className="text-2xl font-bold text-green-400">
              SAR {pendingPayoutAmount.toLocaleString()}
            </p>
            <button
              onClick={() => onTabChange("earnings")}
              className="mt-2 text-xs text-luxury-gold hover:underline"
            >
              View Earnings →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
