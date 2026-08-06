"use client";

import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api";
import {
  Loader2,
  Wallet,
  TrendingUp,
  ArrowDownRight,
  Percent,
  Car,
  Building2,
  Handshake,
  Info,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

// ============== TYPES ==============
interface Summary {
  grossRevenue: number;
  vendorPayouts: number;
  grossMargin: number;
  netMargin: number;
  marginVat: number;
  marginPercent: number;
  completedRides: number;
  avgMarginPerRide: number;
  topPartner: string | null;
  topVendor: string | null;
}
interface VendorRow {
  vendorId: string | null;
  companyName: string;
  revenue: number;
  payout: number;
  margin: number;
  marginPercent: number;
  rides: number;
}
interface PartnerRow {
  partnerId: string | null;
  companyName: string;
  revenue: number;
  payout: number;
  margin: number;
  marginPercent: number;
  rides: number;
}
interface TrendRow {
  month: string;
  monthKey: string;
  revenue: number;
  payouts: number;
  margin: number;
}
interface EarningsData {
  period: { key: string; label: string };
  summary: Summary;
  vendorPayouts: VendorRow[];
  partnerRevenue: PartnerRow[];
  monthlyTrend: TrendRow[];
}

// ============== HELPERS ==============
const sar = (n: number) =>
  `SAR ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const sar2 = (n: number) =>
  `SAR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-gray-300 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>
          {p.name}: {sar(p.value)}
        </p>
      ))}
    </div>
  );
}

