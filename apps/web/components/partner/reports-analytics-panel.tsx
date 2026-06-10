"use client";

// ============================================
// components/partner/analytics/reports-analytics-panel.tsx
// Partner Portal — Reports & Analytics
// ============================================

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  DollarSign,
  Calculator,
  XCircle,
  Loader2,
  MapPin,
  BarChart3,
  ArrowUp,
  ArrowDown,
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
  Legend,
} from "recharts";
import { partnerApi } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";

// ============== TYPES ==============

interface AnalyticsData {
  spending?: {
    currentMonth?: { amount: number; rides: number; label: string };
    previousMonth?: { amount: number; rides: number; label: string };
    percentChange?: number;
    monthlyTrend?: Array<{
      month: string;
      monthKey: string;
      amount: number;
      rides: number;
    }>;
  };
  bookingStatus?: {
    total: number;
    breakdown: Array<{ status: string; count: number; percentage: number }>;
  };
  vehicleUsage?: {
    total: number;
    breakdown: Array<{
      vehicleClass: string;
      count: number;
      totalSpend: number;
      percentage: number;
    }>;
  };
  cityDistribution?: {
    total: number;
    breakdown: Array<{
      city: string;
      count: number;
      totalSpend: number;
      percentage: number;
    }>;
  };
  topRoutes?: Array<{ route: string; count: number; totalSpend: number }>;
  tripTypeSplit?: Array<{
    tripType: string;
    count: number;
    percentage: number;
  }>;
  weeklyTrend?: Array<{ week: string; rides: number; amount: number }>;
  summary?: {
    totalRides: number;
    totalSpend: number;
    averageBookingValue: number;
    cancellationRate: number;
    cancelledCount: number;
  };
}

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
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-white text-sm font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-gray-300 text-xs">
          {p.name === "amount"
            ? `SAR ${p.value.toLocaleString()}`
            : `${p.value} rides`}
        </p>
      ))}
    </div>
  );
};

// ============== EMPTY STATE ==============

