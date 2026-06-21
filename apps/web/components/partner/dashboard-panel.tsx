// ============================================
// !!! DESTINATION PATH: apps/web/components/partner/dashboard-panel.tsx
// ============================================
"use client";

import { useEffect, useState, useCallback } from "react";
import { partnerApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import {
  Car,
  CalendarDays,
  Wallet,
  Clock,
  Plus,
  Eye,
  Download,
  ChevronRight,
  MapPin,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Inbox,
  X,
  Calendar,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

// ============== TYPES (matching backend responses) ==============

interface DashboardSummary {
  activeBookings: number;
  // Renamed from `monthlyRides`. Completion-based: `current` is
  // COMPLETED rides this month; `trend` now carries both series.
  ridesCompleted: {
    current: number;
    percentChange: number;
    trend: Array<{ month: string; completed: number; created: number }>;
  };
  // Companion quality signal. `rate` is an integer percent 0-100.
  cancellationRate: {
    rate: number;
    cancelled: number;
    createdInMonth: number;
  };
  totalPayable: {
    amount: number;
    hasOverdue: boolean;
    overdueAmount: number;
    overdueMonth: string;
    currentAmount: number;
    currentMonth: string;
  };
  upcomingTrips: number;
}

interface CalendarDay {
  date: string;
  dayOfMonth?: number;
  count: number;
  statuses?: Record<string, number>;
  completed?: number;
  upcoming?: number;
}

interface ContractStats {
  contract: {
    status: string;
    mouFileUrl: string | null;
    mouExpiryDate: string | null;
    daysUntilExpiry: number | null;
  };
  creditInfo: {
    creditLimit: number;
    currentBalance: number;
    paymentTerms: number;
  };
  vehicleUsage: {
    mostUsed: {
      vehicleClass: string;
      label: string;
      count: number;
      percentage: number;
    } | null;
    breakdown: Array<{
      vehicleClass: string;
      label: string;
      count: number;
      percentage: number;
    }>;
    totalBookings: number;
  };
}

interface RecentBooking {
  id: string;
  bookingRef: string;
  guestName: string;
  route: string;
  pickupAddress: string;
  dropoffAddress: string;
  tripDate: string;
  tripTime: string;
  status: string;
  statusLabel: string;
  vehicleClass: string;
  totalPrice: number;
  // Trip-type signal — without these, HOURLY bookings render as
  // "Pickup → " with an empty dropoff (the backend stores empty
  // strings for HOURLY dropoffs, by design).
  tripType: string;
  hours: number | null;
  hourlyDuration: string | null;
  city: string;
}

// ============== HELPERS ==============

const PAGINATION_OPTIONS = [5, 10, 15, 20];

// ============== TRIP DESCRIPTOR BADGES ==============
// Compact versions of the same badges used in the full Bookings panel
// (bookings-panel.tsx). Kept local to the dashboard rather than
// imported because:
//   - The two screens load independently; not worth an extra shared
//     module for two tiny components.
//   - Sizing/spacing here is tighter (dashboard rows are denser),
//     and decoupling lets each screen tune its own visual weight.
//
// Visual contract matches the bookings panel exactly: violet for
// HOURLY, teal for ONE_WAY, sky for city. Partners moving between
// the two views see the same trip type in the same colors.

const CITY_LABEL_DASHBOARD: Record<string, string> = {
  RIYADH: "Riyadh",
  JEDDAH: "Jeddah",
  MAKKAH: "Makkah",
  MADINAH: "Madinah",
};

function MiniTripTypeBadge({
  tripType,
  hours,
  hourlyDuration,
}: {
  tripType: string;
  hours: number | null;
  hourlyDuration: string | null;
}) {
  const isHourly = tripType === "HOURLY";
  // Prefer raw hours (compact) over hourlyDuration (verbose) here —
  // dashboard rows have less horizontal room than the bookings table.
  const label = isHourly
    ? hours
      ? `${hours}h`
      : hourlyDuration || "Hourly"
    : "One Way";
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

function MiniCityBadge({ city }: { city: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border bg-sky-500/10 text-sky-300 border-sky-500/20 whitespace-nowrap">
      <MapPin className="w-2.5 h-2.5" />
      {CITY_LABEL_DASHBOARD[city] || city}
    </span>
  );
}

function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
}: {
  value: number;
  prefix?: string;
  suffix?: string;
}) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const duration = 1000;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);
  return (
    <>
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </>
  );
}