// ============== PANEL ==============
export default function EarningsPanel() {
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEarnings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getEarnings({ period });
      if (res.success && res.data) setData(res.data as EarningsData);
    } catch {
      /* surfaced by the empty state below */
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  const s = data?.summary;
  const trend = data?.monthlyTrend ?? [];
  const vendors = data?.vendorPayouts ?? [];
  const partners = data?.partnerRevenue ?? [];

  return (
    <div className="space-y-6">
      {/* Header + period toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Earnings</h2>
          <p className="text-sm text-gray-500">
            LuxDrive&apos;s margin — what partners bill, less vendor payouts.{" "}
            <span className="text-gray-400">{data?.period.label}</span>
          </p>
        </div>
        <div className="flex bg-neutral-800 rounded-lg p-1 self-start">
          {(["month", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                period === p
                  ? "bg-luxury-gold text-black font-medium"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {p === "month" ? "This Month" : "All Time"}
            </button>
          ))}
        </div>
      </div>

      {/* How earnings are made — the formula, in the open */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 items-stretch">
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Handshake className="w-3.5 h-3.5" /> Gross Revenue
          </div>
          <p className="text-xl font-bold text-white">
            {sar(s?.grossRevenue ?? 0)}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            billed to partners &amp; customers
          </p>
        </div>
        <div className="hidden sm:flex items-center justify-center text-2xl text-gray-600 font-light">
          −
        </div>
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <ArrowDownRight className="w-3.5 h-3.5" /> Vendor Payouts
          </div>
          <p className="text-xl font-bold text-white">
            {sar(s?.vendorPayouts ?? 0)}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            paid out to vendors
          </p>
        </div>
        <div className="hidden sm:flex items-center justify-center text-2xl text-gray-600 font-light">
          =
        </div>
        <div className="p-4 bg-gradient-to-br from-luxury-gold/20 to-luxury-gold/5 border border-luxury-gold/30 rounded-xl">
          <div className="flex items-center gap-2 text-luxury-gold/80 text-xs mb-1">
            <Wallet className="w-3.5 h-3.5" /> Gross Margin
          </div>
          <p className="text-xl font-bold text-luxury-gold">
            {sar(s?.grossMargin ?? 0)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            LuxDrive&apos;s take (VAT-incl.)
          </p>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <TrendingUp className="w-3.5 h-3.5" /> Net Margin (ex-VAT)
          </div>
          <p className="text-2xl font-bold text-green-400">
            {sar(s?.netMargin ?? 0)}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            retained after {sar(s?.marginVat ?? 0)} VAT
          </p>
        </div>
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Percent className="w-3.5 h-3.5" /> Margin
          </div>
          <p className="text-2xl font-bold text-white">
            {s?.marginPercent ?? 0}%
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">of gross revenue</p>
        </div>
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Car className="w-3.5 h-3.5" /> Fulfilled Rides
          </div>
          <p className="text-2xl font-bold text-white">
            {s?.completedRides ?? 0}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">completed + paid</p>
        </div>
        <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Wallet className="w-3.5 h-3.5" /> Avg Margin / Ride
          </div>
          <p className="text-2xl font-bold text-white">
            {sar2(s?.avgMarginPerRide ?? 0)}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">per fulfilled ride</p>
        </div>
      </div>

      {/* VAT explainer */}
      <div className="flex items-start gap-2 p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg">
        <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-400 leading-relaxed">
          Both the partner price and the vendor payout are stored VAT-inclusive
          at 15%. The gross margin therefore carries VAT; LuxDrive retains the
          ex-VAT portion ({sar(s?.netMargin ?? 0)}) and remits{" "}
          {sar(s?.marginVat ?? 0)} of VAT on the margin to ZATCA. Only completed
          bookings with an assigned vendor and a recorded payout are counted.
        </p>
      </div>

      {/* Margin trend */}
      <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
        <h3 className="text-base font-semibold text-white mb-4">
          Margin trend — last 6 months
        </h3>
        {trend.some((t) => t.revenue > 0) ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#262626"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={{ stroke: "#262626" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v / 1000}k`}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="revenue"
                  name="Revenue"
                  fill="#3f3f46"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="payouts"
                  name="Payouts"
                  fill="#6b7280"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="margin"
                  name="Margin"
                  fill="#c9a961"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-10 text-center">
            No completed, paid rides in this window yet.
          </p>
        )}
      </div>

      {/* Partner revenue ranking */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center gap-2">
          <Handshake className="w-4 h-4 text-luxury-gold" />
          <h3 className="text-base font-semibold text-white">
            Partner revenue &amp; margin
          </h3>
          {s?.topPartner && (
            <span className="ml-auto text-xs text-gray-500">
              Top: <span className="text-luxury-gold">{s.topPartner}</span>
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-800/40 text-gray-400">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Partner</th>
                <th className="px-4 py-3 text-right font-medium">Rides</th>
                <th className="px-4 py-3 text-right font-medium">Revenue</th>
                <th className="px-4 py-3 text-right font-medium">Payout</th>
                <th className="px-4 py-3 text-right font-medium">Margin</th>
                <th className="px-5 py-3 text-right font-medium">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {partners.map((p, i) => (
                <tr key={p.partnerId ?? i} className="hover:bg-neutral-800/30">
                  <td className="px-5 py-3 text-white">
                    <span className="text-gray-600 mr-2 font-mono text-xs">
                      {i + 1}
                    </span>
                    {p.companyName}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {p.rides}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono">
                    {sar(p.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 font-mono">
                    {sar(p.payout)}
                  </td>
                  <td className="px-4 py-3 text-right text-luxury-gold font-mono">
                    {sar(p.margin)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-300 font-mono">
                    {p.marginPercent}%
                  </td>
                </tr>
              ))}
              {partners.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-gray-500"
                  >
                    No partner bookings in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor payout breakdown */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-luxury-gold" />
          <h3 className="text-base font-semibold text-white">Vendor payouts</h3>
          {s?.topVendor && (
            <span className="ml-auto text-xs text-gray-500">
              Largest: <span className="text-luxury-gold">{s.topVendor}</span>
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-800/40 text-gray-400">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Vendor</th>
                <th className="px-4 py-3 text-right font-medium">Rides</th>
                <th className="px-4 py-3 text-right font-medium">Revenue</th>
                <th className="px-4 py-3 text-right font-medium">Payout</th>
                <th className="px-4 py-3 text-right font-medium">Margin</th>
                <th className="px-5 py-3 text-right font-medium">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {vendors.map((v, i) => (
                <tr key={v.vendorId ?? i} className="hover:bg-neutral-800/30">
                  <td className="px-5 py-3 text-white">
                    <span className="text-gray-600 mr-2 font-mono text-xs">
                      {i + 1}
                    </span>
                    {v.companyName}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {v.rides}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 font-mono">
                    {sar(v.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono">
                    {sar(v.payout)}
                  </td>
                  <td className="px-4 py-3 text-right text-luxury-gold font-mono">
                    {sar(v.margin)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-300 font-mono">
                    {v.marginPercent}%
                  </td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-gray-500"
                  >
                    No vendor-fulfilled rides in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
