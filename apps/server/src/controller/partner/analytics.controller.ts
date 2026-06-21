// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/partner/analytics.controller.ts
// ============================================
// ============================================
// apps/server/src/controller/partner/analytics.controller.ts
// Partner Portal — Reports & Analytics
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError } from "../../utils/AppError";
import { requireOperational } from "./_shared";

// ============== HELPERS ==============

async function getPartnerForUser(userId: string) {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      companyName: true,
      profileReviewedAt: true,
      createdAt: true,
    },
  });
  if (!partner) throw new NotFoundError("Partner profile");
  return partner;
}

// Vehicle class display labels
const VEHICLE_CLASS_LABELS: Record<string, string> = {
  ECONOMY_SEDAN: "Economy Sedan",
  BUSINESS_SEDAN: "Business Sedan",
  FIRST_CLASS: "First Class",
  BUSINESS_SUV: "Business SUV",
  ELECTRIC: "Electric",
  HIACE: "Hiace",
  COASTER: "Coaster",
  KING_LONG: "King Long",
};

const CITY_LABELS: Record<string, string> = {
  RIYADH: "Riyadh",
  JEDDAH: "Jeddah",
  MAKKAH: "Makkah",
  MADINAH: "Madinah",
};

// Group raw booking statuses into the 5 chart categories per doc spec:
// Confirmed, Pending, In Progress, Completed, Cancelled
function groupStatusForChart(status: string): string {
  // Partner-facing "Pending" rolls up admin's internal offer states.
  // Partner doesn't distinguish first-offer vs price-revised re-offer;
  // the bucket is just "waiting for driver/vehicle assignment".
  if (
    ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"].includes(status)
  )
    return "Pending";
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "IN_PROGRESS") return "In Progress";
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  return status;
}

// ============== FULL ANALYTICS DATA ==============

/**
 * GET /api/v1/partner/analytics
 *
 * Returns 8 sub-sections matching the document spec:
 *  1. Summary KPI tiles — completed rides, total earned, avg booking, cancellation rate
 *  2. Monthly earnings — last 6 months with % change vs previous month
 *  3. Booking status breakdown — Confirmed / Pending / In Progress / Completed / Cancelled
 *  4. Trip type split (ONE_WAY vs HOURLY, all statuses) + current month weekly trend
 *  5. Vehicle category breakdown — count, earnings, % share per class
 *  6. City distribution — count, earnings, % share per city
 *  7. Top 5 most booked routes — count + earnings
 *  8. Weekly comparison for current month — rides + money dual chart
 */