function SectionEmpty({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[180px] text-center py-8">
      <BarChart3 className="w-10 h-10 text-gray-600 mb-3" />
      <p className="text-gray-400 text-sm">{message}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ============== CONSTANTS ==============

// Backend's `groupStatusForChart` (analytics.controller.ts) returns
// status keys as title-case display labels ("Confirmed", "Pending",
// "In Progress", "Completed", "Cancelled") rather than raw enum names.
// The keys here must match the backend output exactly — the previous
// version used uppercase enum keys (e.g. "COMPLETED", "IN_PROGRESS")
// which never matched at lookup time, causing every pie slice and
// legend swatch to fall through to the gray fallback.
const STATUS_COLORS: Record<string, string> = {
  Completed: "#4ade80",
  Confirmed: "#60a5fa",
  Pending: "#facc15",
  Cancelled: "#f87171",
  "In Progress": "#a78bfa",
};

const CITY_COLORS: Record<string, string> = {
  RIYADH: "#c8a961",
  JEDDAH: "#60a5fa",
  MAKKAH: "#4ade80",
  MADINAH: "#a78bfa",
};

// ============== MAIN COMPONENT ==============

export default function ReportsAnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotification();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await partnerApi.getAnalytics();
      setData(res.data as AnalyticsData);
    } catch {
      showNotification("error", "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <BarChart3 className="w-16 h-16 text-gray-600 mb-4" />
        <h3 className="text-white text-lg font-medium mb-2">
          No analytics data available yet
        </h3>
        <p className="text-gray-400 text-sm">
          Start booking rides to see your reports.
        </p>
      </div>
    );
  }

  // ============== SAFE DEFAULTS ==============

  const safeSummary = {
    totalRides: data.summary?.totalRides ?? 0,
    totalSpend: data.summary?.totalSpend ?? 0,
    averageBookingValue: data.summary?.averageBookingValue ?? 0,
    cancellationRate: data.summary?.cancellationRate ?? 0,
    cancelledCount: data.summary?.cancelledCount ?? 0,
  };

  const safeSpending = {
    currentMonth: data.spending?.currentMonth ?? {
      amount: 0,
      rides: 0,
      label: "—",
    },
    previousMonth: data.spending?.previousMonth ?? {
      amount: 0,
      rides: 0,
      label: "—",
    },
    percentChange: data.spending?.percentChange ?? 0,
    monthlyTrend: data.spending?.monthlyTrend ?? [],
  };

  const safeBookingStatus = {
    total: data.bookingStatus?.total ?? 0,
    breakdown: data.bookingStatus?.breakdown ?? [],
  };

  const safeVehicleUsage = {
    total: data.vehicleUsage?.total ?? 0,
    breakdown: data.vehicleUsage?.breakdown ?? [],
  };

  const safeCityDistribution = {
    total: data.cityDistribution?.total ?? 0,
    breakdown: data.cityDistribution?.breakdown ?? [],
  };

  const safeTopRoutes = data.topRoutes ?? [];
  const safeTripTypeSplit = data.tripTypeSplit ?? [];
  const safeWeeklyTrend = data.weeklyTrend ?? [];

  // ============== RENDER ==============

  return (
    <div className="space-y-6">
      {/* Section 1: Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Rides",
            value: safeSummary.totalRides.toLocaleString(),
            icon: TrendingUp,
            accent: true,
          },
          {
            label: "Total Spend",
            value: `SAR ${safeSummary.totalSpend.toLocaleString()}`,
            icon: DollarSign,
            accent: true,
          },
          {
            label: "Avg Booking Value",
            value: `SAR ${safeSummary.averageBookingValue.toLocaleString()}`,
            icon: Calculator,
            accent: true,
          },
          {
            label: "Cancellation Rate",
            value: `${safeSummary.cancellationRate}%`,
            icon: XCircle,
            accent: false,
            isRed: safeSummary.cancellationRate > 10,
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-luxury-gold/30 transition-colors border-l-4 border-l-luxury-gold"
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.isRed ? "bg-red-500/10" : "bg-luxury-gold/10"}`}
              >
                <kpi.icon
                  className={`w-5 h-5 ${kpi.isRed ? "text-red-400" : "text-luxury-gold"}`}
                />
              </div>
              <div>
                <p className="text-gray-400 text-xs">{kpi.label}</p>
                <p
                  className={`text-xl font-bold ${kpi.isRed ? "text-red-400" : "text-white"}`}
                >
                  {kpi.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Section 2: Monthly Spending Trend */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-luxury-gold/30 transition-colors">
        <h3 className="text-white font-semibold mb-4">
          Monthly Spending Overview
        </h3>
        {safeSpending.monthlyTrend.length > 0 ? (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={safeSpending.monthlyTrend}>
                  <defs>
                    <linearGradient
                      id="spendingGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#c8a961" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#c8a961" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#c8a961"
                    strokeWidth={2}
                    fill="url(#spendingGradient)"
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <span className="text-gray-400">
                SAR {safeSpending.currentMonth.amount.toLocaleString()} this
                month vs SAR{" "}
                {safeSpending.previousMonth.amount.toLocaleString()} last month
              </span>
              <span
                className={`flex items-center gap-1 font-medium ${safeSpending.percentChange >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {safeSpending.percentChange >= 0 ? (
                  <ArrowUp className="w-4 h-4" />
                ) : (
                  <ArrowDown className="w-4 h-4" />
                )}
                {Math.abs(safeSpending.percentChange)}%
              </span>
            </div>
          </>
        ) : (
          <SectionEmpty
            message="No spending data yet"
            sub="Complete bookings to see your spending trend"
          />
        )}
      </div>

      {/* Section 3: Two-column row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Booking Status Breakdown */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-luxury-gold/30 transition-colors">
          <h3 className="text-white font-semibold mb-4">
            Booking Status Breakdown
          </h3>
          {safeBookingStatus.breakdown.length > 0 ? (
            <>
              <div className="h-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={safeBookingStatus.breakdown}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      animationDuration={800}
                    >
                      {safeBookingStatus.breakdown.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={STATUS_COLORS[entry.status] || "#6b7280"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2">
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
                      {safeBookingStatus.total}
                    </p>
                    <p className="text-xs text-gray-400">Total</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 justify-center">
                {safeBookingStatus.breakdown.map((s, i) => (
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
            <SectionEmpty message="No booking status data yet" />
          )}
        </div>

        {/* Trip Type Split */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-luxury-gold/30 transition-colors">
          <h3 className="text-white font-semibold mb-4">Trip Type Split</h3>
          {safeTripTypeSplit.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {safeTripTypeSplit.map((t, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-lg border ${i === 0 ? "bg-luxury-gold/10 border-luxury-gold/30" : "bg-blue-500/10 border-blue-500/30"}`}
                >
                  <p
                    className={`text-2xl font-bold ${i === 0 ? "text-luxury-gold" : "text-blue-400"}`}
                  >
                    {t.count}
                  </p>
                  <p className="text-gray-400 text-sm">
                    {t.tripType === "ONE_WAY" ? "One Way" : "Hourly"}
                  </p>
                  <p
                    className={`text-xs ${i === 0 ? "text-luxury-gold/70" : "text-blue-400/70"}`}
                  >
                    {t.percentage}%
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-20 mb-6">
              <p className="text-gray-500 text-sm">No trip type data yet</p>
            </div>
          )}

          {safeWeeklyTrend.length > 0 ? (
            <>
              <p className="text-xs text-gray-500 mb-2">Weekly Trend (Rides)</p>
              <div className="h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={safeWeeklyTrend} barSize={20}>
                    <XAxis dataKey="week" hide />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2">
                            <p className="text-white text-xs mb-1">{label}</p>
                            <p className="text-luxury-gold text-sm font-medium">
                              {payload[0]?.value} rides
                            </p>
                          </div>
                        );
                      }}
                      cursor={{ fill: "rgba(201, 169, 97, 0.1)" }}
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
            </>
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">
              Weekly trend appears after your first completed week
            </p>
          )}
        </div>
      </div>

      {/* Section 4: Vehicle Class Usage */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-luxury-gold/30 transition-colors">
        <h3 className="text-white font-semibold mb-4">Vehicle Class Usage</h3>
        {safeVehicleUsage.breakdown.length > 0 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...safeVehicleUsage.breakdown].sort(
                  (a, b) => b.count - a.count,
                )}
                layout="vertical"
                barSize={16}
              >
                <XAxis
                  type="number"
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="vehicleClass"
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={100}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2">
                        <p className="text-white text-sm">{d.vehicleClass}</p>
                        <p className="text-gray-300 text-xs">
                          {d.count} bookings • SAR{" "}
                          {d.totalSpend?.toLocaleString() ?? 0}
                        </p>
                        <p className="text-gray-400 text-xs">
                          {d.percentage}% of total
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="#c8a961"
                  radius={[0, 4, 4, 0]}
                  animationDuration={800}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <SectionEmpty message="No vehicle usage data yet" />
        )}
      </div>

      {/* Section 5: Two-column row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* City Distribution */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-luxury-gold/30 transition-colors">
          <h3 className="text-white font-semibold mb-4">City Distribution</h3>
          {safeCityDistribution.breakdown.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={safeCityDistribution.breakdown}
                    dataKey="count"
                    nameKey="city"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    animationDuration={800}
                  >
                    {safeCityDistribution.breakdown.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={CITY_COLORS[entry.city] || "#6b7280"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2">
                          <p className="text-white text-sm">{d.city}</p>
                          <p className="text-gray-300 text-xs">
                            {d.count} bookings • SAR{" "}
                            {d.totalSpend?.toLocaleString() ?? 0}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    formatter={(v) => (
                      <span className="text-gray-400 text-xs">{v}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <SectionEmpty message="No city distribution data yet" />
          )}
        </div>

        {/* Top Routes */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-luxury-gold/30 transition-colors">
          <h3 className="text-white font-semibold mb-4">Top 5 Routes</h3>
          {safeTopRoutes.length > 0 ? (
            <div className="space-y-3">
              {safeTopRoutes.slice(0, 5).map((route, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-lg ${i === 0 ? "bg-luxury-gold/10 border border-luxury-gold/30" : "bg-neutral-800"}`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-luxury-gold text-black" : "bg-neutral-700 text-gray-400"}`}
                  >
                    {i + 1}
                  </div>
                  <MapPin
                    className={`w-4 h-4 flex-shrink-0 ${i === 0 ? "text-luxury-gold" : "text-gray-500"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{route.route}</p>
                    <p className="text-gray-500 text-xs">
                      {route.count} trips • SAR{" "}
                      {route.totalSpend?.toLocaleString() ?? 0}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <SectionEmpty
              message="No route data yet"
              sub="Top routes appear after completed bookings"
            />
          )}
        </div>
      </div>

      {/* Section 6: Weekly Activity */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-luxury-gold/30 transition-colors">
        <h3 className="text-white font-semibold mb-4">Weekly Activity</h3>
        {safeWeeklyTrend.length > 0 ? (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={safeWeeklyTrend} barGap={8}>
                  <XAxis
                    dataKey="week"
                    stroke="#6b7280"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2">
                          <p className="text-white text-sm mb-1">{label}</p>
                          <p className="text-luxury-gold text-xs">
                            {payload[0]?.value} rides
                          </p>
                          <p className="text-gray-400 text-xs">
                            SAR {payload[1]?.value?.toLocaleString() ?? 0}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="rides"
                    fill="#c8a961"
                    radius={[4, 4, 0, 0]}
                    name="Rides"
                    animationDuration={800}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="amount"
                    fill="#4b5563"
                    radius={[4, 4, 0, 0]}
                    name="Amount"
                    animationDuration={800}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-6 mt-4 justify-center">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded bg-luxury-gold" />
                <span className="text-gray-400">Rides</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded bg-gray-600" />
                <span className="text-gray-400">Amount (SAR)</span>
              </div>
            </div>
          </>
        ) : (
          <SectionEmpty
            message="No weekly activity data yet"
            sub="Data appears after your first completed week"
          />
        )}
      </div>
    </div>
  );
}