function getStatusColor(status: string) {
  switch (status.toUpperCase()) {
    case "PENDING":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "CONFIRMED":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "IN_PROGRESS":
      return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    case "COMPLETED":
      return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    case "CANCELLED":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    // Stage 3B introduced ASSIGNMENT_OFFERED and ASSIGNMENT_RE_OFFERED
    // as the admin-side offer states. From the partner's perspective
    // these are both still "awaiting" — the partner doesn't see the
    // distinction between "we sent an offer to vendor X" vs "vendor X
    // rejected for price, we're re-offering at a revised rate". Both
    // render with the same purple "awaiting" theme and the same
    // user-facing label (see getStatusLabel below).
    case "ASSIGNMENT_OFFERED":
    case "ASSIGNMENT_RE_OFFERED":
      return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    default:
      return "bg-neutral-800 text-gray-400";
  }
}

// Status label dictionary for the partner-facing UI. Mirrors the
// backend's STATUS_LABELS in `controller/partner/bookings.controller.ts`
// — the offer states ASSIGNMENT_OFFERED and ASSIGNMENT_RE_OFFERED both
// collapse to a single masked label so the partner doesn't see admin's
// internal offer flow.
//
// The dashboard endpoint returns the raw status enum (no masking
// applied server-side for dashboard recent-bookings yet), so the mask
// has to live here. The bookings panel uses its own (backend-masked)
// labels via the bookings list endpoint.
const PARTNER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting Driver/Vehicle Assignment",
  ASSIGNMENT_OFFERED: "Awaiting Driver/Vehicle Assignment",
  ASSIGNMENT_RE_OFFERED: "Awaiting Driver/Vehicle Assignment",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function getStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const key = status.toUpperCase();
  return PARTNER_STATUS_LABELS[key] || status.replace(/_/g, " ");
}