export const getAnalytics = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const now = new Date();

    // Reference: when partner was approved (or when their record was created)
    const partnerJoinDate = partner.profileReviewedAt || partner.createdAt;

    // ============================================
    // 1. SUMMARY KPI TILES
    // ============================================

    // Tile 1: Total Completed & Successful Rides
    const completedRidesCount = await prisma.booking.count({
      where: { partnerId: partner.id, status: "COMPLETED" },
    });

    // Tile 2: Total Money Earned (from joining date till now)
    const totalEarnedAgg = await prisma.booking.aggregate({
      where: {
        partnerId: partner.id,
        status: "COMPLETED",
        createdAt: { gte: partnerJoinDate },
      },
      _sum: { totalPrice: true },
    });
    const totalEarned = Number(totalEarnedAgg._sum.totalPrice || 0);

    // Tile 3: Average Booking Rate per Ride
    const avgBookingAgg = await prisma.booking.aggregate({
      where: { partnerId: partner.id, status: "COMPLETED" },
      _avg: { totalPrice: true },
    });
    const averageBookingValue = Number(avgBookingAgg._avg.totalPrice || 0);

    // Tile 4: Cancellation Rate
    const allStatusCounts = await prisma.booking.groupBy({
      by: ["status"],
      where: { partnerId: partner.id },
      _count: { id: true },
    });
    const totalAllBookings = allStatusCounts.reduce(
      (sum, s) => sum + s._count.id,
      0,
    );
    // CANCELLED is the only terminal "did-not-happen" status on the
    // BookingStatus enum. Previous code included "ALL_VENDORS_REJECTED"
    // and "UNSERVICEABLE" here, which were placeholder names from an
    // earlier model and never appear in the data — their presence in
    // the .includes() was a no-op and made it look like we were
    // counting more states than we actually were.
    const cancelledCount = allStatusCounts
      .filter((s) => s.status === "CANCELLED")
      .reduce((sum, s) => sum + s._count.id, 0);
    const cancellationRate =
      totalAllBookings > 0
        ? Math.round((cancelledCount / totalAllBookings) * 1000) / 10
        : 0;

    // ============================================
    // 2. MONTHLY EARNINGS — LAST 6 MONTHS
    // ============================================
    const monthlyEarnings: {
      month: string;
      monthKey: string;
      amount: number;
      rides: number;
    }[] = [];

    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
      );
      const monthLabel = monthStart.toLocaleString("default", {
        month: "short",
        year: "numeric",
      });
      const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;

      const result = await prisma.booking.aggregate({
        where: {
          partnerId: partner.id,
          status: "COMPLETED",
          tripDate: { gte: monthStart, lte: monthEnd },
        },
        _sum: { totalPrice: true },
        _count: { id: true },
      });

      monthlyEarnings.push({
        month: monthLabel,
        monthKey,
        amount: Number(result._sum.totalPrice || 0),
        rides: result._count.id,
      });
    }

    // % change: current month vs previous month (before reversing)
    const currentMonthEarning = monthlyEarnings[0].amount;
    const previousMonthEarning = monthlyEarnings[1].amount;
    const earningsPercentChange =
      previousMonthEarning > 0
        ? Math.round(
            ((currentMonthEarning - previousMonthEarning) /
              previousMonthEarning) *
              100,
          )
        : currentMonthEarning > 0
          ? 100
          : 0;

    const currentMonthLabel = monthlyEarnings[0].month;
    const previousMonthLabel = monthlyEarnings[1].month;

    // ============================================
    // 3. BOOKING STATUS BREAKDOWN
    // ============================================
    const statusGroupMap: Record<string, number> = {
      Confirmed: 0,
      Pending: 0,
      "In Progress": 0,
      Completed: 0,
      Cancelled: 0,
    };

    allStatusCounts.forEach((s) => {
      const group = groupStatusForChart(s.status);
      if (statusGroupMap[group] !== undefined) {
        statusGroupMap[group] += s._count.id;
      }
    });

    const bookingStatusBreakdown = Object.entries(statusGroupMap).map(
      ([status, count]) => ({
        status,
        count,
        percentage:
          totalAllBookings > 0
            ? Math.round((count / totalAllBookings) * 100)
            : 0,
      }),
    );

    // ============================================
    // 4. TRIP TYPE SPLIT + CURRENT MONTH WEEKLY TREND
    //    Switched from "all statuses" to COMPLETED-only to align with
    //    the rest of the operational metrics. A partner's true mix of
    //    one-way vs hourly should reflect what was actually driven,
    //    not what was ordered — high-cancellation hourly bookings
    //    would otherwise inflate the hourly share.
    // ============================================
    const tripTypeSplit = await prisma.booking.groupBy({
      by: ["tripType"],
      where: { partnerId: partner.id, status: "COMPLETED" },
      _count: { id: true },
    });

    const totalTripTypeBookings = tripTypeSplit.reduce(
      (sum, t) => sum + t._count.id,
      0,
    );

    const oneWayCount =
      tripTypeSplit.find((t) => t.tripType === "ONE_WAY")?._count.id || 0;
    const hourlyCount =
      tripTypeSplit.find((t) => t.tripType === "HOURLY")?._count.id || 0;

    const tripTypeData = [
      {
        tripType: "ONE_WAY",
        label: "One Way",
        count: oneWayCount,
        percentage:
          totalTripTypeBookings > 0
            ? Math.round((oneWayCount / totalTripTypeBookings) * 100)
            : 0,
      },
      {
        tripType: "HOURLY",
        label: "Hourly",
        count: hourlyCount,
        percentage:
          totalTripTypeBookings > 0
            ? Math.round((hourlyCount / totalTripTypeBookings) * 100)
            : 0,
      },
    ];

    // Current month weekly trend (Week 1, 2, 3, 4, 5)
    // Counts COMPLETED rides delivered in each week of this month.
    // Past weeks: how many rides were actually run. Current/future
    // weeks: still on COMPLETED (they'll just be lower because the
    // week isn't done) — same accounting basis throughout, so the
    // chart compares like-with-like across the strip.
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    const currentMonthWeeklyTrend: {
      week: string;
      weekNumber: number;
      rides: number;
      dateRange: string;
    }[] = [];

    let weekStart = new Date(currentMonthStart);
    let weekNumber = 1;

    while (weekStart <= currentMonthEnd) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > currentMonthEnd) weekEnd.setTime(currentMonthEnd.getTime());
      weekEnd.setHours(23, 59, 59);

      const ridesInWeek = await prisma.booking.count({
        where: {
          partnerId: partner.id,
          status: "COMPLETED",
          tripDate: { gte: weekStart, lte: weekEnd },
        },
      });

      const dateRange = `${weekStart.getDate()}–${weekEnd.getDate()} ${weekStart.toLocaleString("default", { month: "short" })}`;

      currentMonthWeeklyTrend.push({
        week: `Week ${weekNumber}`,
        weekNumber,
        rides: ridesInWeek,
        dateRange,
      });

      weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() + 1);
      weekStart.setHours(0, 0, 0, 0);
      weekNumber++;

      if (weekNumber > 5) break;
    }

    // ============================================
    // 5. VEHICLE CATEGORY BREAKDOWN
    //    Restricted to COMPLETED bookings — a vehicle class with many
    //    cancellations isn't actually "used" in any operational sense.
    //    The totalEarned per class also only makes sense on completion
    //    since revenue is recognised at delivery. Date floor is still
    //    the partner's join date so pre-join data (if any) is excluded.
    // ============================================
    const vehicleUsageRaw = await prisma.booking.groupBy({
      by: ["vehicleClass"],
      where: {
        partnerId: partner.id,
        createdAt: { gte: partnerJoinDate },
        status: "COMPLETED",
      },
      _count: { id: true },
      _sum: { totalPrice: true },
      orderBy: { _count: { id: "desc" } },
    });

    const totalVehicleBookings = vehicleUsageRaw.reduce(
      (sum, v) => sum + (v._count?.id ?? 0),
      0,
    );

    const vehicleUsageData = vehicleUsageRaw.map((v) => ({
      vehicleClass: v.vehicleClass,
      label: VEHICLE_CLASS_LABELS[v.vehicleClass] || v.vehicleClass,
      count: v._count!.id,
      totalEarned: Number(v._sum?.totalPrice || 0),
      percentage:
        totalVehicleBookings > 0
          ? Math.round((v._count!.id / totalVehicleBookings) * 100)
          : 0,
    }));

    // ============================================
    // 6. CITY DISTRIBUTION
    //    COMPLETED-only. "Where my driver operates" is a fact about
    //    delivered service, not aspiration. A cancelled Jeddah booking
    //    doesn't put a wheel in Jeddah; counting it overstates that
    //    city's share.
    // ============================================
    const cityDistributionRaw = await prisma.booking.groupBy({
      by: ["city"],
      where: {
        partnerId: partner.id,
        status: "COMPLETED",
      },
      _count: { id: true },
      _sum: { totalPrice: true },
      orderBy: { _count: { id: "desc" } },
    });

    const totalCityBookings = cityDistributionRaw.reduce(
      (sum, c) => sum + (c._count?.id ?? 0),
      0,
    );

    const cityDistributionData = cityDistributionRaw.map((c) => ({
      city: c.city,
      label: CITY_LABELS[c.city] || c.city,
      count: c._count!.id,
      totalEarned: Number(c._sum?.totalPrice || 0),
      percentage:
        totalCityBookings > 0
          ? Math.round((c._count!.id / totalCityBookings) * 100)
          : 0,
    }));

    // ============================================
    // 7. TOP 5 MOST OPERATED ROUTES
    //    The label "top routes" conventionally means "where we
    //    actually drive most often" — completion-based. A route with
    //    five attempted-and-cancelled bookings isn't a "top route";
    //    it's a problem route. Cancellation pattern is a separate
    //    signal worth surfacing eventually, but it doesn't belong in
    //    a "most operated" ranking.
    // ============================================
    const topRoutesRaw = await prisma.booking.groupBy({
      by: ["route"],
      where: {
        partnerId: partner.id,
        status: "COMPLETED",
        route: { not: null },
      },
      _count: { id: true },
      _sum: { totalPrice: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    const topRoutesData = topRoutesRaw.map((r, i) => ({
      rank: i + 1,
      route: r.route,
      count: r._count!.id,
      totalEarned: Number(r._sum?.totalPrice || 0),
    }));

    // ============================================
    // 8. WEEKLY COMPARISON FOR CURRENT MONTH (RIDES + MONEY)
    //    Vertical bar chart with dual metrics
    // ============================================
    const weeklyComparisonData: {
      week: string;
      weekNumber: number;
      dateRange: string;
      rides: number;
      amount: number;
    }[] = [];

    let cmpWeekStart = new Date(currentMonthStart);
    let cmpWeekNumber = 1;

    while (cmpWeekStart <= currentMonthEnd) {
      const cmpWeekEnd = new Date(cmpWeekStart);
      cmpWeekEnd.setDate(cmpWeekEnd.getDate() + 6);
      if (cmpWeekEnd > currentMonthEnd)
        cmpWeekEnd.setTime(currentMonthEnd.getTime());
      cmpWeekEnd.setHours(23, 59, 59);

      const weekAgg = await prisma.booking.aggregate({
        where: {
          partnerId: partner.id,
          status: "COMPLETED",
          tripDate: { gte: cmpWeekStart, lte: cmpWeekEnd },
        },
        _sum: { totalPrice: true },
        _count: { id: true },
      });

      const dateRange = `${cmpWeekStart.getDate()}–${cmpWeekEnd.getDate()} ${cmpWeekStart.toLocaleString("default", { month: "short" })}`;

      weeklyComparisonData.push({
        week: `Week ${cmpWeekNumber}`,
        weekNumber: cmpWeekNumber,
        dateRange,
        rides: weekAgg._count.id,
        amount: Number(weekAgg._sum.totalPrice || 0),
      });

      cmpWeekStart = new Date(cmpWeekEnd);
      cmpWeekStart.setDate(cmpWeekStart.getDate() + 1);
      cmpWeekStart.setHours(0, 0, 0, 0);
      cmpWeekNumber++;

      if (cmpWeekNumber > 5) break;
    }

    // ============================================
    // RESPONSE
    // ============================================
    res.json({
      success: true,
      data: {
        // 1. Summary KPI tiles
        summary: {
          completedRides: completedRidesCount,
          totalEarned,
          averageBookingValue: Math.round(averageBookingValue * 100) / 100,
          cancellationRate,
          partnerJoinedAt: partnerJoinDate,
        },

        // 2. Monthly earnings — last 6 months (oldest first for chart)
        monthlyEarnings: {
          months: monthlyEarnings.slice().reverse(),
          currentMonth: {
            label: currentMonthLabel,
            amount: currentMonthEarning,
          },
          previousMonth: {
            label: previousMonthLabel,
            amount: previousMonthEarning,
          },
          percentChange: earningsPercentChange,
        },

        // 3. Booking status breakdown
        bookingStatus: {
          total: totalAllBookings,
          breakdown: bookingStatusBreakdown,
        },

        // 4. Trip type split + current month weekly trend
        tripTypes: {
          total: totalTripTypeBookings,
          split: tripTypeData,
          currentMonthWeeklyTrend,
        },

        // 5. Vehicle category breakdown
        vehicleUsage: {
          total: totalVehicleBookings,
          breakdown: vehicleUsageData,
        },

        // 6. City distribution
        cityDistribution: {
          total: totalCityBookings,
          breakdown: cityDistributionData,
        },

        // 7. Top 5 most booked routes
        topRoutes: topRoutesData,

        // 8. Weekly comparison for current month (rides + money)
        currentMonthWeeklyComparison: {
          monthLabel: currentMonthStart.toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
          weeks: weeklyComparisonData,
        },
      },
    });
  },
);
