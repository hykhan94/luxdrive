// ============================================
// apps/server/src/controller/admin/earnings.controller.ts
// Admin Earnings — LuxDrive's own P&L, distinct from the partner-facing
// "revenue" shown on the overview.
//
// FINANCIAL MODEL
// ---------------
// Per fulfilled booking:
//   - Partner (or direct customer) pays LuxDrive `totalPrice`.
//   - LuxDrive pays the assigned vendor `vendorPayoutAmount`.
//   Both figures are VAT-INCLUSIVE at 15% (the platform stores the
//   ex-VAT base as amount / 1.15 — see pricing.helpers.splitVatInclusive).
//
//   grossRevenue  = Σ totalPrice            (what LuxDrive bills)
//   vendorPayouts = Σ vendorPayoutAmount     (what LuxDrive pays out)
//   grossMargin   = grossRevenue − vendorPayouts   (LuxDrive's take, VAT-incl.)
//
// Because both legs carry VAT at the same rate, the margin also carries
// VAT. The money LuxDrive actually retains after settling VAT is the
// ex-VAT margin (grossMargin / 1.15); the VAT wedge on the margin is
// remitted to ZATCA. We surface both so the headline isn't overstated.
//
// Only COMPLETED bookings that were actually fulfilled (have a vendor +
// a payout) are counted — margin is only realised once the trip is
// delivered and both legs of the price are known.
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";

const VAT_DIVISOR = 1.15;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /admin/earnings?period=month|all
 * LuxDrive's earnings: margin summary, per-vendor payouts, per-partner
 * revenue ranking, and a 6-month margin trend.
 */
export const getEarnings = asyncWrapper(async (req: Request, res: Response) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
  );

  const period = req.query.period === "all" ? "all" : "month";
  const dateFilter =
    period === "all" ? {} : { tripDate: { gte: monthStart, lte: monthEnd } };

  // Fulfilled = completed + assigned to a vendor + payout recorded, so
  // both legs of the margin are present.
  const baseWhere = {
    status: "COMPLETED" as const,
    vendorId: { not: null },
    vendorPayoutAmount: { not: null },
    ...dateFilter,
  };

  // ---- Summary ----
  const agg = await prisma.booking.aggregate({
    where: baseWhere,
    _sum: { totalPrice: true, vendorPayoutAmount: true },
    _count: { id: true },
  });

  const grossRevenue = round2(Number(agg._sum.totalPrice || 0));
  const vendorPayouts = round2(Number(agg._sum.vendorPayoutAmount || 0));
  const grossMargin = round2(grossRevenue - vendorPayouts);
  const completedRides = agg._count.id;

  // Ex-VAT retained profit + the VAT wedge on the margin remitted to ZATCA.
  const netMargin = round2(grossMargin / VAT_DIVISOR);
  const marginVat = round2(grossMargin - netMargin);
  const marginPercent =
    grossRevenue > 0 ? Math.round((grossMargin / grossRevenue) * 1000) / 10 : 0;
  const avgMarginPerRide =
    completedRides > 0 ? round2(grossMargin / completedRides) : 0;

  // ---- Per-vendor payout breakdown ----
  const vendorGroups = await prisma.booking.groupBy({
    by: ["vendorId"],
    where: baseWhere,
    _sum: { totalPrice: true, vendorPayoutAmount: true },
    _count: { id: true },
  });
  const vendorIds = vendorGroups
    .map((g) => g.vendorId)
    .filter((id): id is string => !!id);
  const vendors = await prisma.vendor.findMany({
    where: { id: { in: vendorIds } },
    select: { id: true, companyName: true },
  });
  const vendorName = new Map(vendors.map((v) => [v.id, v.companyName]));
  const vendorPayoutBreakdown = vendorGroups
    .map((g) => {
      const revenue = round2(Number(g._sum.totalPrice || 0));
      const payout = round2(Number(g._sum.vendorPayoutAmount || 0));
      const margin = round2(revenue - payout);
      return {
        vendorId: g.vendorId,
        companyName: vendorName.get(g.vendorId!) || "Unknown vendor",
        revenue,
        payout,
        margin,
        marginPercent:
          revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0,
        rides: g._count.id,
      };
    })
    .sort((a, b) => b.payout - a.payout);

  // ---- Per-partner revenue + margin ranking ----
  const partnerGroups = await prisma.booking.groupBy({
    by: ["partnerId"],
    where: { ...baseWhere, partnerId: { not: null } },
    _sum: { totalPrice: true, vendorPayoutAmount: true },
    _count: { id: true },
  });
  const partnerIds = partnerGroups
    .map((g) => g.partnerId)
    .filter((id): id is string => !!id);
  const partners = await prisma.partner.findMany({
    where: { id: { in: partnerIds } },
    select: { id: true, companyName: true },
  });
  const partnerName = new Map(partners.map((p) => [p.id, p.companyName]));
  const partnerRevenueBreakdown = partnerGroups
    .map((g) => {
      const revenue = round2(Number(g._sum.totalPrice || 0));
      const payout = round2(Number(g._sum.vendorPayoutAmount || 0));
      const margin = round2(revenue - payout);
      return {
        partnerId: g.partnerId,
        companyName: partnerName.get(g.partnerId!) || "Unknown partner",
        revenue,
        payout,
        margin,
        marginPercent:
          revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0,
        rides: g._count.id,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // ---- 6-month margin trend (always month-scoped, ignores `period`) ----
  const monthlyTrend: Array<{
    month: string;
    monthKey: string;
    revenue: number;
    payouts: number;
    margin: number;
  }> = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mEnd = new Date(
      now.getFullYear(),
      now.getMonth() - i + 1,
      0,
      23,
      59,
      59,
    );
    const mAgg = await prisma.booking.aggregate({
      where: {
        status: "COMPLETED",
        vendorId: { not: null },
        vendorPayoutAmount: { not: null },
        tripDate: { gte: mStart, lte: mEnd },
      },
      _sum: { totalPrice: true, vendorPayoutAmount: true },
    });
    const revenue = round2(Number(mAgg._sum.totalPrice || 0));
    const payouts = round2(Number(mAgg._sum.vendorPayoutAmount || 0));
    monthlyTrend.push({
      month: mStart.toLocaleString("default", {
        month: "short",
        year: "numeric",
      }),
      monthKey: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, "0")}`,
      revenue,
      payouts,
      margin: round2(revenue - payouts),
    });
  }

  res.json({
    success: true,
    data: {
      period: {
        key: period,
        label:
          period === "all"
            ? "All time"
            : monthStart.toLocaleString("default", {
                month: "long",
                year: "numeric",
              }),
      },
      summary: {
        grossRevenue,
        vendorPayouts,
        grossMargin,
        netMargin,
        marginVat,
        marginPercent,
        completedRides,
        avgMarginPerRide,
        topPartner: partnerRevenueBreakdown[0]?.companyName || null,
        topVendor: vendorPayoutBreakdown[0]?.companyName || null,
      },
      vendorPayouts: vendorPayoutBreakdown,
      partnerRevenue: partnerRevenueBreakdown,
      monthlyTrend,
    },
  });
});
