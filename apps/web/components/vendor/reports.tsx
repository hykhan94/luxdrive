"use client";

import { useState, useEffect, useCallback } from "react";
import { vendorApi } from "@/lib/api";
import {
  TrendingUp,
  DollarSign,
  Car,
  Users,
  Download,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  Star,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useNotification } from "@/lib/notification-context";

import { proxiedImageUrl } from "@/lib/image-url";
// ============== TYPES ==============

interface SummaryTile {
  value: number;
  percentChange: number;
}

interface AnalyticsData {
  period: string;
  periodLabel: string;
  summary: {
    totalTripsCompleted: SummaryTile;
    totalEarnings: SummaryTile;
    averageTripValue: SummaryTile;
    completionRate: SummaryTile;
    activeDrivers: SummaryTile;
    activeVehicles: SummaryTile;
  };
  earningsOverview: {
    months: Array<{
      month: string;
      monthKey: string;
      amount: number;
      rides: number;
    }>;
    currentMonth: { label: string; amount: number; rides: number };
    previousMonth: { label: string; amount: number };
    percentChange: number;
  };
  tripStatus: {
    total: number;
    breakdown: Array<{
      status: string;
      count: number;
      percentage: number;
    }>;
  };
  bookingSource: {
    total: number;
    direct: { count: number; percentage: number; label: string };
    partner: { count: number; percentage: number; label: string };
  };
  weeklyTrend: {
    monthLabel: string;
    weeks: Array<{
      week: string;
      weekNumber: number;
      rides: number;
      dateRange: string;
    }>;
  };
  vehiclePerformance: {
    vehicles: Array<{
      id: string;
      vehicle: string;
      plateNumber: string;
      category: string;
      categoryLabel: string;
      isActive: boolean;
      totalTrips: number;
      totalEarnings: number;
      rating: number | null;
      performance: number;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
  topDrivers: Array<{
    rank: number;
    driverId: string | null;
    name: string;
    phone: string | null;
    photoUrl: string | null;
    rating: number | null;
    totalTrips: number;
    totalEarnings: number;
  }>;
}

// ============== CONSTANTS ==============

const STATUS_COLORS: Record<string, string> = {
  Completed: "#4ade80",
  Confirmed: "#60a5fa",
  "In Progress": "#a78bfa",
  Cancelled: "#f87171",
};

const VEHICLE_COLORS = [
  "#c8a961",
  "#60a5fa",
  "#4ade80",
  "#a78bfa",
  "#f472b6",
  "#facc15",
];

// Earnings chart label changes based on the period. Drives the X-axis
// title and the chart header subtitle.
const EARNINGS_CHART_LABEL: Record<string, string> = {
  weekly: "Daily Earnings — This Week",
  monthly: "Monthly Earnings — Last 6 Months",
  quarterly: "Monthly Earnings — Current Quarter",
  yearly: "Monthly Earnings — Current Year",
};

const TREND_CHART_LABEL: Record<string, string> = {
  weekly: "Daily Bookings",
  monthly: "Weekly Bookings",
  quarterly: "Weekly Bookings",
  yearly: "Monthly Bookings",
};

// ============== CUSTOM TOOLTIP ==============

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-neutral-800/95 backdrop-blur-sm border border-neutral-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-white text-sm font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-gray-300 text-xs">
          {p.name === "amount"
            ? `SAR ${(Number(p.value) || 0).toLocaleString()}`
            : `${Number(p.value) || 0} trips`}
        </p>
      ))}
    </div>
  );
};

// ============== HELPERS ==============

function formatChange(val: number): string {
  if (val === 0) return "0%";
  return `${val > 0 ? "+" : ""}${val}%`;
}

function changeColor(val: number): string {
  if (val > 0) return "text-green-400";
  if (val < 0) return "text-red-400";
  return "text-gray-500";
}