function formatTripDate(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTripTime(timeStr: string) {
  if (!timeStr) return "";
  // If already in HH:mm format, convert to local display
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return timeStr;
}

// ============== MINI CALENDAR ==============

function MiniCalendar({
  calendarDays,
  onDateClick,
}: {
  calendarDays: CalendarDay[];
  onDateClick: (dateStr: string) => void;
}) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  // Build lookup by day of month — extract from date string if dayOfMonth not present
  const dayMap = new Map<number, CalendarDay>();
  calendarDays.forEach((d) => {
    const dayNum = d.dayOfMonth ?? new Date(d.date).getDate();
    dayMap.set(dayNum, { ...d, dayOfMonth: dayNum });
  });

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const monthName = today.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const getIntensity = (count: number) => {
    if (count === 0) return "";
    if (count <= 2) return "bg-luxury-gold/20";
    if (count <= 4) return "bg-luxury-gold/40";
    return "bg-luxury-gold/60";
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
          const dayData = day ? dayMap.get(day) : null;
          const hasData = dayData && dayData.count > 0;
          return (
            <div key={i} className="relative">
              <button
                onClick={() => day && hasData && onDateClick(dayData!.date)}
                onMouseEnter={() => day && hasData && setHoveredDay(day)}
                onMouseLeave={() => setHoveredDay(null)}
                disabled={!day || !hasData}
                className={`w-full py-1 rounded cursor-pointer transition-all ${
                  day === today.getDate()
                    ? "bg-luxury-gold text-black font-bold"
                    : hasData
                      ? `${getIntensity(dayData!.count)} text-luxury-gold hover:ring-1 hover:ring-luxury-gold`
                      : day
                        ? "text-gray-400"
                        : ""
                } ${!day || !hasData ? "cursor-default" : ""}`}
              >
                {day}
              </button>
              {hoveredDay === day && hasData && (
                <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 p-2.5 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl text-left">
                  <p className="text-xs text-white font-medium mb-1.5">
                    {new Date(dayData!.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <p className="text-xs text-luxury-gold mb-1">
                    {dayData!.count} {dayData!.count === 1 ? "trip" : "trips"}
                  </p>
                  {dayData!.statuses &&
                  Object.keys(dayData!.statuses).length > 0 ? (
                    <div className="space-y-0.5">
                      {Object.entries(dayData!.statuses).map(
                        ([status, count]) => (
                          <div
                            key={status}
                            className="flex items-center justify-between text-[10px]"
                          >
                            <span className="flex items-center gap-1">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  status === "COMPLETED"
                                    ? "bg-green-400"
                                    : status === "CONFIRMED"
                                      ? "bg-blue-400"
                                      : status === "PENDING"
                                        ? "bg-yellow-400"
                                        : status === "IN_PROGRESS"
                                          ? "bg-purple-400"
                                          : status === "CANCELLED"
                                            ? "bg-red-400"
                                            : "bg-gray-400"
                                }`}
                              />
                              <span className="text-gray-300">
                                {status
                                  .replace(/_/g, " ")
                                  .toLowerCase()
                                  .replace(/^\w/, (c) => c.toUpperCase())}
                              </span>
                            </span>
                            <span className="text-gray-400">{count}</span>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    // Fallback for old format
                    <p className="text-xs text-gray-400">
                      {dayData!.completed
                        ? `${dayData!.completed} completed`
                        : ""}
                      {dayData!.completed && dayData!.upcoming ? ", " : ""}
                      {dayData!.upcoming ? `${dayData!.upcoming} upcoming` : ""}
                    </p>
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
}

// ============== TRIP REPORT MODAL ==============

function TripReportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { showNotification } = useNotification();
  const [range, setRange] = useState<"this-month" | "last-month" | "custom">(
    "this-month",
  );
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      // Build params based on range
      const params: Record<string, string> = {};
      if (range === "this-month") {
        const now = new Date();
        params.startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        params.endDate = now.toISOString().split("T")[0];
      } else if (range === "last-month") {
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        params.startDate = lastMonth.toISOString().split("T")[0];
        params.endDate = lastDay.toISOString().split("T")[0];
      } else {
        params.startDate = customRange.start;
        params.endDate = customRange.end;
      }

      const res = await partnerApi.exportBookingsCsv({ tab: "all", ...params });

      // If backend returns CSV data, download it
      if (res.data) {
        const blob = new Blob(
          [typeof res.data === "string" ? res.data : JSON.stringify(res.data)],
          { type: "text/csv" },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `trip-report-${range}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }

      showNotification("success", "Trip report downloaded successfully");
      onClose();
    } catch (err: any) {
      showNotification("error", err.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <h3 className="text-lg font-semibold text-white">
            Download Trip Report
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-800 rounded"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-400">
            Select a date range for your trip report:
          </p>
          <div className="space-y-2">
            {(["this-month", "last-month", "custom"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`w-full p-3 rounded-lg text-left text-sm transition-colors ${range === r ? "bg-luxury-gold/20 border border-luxury-gold/50 text-luxury-gold" : "bg-neutral-800 text-gray-400 hover:bg-neutral-700"}`}
              >
                {r === "this-month" && "This Month"}
                {r === "last-month" && "Last Month"}
                {r === "custom" && "Custom Range"}
              </button>
            ))}
          </div>
          {range === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(e) =>
                    setCustomRange((p) => ({ ...p, start: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(e) =>
                    setCustomRange((p) => ({ ...p, end: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm"
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={
              generating ||
              (range === "custom" && (!customRange.start || !customRange.end))
            }
            className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black rounded-lg hover:bg-luxury-gold/90 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {generating ? "Generating..." : "Download Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== MAIN DASHBOARD PANEL ==============

interface DashboardPanelProps {
  onTabChange: (tab: string) => void;
  onCalendarDateClick: (dateStr: string) => void;
  refreshBadges: () => void;
}

export default function DashboardPanel({
  onTabChange,
  onCalendarDateClick,
  refreshBadges,
}: DashboardPanelProps) {
  const { showNotification } = useNotification();

  // API data states
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [contractStats, setContractStats] = useState<ContractStats | null>(
    null,
  );
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pagination for recent activity
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);

  // Trip report modal
  const [showReportModal, setShowReportModal] = useState(false);

  // ---- Fetch all dashboard data ----
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, calendarRes, contractRes, bookingsRes] =
        await Promise.all([
          partnerApi.getDashboardSummary(),
          partnerApi.getCalendarData({
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
          }),
          partnerApi.getContractStats(),
          partnerApi.getDashboardBookings({ page, limit }),
        ]);
      if (summaryRes.data) setSummary(summaryRes.data);
      if (calendarRes.data?.days) setCalendarDays(calendarRes.data.days);
      if (contractRes.data) setContractStats(contractRes.data);
      if (bookingsRes.data) {
        setRecentBookings(bookingsRes.data.bookings || []);
        setRecentTotal(bookingsRes.data.pagination?.total || 0);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [page, limit, showNotification]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Mark booking notifications as read when viewing dashboard
  useEffect(() => {
    partnerApi
      .markAllNotificationsAsRead({ category: "BOOKING" })
      .catch(() => {});
  }, []);

  // ---- Pagination handlers ----
  const totalPages = Math.ceil(recentTotal / limit);
  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  // ---- Calendar date click → navigate to bookings ----
  const handleCalendarDateClick = (dateStr: string) => {
    // Could pass date as query param via state; for now navigate to bookings tab
    onTabChange("bookings");
  };

  // ---- Loading state ----
  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  if (!summary) return null;

  const { ridesCompleted, cancellationRate, totalPayable } = summary;
  {
    console.log(contractStats);
  }

  return (
    <div className="space-y-6">
      {/* ===== STAT TILES ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Bookings */}
        <div className="p-5 bg-gradient-to-br from-luxury-gold/20 to-luxury-gold/5 border border-luxury-gold/30 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-luxury-gold/20 flex items-center justify-center">
              <Car className="w-5 h-5 text-luxury-gold" />
            </div>
            <span className="text-sm text-gray-400">Active Bookings</span>
          </div>
          <p className="text-3xl font-bold text-luxury-gold">
            <AnimatedCounter value={summary.activeBookings} />
          </p>
        </div>

        {/* Rides Completed
            ─────────────────────────────────────────────────────────
            Switched from "Monthly Rides" (creation-based, non-cancelled)
            to "Rides Completed" (completion-based, tripDate in month).
            This is now the headline operational metric — what the
            partner actually delivered, not what they ordered.

            Cancellation rate is embedded as a secondary stat below the
            big number because the two metrics tell one story:
            "We completed X rides this month, with Y% of bookings
            cancelling along the way." Putting cancellation in its own
            tile would fragment the narrative; keeping it adjacent makes
            the quality signal unavoidable.

            The sparkline is now dual-series. Blue bars show completed
            rides per month (the same data driving the headline);
            lighter neutral bars BEHIND show created bookings. When the
            two diverge — created tall, completed short — the partner
            sees a widening cancellation/no-show gap at a glance, which
            is exactly the kind of signal a static one-series chart
            hides. */}
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Rides Completed</span>
          </div>
          <p className="text-3xl font-bold text-white">
            <AnimatedCounter value={ridesCompleted.current} />
          </p>
          <div className="mt-2 flex items-center gap-2">
            {ridesCompleted.percentChange >= 0 ? (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <ArrowUpRight className="w-4 h-4" />+
                {ridesCompleted.percentChange}%
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-400 text-sm">
                <ArrowDownRight className="w-4 h-4" />
                {ridesCompleted.percentChange}%
              </span>
            )}
            <span className="text-xs text-gray-500">vs last month</span>
          </div>

          {/* Cancellation rate inline. Threshold colouring:
              - ≤10%   neutral muted text (acceptable noise)
              - 10-25% amber (something worth watching)
              - >25%   red (intervene)
              Numbers come straight from cancellationRate.rate. */}
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-gray-500">Cancellation:</span>
            <span
              className={`font-medium ${
                cancellationRate.rate > 25
                  ? "text-red-400"
                  : cancellationRate.rate > 10
                    ? "text-amber-400"
                    : "text-gray-400"
              }`}
            >
              {cancellationRate.rate}%
            </span>
            <span className="text-gray-500">
              ({cancellationRate.cancelled} of {cancellationRate.createdInMonth}{" "}
              this month)
            </span>
          </div>

          {/* Dual-series sparkline */}
          {ridesCompleted.trend.length > 0 && (
            <div className="mt-3 pt-3 border-t border-neutral-800">
              <div className="flex items-end gap-1.5 h-10">
                {ridesCompleted.trend.map((t, i) => {
                  // Scale to the max of either series so the bars stay
                  // proportional and the eye can compare months fairly.
                  const maxVal = Math.max(
                    ...ridesCompleted.trend.flatMap((x) => [
                      x.completed,
                      x.created,
                    ]),
                    1,
                  );
                  const completedPct = (t.completed / maxVal) * 100;
                  const createdPct = (t.created / maxVal) * 100;
                  return (
                    <div
                      key={i}
                      className="flex-1 relative group"
                      style={{ height: "100%" }}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 whitespace-nowrap">
                        <p className="text-xs font-medium text-white">
                          {t.month}
                        </p>
                        <p className="text-xs text-blue-400">
                          {t.completed} completed
                        </p>
                        <p className="text-xs text-gray-500">
                          {t.created} created
                        </p>
                      </div>
                      {/* Created (background bar, lighter) */}
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-neutral-700/60 rounded-sm"
                        style={{ height: `${Math.max(createdPct, 5)}%` }}
                      />
                      {/* Completed (foreground bar, blue) */}
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-blue-400/70 hover:bg-blue-400 rounded-sm transition-colors cursor-pointer"
                        style={{ height: `${Math.max(completedPct, 5)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              {/* Legend — small and muted so it doesn't compete with
                  the bars. Sits below the chart, left-aligned. */}
              <div className="flex items-center justify-between mt-1.5">
                <div className="flex items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-blue-400/70" />
                    Completed
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm bg-neutral-700/60" />
                    Created
                  </span>
                </div>
                <p className="text-[10px] text-gray-500">
                  Last {ridesCompleted.trend.length} months
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Total Payable */}
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl group relative">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-luxury-gold" />
              </div>
              <span className="text-sm text-gray-400">Total Payable</span>
            </div>
            {totalPayable.hasOverdue && (
              <span className="px-2 py-1 text-xs font-medium bg-red-500/20 text-red-400 rounded border border-red-500/30">
                Overdue
              </span>
            )}
          </div>
          <p className="text-3xl font-bold text-white">
            SAR <AnimatedCounter value={totalPayable.amount} />
          </p>
          {totalPayable.hasOverdue ? (
            <p className="text-xs text-red-400 mt-2">
              Includes overdue from {totalPayable.overdueMonth}
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-2">
              Current month (as of today)
            </p>
          )}
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() => onTabChange("invoices")}
              className="text-xs text-luxury-gold hover:underline"
            >
              View Details
            </button>
            {totalPayable.hasOverdue && (
              <button
                onClick={() =>
                  showNotification(
                    "info",
                    "Please contact admin for payment instructions",
                  )
                }
                className="px-3 py-1 text-xs bg-luxury-gold text-black rounded hover:bg-luxury-gold/80 transition-colors"
              >
                Pay Now
              </button>
            )}
          </div>
          {/* Desktop tooltip for breakdown */}
          {totalPayable.hasOverdue && (
            <div className="hidden lg:block absolute top-full left-0 mt-2 w-full p-3 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20">
              <p className="text-xs text-gray-400 mb-2">Amount Breakdown</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300">
                    {totalPayable.overdueMonth} (Overdue)
                  </span>
                  <span className="text-red-400">
                    SAR {totalPayable.overdueAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-300">
                    {totalPayable.currentMonth}
                  </span>
                  <span className="text-white">
                    SAR {totalPayable.currentAmount.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-neutral-700 pt-1.5 mt-1.5 flex justify-between text-sm font-medium">
                  <span className="text-white">Total</span>
                  <span className="text-luxury-gold">
                    SAR {totalPayable.amount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Upcoming Trips */}
        <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-sm text-gray-400">Upcoming (7 days)</span>
          </div>
          <p className="text-3xl font-bold text-white">
            <AnimatedCounter value={summary.upcomingTrips} />
          </p>
        </div>
      </div>

      {/* ===== QUICK ACTIONS ===== */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => onTabChange("book")}
          className="flex items-center gap-2 px-5 py-2.5 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Book New Ride
        </button>
        <button
          onClick={() => onTabChange("bookings")}
          className="flex items-center gap-2 px-5 py-2.5 bg-neutral-800 text-white font-medium rounded-lg hover:bg-neutral-700 transition-colors"
        >
          <Eye className="w-4 h-4" /> View All Bookings
        </button>
        <button
          onClick={() => setShowReportModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-neutral-800 text-white font-medium rounded-lg hover:bg-neutral-700 transition-colors"
        >
          <Download className="w-4 h-4" /> Download Trip Report
        </button>
      </div>

      {/* ===== RECENT ACTIVITY + CALENDAR + SIDEBAR CARDS ===== */}
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Recent Activity (2/3 width) */}
        <div className="lg:col-span-2 p-4 lg:p-6 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base lg:text-lg font-semibold text-white">
              Recent Activity
            </h3>
            <button
              onClick={() => onTabChange("bookings")}
              className="text-xs lg:text-sm text-luxury-gold hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {recentBookings.map((booking) => (
              <div
                key={booking.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-neutral-800/50 rounded-lg gap-2 sm:gap-4"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center flex-shrink-0">
                    <Car className="w-4 h-4 sm:w-5 sm:h-5 text-luxury-gold" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {booking.guestName}
                    </p>
                    {/* Trip-type signal row.
                        - ONE_WAY: just the type badge + full route
                          (pickup → dropoff) — same as before but now
                          colour-coded so the eye picks up trip mix at
                          a glance.
                        - HOURLY:  type badge with hours + city badge,
                          then pickup only (no fake arrow / empty
                          dropoff — the previous render showed " → "
                          for hourly bookings).
                        Badges sit ABOVE the location line so the row
                        stays scannable even when the address wraps. */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5 mb-0.5">
                      <MiniTripTypeBadge
                        tripType={booking.tripType}
                        hours={booking.hours}
                        hourlyDuration={booking.hourlyDuration}
                      />
                      {booking.tripType === "HOURLY" && (
                        <MiniCityBadge city={booking.city} />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">
                        {booking.tripType === "HOURLY"
                          ? booking.pickupAddress
                          : booking.route ||
                            `${booking.pickupAddress} → ${booking.dropoffAddress}`}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:block sm:text-right pl-12 sm:pl-0">
                  <p className="text-xs text-gray-400">
                    {formatTripDate(booking.tripDate)}{" "}
                    {formatTripTime(booking.tripTime)}
                  </p>
                  <span
                    className={`inline-block mt-0 sm:mt-1 px-2 py-0.5 text-xs rounded border ${getStatusColor(booking.status)}`}
                  >
                    {getStatusLabel(booking.status)}
                  </span>
                </div>
              </div>
            ))}

            {recentBookings.length === 0 && (
              <Empty className="py-8 border border-dashed border-neutral-700 rounded-lg">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="bg-neutral-800">
                    <Inbox className="w-5 h-5 text-gray-400" />
                  </EmptyMedia>
                  <EmptyTitle className="text-white text-base">
                    No Recent Activity
                  </EmptyTitle>
                  <EmptyDescription className="text-gray-400">
                    Your recent bookings will appear here
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>

          {/* Pagination */}
          {recentTotal > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-4 pt-4 border-t border-neutral-800 gap-2 sm:gap-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <p className="text-xs text-gray-500">
                  {(page - 1) * limit + 1}-{Math.min(page * limit, recentTotal)}{" "}
                  of {recentTotal}
                </p>
                <select
                  value={limit}
                  onChange={(e) => handleLimitChange(Number(e.target.value))}
                  className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs text-white focus:border-luxury-gold focus:outline-none"
                >
                  {PAGINATION_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2 py-1 bg-neutral-800 text-gray-400 rounded text-xs hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-6 h-6 rounded text-xs font-medium transition-colors ${page === p ? "bg-luxury-gold text-black" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-2 py-1 bg-neutral-800 text-gray-400 rounded text-xs hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar: Calendar + Contract + Vehicle */}
        <div className="space-y-4">
          {/* Mini Calendar */}
          <MiniCalendar
            calendarDays={calendarDays}
            onDateClick={onCalendarDateClick}
          />

          {/* Contract Status */}
          {contractStats && (
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="text-sm font-medium text-white mb-3">
                Contract Status
              </h4>
              <div className="flex items-center gap-2 mb-2">
                {contractStats.contract.status === "ACTIVE" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                ) : contractStats.contract.status === "EXPIRING" ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
                <span
                  className={`text-sm capitalize ${
                    contractStats.contract.status === "ACTIVE"
                      ? "text-green-400"
                      : contractStats.contract.status === "EXPIRING"
                        ? "text-amber-400"
                        : "text-red-400"
                  }`}
                >
                  {contractStats.contract.status
                    .toLowerCase()
                    .replace("_", " ")}
                </span>
              </div>
              {contractStats.contract.mouExpiryDate && (
                <p className="text-xs text-gray-400">
                  Expires:{" "}
                  {new Date(
                    contractStats.contract.mouExpiryDate,
                  ).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
              {contractStats.contract.daysUntilExpiry !== null &&
                contractStats.contract.daysUntilExpiry <= 60 && (
                  <p className="text-xs text-amber-400 mt-1">
                    {contractStats.contract.daysUntilExpiry} days until expiry
                  </p>
                )}
            </div>
          )}

          {/* Most Used Vehicle
              ──────────────────────────────────────────────────────
              Backend now restricts the groupBy to status=COMPLETED, so
              the percentage here reflects actually-delivered rides, not
              bookings + cancellations + pending. The label change
              ("completed rides" instead of "bookings") makes the
              measurement basis explicit so partners don't misread a
              shifting number after the cutover. */}
          {contractStats?.vehicleUsage?.mostUsed && (
            <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <h4 className="text-sm font-medium text-white mb-3">
                Most Used Vehicle
              </h4>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
                  <Car className="w-5 h-5 text-luxury-gold" />
                </div>
                <div>
                  <p className="text-sm text-white font-medium">
                    {contractStats.vehicleUsage.mostUsed.vehicleClass.replace(
                      /_/g,
                      " ",
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {contractStats.vehicleUsage.mostUsed.percentage}% of
                    completed rides
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trip Report Modal */}
      <TripReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
      />
    </div>
  );
}