// Short SAR formatter — keeps tile values readable when amounts go large.
// "SAR 1.2k" instead of "SAR 1,200"; full number under 1,000.
function fmtSARShort(n: number): string {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `SAR ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `SAR ${(v / 1000).toFixed(1)}k`;
  return `SAR ${v.toLocaleString()}`;
}

// ============== MAIN COMPONENT ==============

export default function VendorReportsPanel() {
  const { showNotification } = useNotification();

  const [timeRange, setTimeRange] = useState<
    "weekly" | "monthly" | "quarterly" | "yearly"
  >("monthly");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // ============== FETCH ==============

  const fetchAnalytics = useCallback(
    async (period: string) => {
      setIsLoading(true);
      try {
        const res = await vendorApi.getAnalytics({ period });
        if (res.success && res.data) {
          setData(res.data);
        }
      } catch (err: any) {
        showNotification(
          "error",
          err.message || "Failed to load analytics data",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [showNotification],
  );

  useEffect(() => {
    fetchAnalytics(timeRange);
  }, [timeRange, fetchAnalytics]);

  // ============== EXPORT ==============

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Build the URL directly — the endpoint returns raw CSV,
      // so we need a fetch call that doesn't parse as JSON.
      const params = new URLSearchParams({ period: timeRange }).toString();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/vendor/analytics/export?${params}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${timeRange}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification("success", "Report exported successfully");
    } catch (err: any) {
      showNotification("error", err.message || "Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  // ============== LOADING STATE ==============

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12">
        <Empty>
          <EmptyMedia>
            <div className="w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
              <TrendingUp className="w-12 h-12 text-gray-500" />
            </div>
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle className="text-white">No analytics data</EmptyTitle>
            <EmptyDescription className="text-gray-400">
              Analytics will appear once your fleet starts completing bookings.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const {
    summary,
    earningsOverview,
    tripStatus,
    bookingSource,
    weeklyTrend,
    vehiclePerformance,
    topDrivers,
  } = data;

  // Max trips for vehicle performance bar scaling
  const maxVehicleTrips =
    vehiclePerformance.vehicles.length > 0
      ? Math.max(...vehiclePerformance.vehicles.map((v) => v.totalTrips), 1)
      : 1;

  // ============== KPI CONFIG ==============

  const kpiTiles = [
    {
      label: "Completed Trips",
      value: (Number(summary.totalTripsCompleted.value) || 0).toLocaleString(),
      icon: Car,
      change: summary.totalTripsCompleted.percentChange,
      accent: "from-luxury-gold/20 to-luxury-gold/5",
    },
    {
      label: "Total Earnings",
      value: fmtSARShort(summary.totalEarnings.value),
      icon: DollarSign,
      change: summary.totalEarnings.percentChange,
      accent: "from-green-500/20 to-green-500/5",
    },
    {
      label: "Avg Trip Value",
      value: fmtSARShort(summary.averageTripValue.value),
      icon: TrendingUp,
      change: summary.averageTripValue.percentChange,
      accent: "from-blue-500/20 to-blue-500/5",
    },
    {
      label: "Completion Rate",
      value: `${Number(summary.completionRate.value) || 0}%`,
      icon: CheckCircle,
      change: summary.completionRate.percentChange,
      accent: "from-emerald-500/20 to-emerald-500/5",
    },
    {
      label: "Active Drivers",
      value: (Number(summary.activeDrivers.value) || 0).toString(),
      icon: Users,
      change: summary.activeDrivers.percentChange,
      accent: "from-purple-500/20 to-purple-500/5",
    },
    {
      label: "Active Vehicles",
      value: (Number(summary.activeVehicles.value) || 0).toString(),
      icon: Car,
      change: summary.activeVehicles.percentChange,
      accent: "from-amber-500/20 to-amber-500/5",
    },
  ];

  const earningsChartLabel =
    EARNINGS_CHART_LABEL[data.period] || EARNINGS_CHART_LABEL.monthly;
  const trendChartLabel =
    TREND_CHART_LABEL[data.period] || TREND_CHART_LABEL.monthly;

  return (
    <div className="space-y-6">
      {/* ===== Time Range Filter + Export ===== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
          {(["weekly", "monthly", "quarterly", "yearly"] as const).map(
            (range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  timeRange === range
                    ? "bg-luxury-gold text-black shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ),
          )}
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-800 text-gray-300 rounded-lg hover:border-luxury-gold/30 hover:text-white transition-colors disabled:opacity-50"
        >
          {isExporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Export Report
        </button>
      </div>

      {/* ===== Period label ===== */}
      <p className="text-sm text-gray-500">
        Showing data for{" "}
        <span className="text-gray-300 font-medium">{data.periodLabel}</span>
      </p>

      {/* ===== Summary KPI Cards ===== */}
      {/* Subtle gradient accent per tile gives each metric its own visual
          identity without going overboard. Hover lifts the border. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiTiles.map((kpi, i) => (
          <div
            key={i}
            className={`relative overflow-hidden bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-luxury-gold/30 transition-all group`}
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${kpi.accent} opacity-50 group-hover:opacity-70 transition-opacity pointer-events-none`}
            />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-neutral-900/60 backdrop-blur-sm border border-neutral-800">
                  <kpi.icon className="w-4 h-4 text-luxury-gold" />
                </div>
                {kpi.change !== 0 && (
                  <span
                    className={`text-xs font-medium flex items-center gap-0.5 ${changeColor(kpi.change)}`}
                  >
                    {kpi.change > 0 ? (
                      <ArrowUp className="w-3 h-3" />
                    ) : (
                      <ArrowDown className="w-3 h-3" />
                    )}
                    {formatChange(kpi.change)}
                  </span>
                )}
              </div>
              <p className="text-xl font-bold text-white mb-0.5">{kpi.value}</p>
              <p className="text-xs text-gray-500">{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ===== Earnings Trend Chart ===== */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">Earnings Overview</h3>
            <p className="text-xs text-gray-500 mt-0.5">{earningsChartLabel}</p>
          </div>
          {earningsOverview.percentChange !== 0 && (
            <span
              className={`flex items-center gap-1 text-sm font-medium ${changeColor(earningsOverview.percentChange)}`}
            >
              {earningsOverview.percentChange > 0 ? (
                <ArrowUp className="w-4 h-4" />
              ) : (
                <ArrowDown className="w-4 h-4" />
              )}
              {Math.abs(earningsOverview.percentChange)}%
            </span>
          )}
        </div>
        {earningsOverview.months.length > 0 ? (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={earningsOverview.months}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient
                      id="earningsGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#c8a961" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#c8a961" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) =>
                      `${((Number(v) || 0) / 1000).toFixed(0)}k`
                    }
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#c8a961"
                    strokeWidth={2.5}
                    fill="url(#earningsGradient)"
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 pt-4 border-t border-neutral-800 flex items-center gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-500">Latest</p>
                <p className="text-white font-medium">
                  SAR{" "}
                  {(
                    Number(earningsOverview.currentMonth.amount) || 0
                  ).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Previous</p>
                <p className="text-gray-300 font-medium">
                  SAR{" "}
                  {(
                    Number(earningsOverview.previousMonth.amount) || 0
                  ).toLocaleString()}
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-gray-500 text-sm py-8 text-center">
            No earnings data available yet.
          </p>
        )}
      </div>

      {/* ===== Two Column Row ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trip Status Breakdown */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">
            Trip Status Breakdown
          </h3>
          {tripStatus.total > 0 ? (
            <>
              <div className="h-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tripStatus.breakdown.filter((s) => s.count > 0)}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      animationDuration={800}
                    >
                      {tripStatus.breakdown
                        .filter((s) => s.count > 0)
                        .map((entry, i) => (
                          <Cell
                            key={i}
                            fill={STATUS_COLORS[entry.status] || "#6b7280"}
                            stroke="transparent"
                          />
                        ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-neutral-800/95 backdrop-blur-sm border border-neutral-700 rounded-lg px-3 py-2 shadow-xl">
                            <p className="text-white text-sm">{d.status}</p>
                            <p className="text-gray-300 text-xs">
                              {d.count} ({d.percentage}%)
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">
                      {(Number(tripStatus.total) || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">Total</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 justify-center">
                {tripStatus.breakdown.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: STATUS_COLORS[s.status] || "#6b7280",
                      }}
                    />
                    <span className="text-gray-400">
                      {s.status} ({s.count})
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-sm py-12 text-center">
              No bookings in this period.
            </p>
          )}
        </div>

        {/* Trip Type Mix + Bookings Trend.
            Previously rendered "Direct vs Partner" booking source —
            but exposing whether a booking is partner-referred or
            admin-direct breaks the abstraction (and the commercial
            terms with partners aren't a vendor concern). Now shows
            one-way vs hourly chauffeur split, which is actionable for
            fleet/driver planning. Data shape from the API is
            unchanged — the `direct` slot now holds one-way trips and
            the `partner` slot holds hourly. See controller comment
            on tripTypeMix for the rationale. */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Trip Type Mix</h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-lg border bg-luxury-gold/10 border-luxury-gold/30">
              <p className="text-2xl font-bold text-luxury-gold">
                {(Number(bookingSource.direct.count) || 0).toLocaleString()}
              </p>
              <p className="text-gray-400 text-sm">
                {bookingSource.direct.label}
              </p>
              <p className="text-xs text-luxury-gold/70 mt-0.5">
                {bookingSource.direct.percentage}%
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-blue-500/10 border-blue-500/30">
              <p className="text-2xl font-bold text-blue-400">
                {(Number(bookingSource.partner.count) || 0).toLocaleString()}
              </p>
              <p className="text-gray-400 text-sm">
                {bookingSource.partner.label}
              </p>
              <p className="text-xs text-blue-400/70 mt-0.5">
                {bookingSource.partner.percentage}%
              </p>
            </div>
          </div>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-xs text-gray-500">{trendChartLabel}</p>
            <p className="text-xs text-gray-600">{weeklyTrend.monthLabel}</p>
          </div>
          {weeklyTrend.weeks.length > 0 ? (
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyTrend.weeks} barSize={20}>
                  <XAxis
                    dataKey="week"
                    stroke="#4b5563"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-neutral-800/95 backdrop-blur-sm border border-neutral-700 rounded-lg px-3 py-2 shadow-xl">
                          <p className="text-white text-xs mb-1">
                            {d.week}
                            {d.dateRange ? ` · ${d.dateRange}` : ""}
                          </p>
                          <p className="text-luxury-gold text-sm font-medium">
                            {d.rides} trips
                          </p>
                        </div>
                      );
                    }}
                    cursor={{ fill: "rgba(201, 169, 97, 0.08)" }}
                  />
                  <Bar
                    dataKey="rides"
                    fill="#c8a961"
                    radius={[4, 4, 0, 0]}
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-gray-500 text-xs py-4 text-center">
              No trend data yet.
            </p>
          )}
        </div>
      </div>

      {/* ===== Vehicle Performance ===== */}
      {/* Leaderboard — intentionally all-time, not period-scoped. The
          subtitle calls that out so users understand why it doesn't
          shift with the filter. */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">Vehicle Performance</h3>
            <p className="text-xs text-gray-500 mt-0.5">All-time leaderboard</p>
          </div>
        </div>
        {vehiclePerformance.vehicles.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left text-xs text-gray-500 pb-3 font-medium">
                    VEHICLE
                  </th>
                  <th className="text-left text-xs text-gray-500 pb-3 font-medium">
                    CLASS
                  </th>
                  <th className="text-left text-xs text-gray-500 pb-3 font-medium">
                    TRIPS
                  </th>
                  <th className="text-left text-xs text-gray-500 pb-3 font-medium">
                    EARNINGS
                  </th>
                  <th className="text-left text-xs text-gray-500 pb-3 font-medium">
                    PERFORMANCE
                  </th>
                </tr>
              </thead>
              <tbody>
                {vehiclePerformance.vehicles.map((v, i) => (
                  <tr
                    key={v.id}
                    className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors"
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: `${VEHICLE_COLORS[i % VEHICLE_COLORS.length]}20`,
                          }}
                        >
                          <Car
                            className="w-4 h-4"
                            style={{
                              color: VEHICLE_COLORS[i % VEHICLE_COLORS.length],
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="text-white text-sm block truncate">
                            {v.vehicle}
                          </span>
                          <p className="text-xs text-gray-500 font-mono">
                            {v.plateNumber}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-sm text-gray-400">
                      {v.categoryLabel}
                    </td>
                    <td className="py-3 text-sm text-gray-400">
                      {(Number(v.totalTrips) || 0).toLocaleString()}
                    </td>
                    <td className="py-3 text-sm text-white font-medium">
                      SAR {(Number(v.totalEarnings) || 0).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <div className="w-24 h-2 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(v.totalTrips / maxVehicleTrips) * 100}%`,
                            backgroundColor:
                              VEHICLE_COLORS[i % VEHICLE_COLORS.length],
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm py-8 text-center">
            No vehicle data available.
          </p>
        )}
      </div>

      {/* ===== Top Drivers ===== */}
      {/* Leaderboard — also all-time. Photos now come signed from
          backend so they actually render. */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">Top Performing Drivers</h3>
            <p className="text-xs text-gray-500 mt-0.5">All-time leaderboard</p>
          </div>
        </div>
        {topDrivers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {topDrivers.map((d) => (
              <div
                key={d.rank}
                className="relative p-4 bg-neutral-800/50 rounded-xl border border-neutral-700 hover:border-luxury-gold/30 transition-all overflow-hidden group"
              >
                {/* Rank ribbon */}
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-luxury-gold/10 border border-luxury-gold/30 flex items-center justify-center">
                  <span className="text-luxury-gold text-xs font-bold">
                    {d.rank}
                  </span>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-luxury-gold/20 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-neutral-700 group-hover:ring-luxury-gold/30 transition-all">
                    {d.photoUrl ? (
                      <img
                        src={proxiedImageUrl(d.photoUrl, 96) ?? d.photoUrl}
                        alt={d.name}
                        className="w-full h-full object-cover"
                        // Fall back to the icon if the signed URL has
                        // expired or the file went missing; otherwise
                        // we'd show a broken-image symbol.
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          const parent = (e.target as HTMLImageElement)
                            .parentElement;
                          if (parent) {
                            parent.innerHTML =
                              '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c8a961" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
                          }
                        }}
                      />
                    ) : (
                      <Users className="w-5 h-5 text-luxury-gold" />
                    )}
                  </div>
                  <div className="min-w-0 pr-6">
                    <p className="text-white font-medium text-sm truncate">
                      {d.name}
                    </p>
                    {d.rating !== null && (
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <span className="text-xs text-gray-400">
                          {Number(d.rating).toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 bg-neutral-900 rounded-lg">
                    <p className="text-lg font-bold text-white">
                      {(Number(d.totalTrips) || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Trips</p>
                  </div>
                  <div className="p-2 bg-neutral-900 rounded-lg">
                    <p className="text-lg font-bold text-luxury-gold">
                      {fmtSARShort(d.totalEarnings)}
                    </p>
                    <p className="text-xs text-gray-500">Earned</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm py-8 text-center">
            No driver performance data yet.
          </p>
        )}
      </div>
    </div>
  );
}
