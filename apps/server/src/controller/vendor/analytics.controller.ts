// ============================================
// apps/server/src/controller/vendor/analytics.controller.ts
// Vendor Portal — Reports & Analytics
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { requireOperational, requireApprovedAndDocsValid } from "./_shared";
// Driver photos are stored as raw GCS object paths. Browser can't render
// those — they need to be signed for read access first. Same pattern used
// in vendor/earnings.controller.ts.
// ============== HELPERS ==============

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      companyName: true,
      profileReviewedAt: true,
      createdAt: true,
    },
  });
  if (!vendor) throw new NotFoundError("Vendor profile");
  return vendor;
}

// Build the time-series buckets that the Earnings Overview chart
// renders against. Each period gets a different bucket shape so the
// chart is informative at every zoom level:
//
//   weekly    → 7 daily buckets (current week, Sun→Sat)
//   monthly   → last 6 monthly buckets ending on current month
//   quarterly → 3 monthly buckets (the months of the current quarter)
//   yearly    → 12 monthly buckets (Jan→Dec of current year)
//
// Returns an array oldest-first so recharts renders left-to-right.
// `monthKey` stays unique per bucket to satisfy the chart's key needs.
function getEarningsBuckets(period: string): Array<{
  start: Date;
  end: Date;
  label: string;
  monthKey: string;
}> {
  const now = new Date();
  const buckets: Array<{
    start: Date;
    end: Date;
    label: string;
    monthKey: string;
  }> = [];

  if (period === "weekly") {
    // 7 daily buckets for the current week (Sun→Sat). Labels use short
    // weekday names ("Mon", "Tue") since dates alone wouldn't be
    // immediately readable on a 7-bucket chart.
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const start = new Date(weekStart);
      start.setDate(weekStart.getDate() + i);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      buckets.push({
        start,
        end,
        label: start.toLocaleDateString("en-SA", { weekday: "short" }),
        monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
      });
    }
  } else if (period === "quarterly") {
    // 3 monthly buckets — the months of the current quarter.
    const quarter = Math.floor(now.getMonth() / 3);
    for (let i = 0; i < 3; i++) {
      const start = new Date(now.getFullYear(), quarter * 3 + i, 1);
      const end = new Date(
        now.getFullYear(),
        quarter * 3 + i + 1,
        0,
        23,
        59,
        59,
        999,
      );
      buckets.push({
        start,
        end,
        label: start.toLocaleString("default", { month: "short" }),
        monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      });
    }
  } else if (period === "yearly") {
    // 12 monthly buckets — Jan→Dec of current year.
    for (let i = 0; i < 12; i++) {
      const start = new Date(now.getFullYear(), i, 1);
      const end = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59, 999);
      buckets.push({
        start,
        end,
        label: start.toLocaleString("default", { month: "short" }),
        monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      });
    }
  } else {
    // Monthly default — last 6 months ending on current month, oldest
    // first. Matches the previous "last 6 months" behaviour exactly
    // so the chart looks identical when no period is selected.
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
        999,
      );
      buckets.push({
        start,
        end,
        label: start.toLocaleString("default", {
          month: "short",
          year: "numeric",
        }),
        monthKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      });
    }
  }

  return buckets;
}

// Build the trend chart buckets (renamed from "weekly" in the response
// since at quarterly/yearly zoom these become months, not weeks).
// Period mapping:
//   weekly    → 7 daily buckets (same as earnings)
//   monthly   → up to 5 weekly buckets covering the current month
//   quarterly → 12-13 weekly buckets (the weeks inside the quarter)
//   yearly    → 12 monthly buckets (matches earnings yearly)
function getTrendBuckets(period: string): Array<{
  start: Date;
  end: Date;
  label: string;
  weekNumber: number;
  dateRange: string;
}> {
  const now = new Date();
  const buckets: Array<{
    start: Date;
    end: Date;
    label: string;
    weekNumber: number;
    dateRange: string;
  }> = [];

  if (period === "weekly") {
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const start = new Date(weekStart);
      start.setDate(weekStart.getDate() + i);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      buckets.push({
        start,
        end,
        label: start.toLocaleDateString("en-SA", { weekday: "short" }),
        weekNumber: i + 1,
        dateRange: start.toLocaleDateString("en-SA", {
          month: "short",
          day: "numeric",
        }),
      });
    }
  } else if (period === "quarterly") {
    // Weekly buckets across the quarter (12-13 weeks). Caps at 13.
    const quarter = Math.floor(now.getMonth() / 3);
    const qStart = new Date(now.getFullYear(), quarter * 3, 1);
    const qEnd = new Date(
      now.getFullYear(),
      quarter * 3 + 3,
      0,
      23,
      59,
      59,
      999,
    );
    let weekStart = new Date(qStart);
    let weekNum = 1;
    while (weekStart <= qEnd && weekNum <= 13) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > qEnd) weekEnd.setTime(qEnd.getTime());
      weekEnd.setHours(23, 59, 59, 999);
      buckets.push({
        start: new Date(weekStart),
        end: new Date(weekEnd),
        label: `W${weekNum}`,
        weekNumber: weekNum,
        dateRange: `${weekStart.getDate()} ${weekStart.toLocaleString("default", { month: "short" })}`,
      });
      weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() + 1);
      weekStart.setHours(0, 0, 0, 0);
      weekNum++;
    }
  } else if (period === "yearly") {
    // Monthly buckets across the year.
    for (let i = 0; i < 12; i++) {
      const start = new Date(now.getFullYear(), i, 1);
      const end = new Date(now.getFullYear(), i + 1, 0, 23, 59, 59, 999);
      buckets.push({
        start,
        end,
        label: start.toLocaleString("default", { month: "short" }),
        weekNumber: i + 1,
        dateRange: start.toLocaleString("default", {
          month: "short",
          year: "numeric",
        }),
      });
    }
  } else {
    // Monthly default — up to 5 weekly buckets covering current month
    // (matches the previous behaviour exactly).
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );
    let weekStart = new Date(monthStart);
    let weekNum = 1;
    while (weekStart <= monthEnd && weekNum <= 5) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      if (weekEnd > monthEnd) weekEnd.setTime(monthEnd.getTime());
      weekEnd.setHours(23, 59, 59);
      buckets.push({
        start: new Date(weekStart),
        end: new Date(weekEnd),
        label: `Week ${weekNum}`,
        weekNumber: weekNum,
        dateRange: `${weekStart.getDate()}–${weekEnd.getDate()} ${weekStart.toLocaleString("default", { month: "short" })}`,
      });
      weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() + 1);
      weekStart.setHours(0, 0, 0, 0);
      weekNum++;
    }
  }

  return buckets;
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

/**
 * Get the current and previous period date ranges based on the selected period type.
 * Returns { currentStart, currentEnd, previousStart, previousEnd, periodLabel }
 */
function getPeriodRanges(period: string): {
  currentStart: Date;
  currentEnd: Date;
  previousStart: Date;
  previousEnd: Date;
  periodLabel: string;
} {
  const now = new Date();

  switch (period) {
    case "weekly": {
      // Current week: Sunday to Saturday
      const dayOfWeek = now.getDay();
      const currentStart = new Date(now);
      currentStart.setDate(now.getDate() - dayOfWeek);
      currentStart.setHours(0, 0, 0, 0);
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + 6);
      currentEnd.setHours(23, 59, 59, 999);
      const previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 7);
      const previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousEnd.setHours(23, 59, 59, 999);
      return {
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
        // Show the full Sun→Sat range, not just the start date. The
        // previous label "Week of May 31" was technically correct
        // (KSA Sunday-start convention) but confused vendors who
        // expected to see today's date in the label — on a Saturday
        // it read like the period was already over. The range form
        // ("May 31 – Jun 6") makes both endpoints explicit so today's
        // date is always present in the label and there's no ambiguity
        // about Sunday- vs Monday-start week conventions.
        periodLabel: `${currentStart.toLocaleDateString("en-SA", { month: "short", day: "numeric" })} – ${currentEnd.toLocaleDateString("en-SA", { month: "short", day: "numeric" })}`,
      };
    }
    case "quarterly": {
      const quarter = Math.floor(now.getMonth() / 3);
      const currentStart = new Date(now.getFullYear(), quarter * 3, 1);
      const currentEnd = new Date(
        now.getFullYear(),
        quarter * 3 + 3,
        0,
        23,
        59,
        59,
        999,
      );
      const previousStart = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
      const previousEnd = new Date(
        now.getFullYear(),
        quarter * 3,
        0,
        23,
        59,
        59,
        999,
      );
      const quarterNames = ["Q1", "Q2", "Q3", "Q4"];
      return {
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
        periodLabel: `${quarterNames[quarter]} ${now.getFullYear()}`,
      };
    }
    case "yearly": {
      const currentStart = new Date(now.getFullYear(), 0, 1);
      const currentEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      const previousStart = new Date(now.getFullYear() - 1, 0, 1);
      const previousEnd = new Date(
        now.getFullYear() - 1,
        11,
        31,
        23,
        59,
        59,
        999,
      );
      return {
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
        periodLabel: `${now.getFullYear()}`,
      };
    }
    case "monthly":
    default: {
      const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );
      return {
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
        periodLabel: currentStart.toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
      };
    }
  }
}

function calcPercentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ============== FULL ANALYTICS ==============

/**
 * GET /api/v1/vendor/analytics
 *
 * Query: ?period=weekly|monthly|quarterly|yearly (default: monthly)
 *
 * Returns:
 * 1. Summary tiles (6) with % change vs previous period
 * 2. Earnings overview (last 6 months + current month)
 * 3. Trip status breakdown
 * 4. Booking source split + current month weekly trend
 * 5. Vehicle performance (paginated)
 * 6. Top 5 drivers
 */
export const getAnalytics = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const period = (req.query.period as string) || "monthly";
    const vehiclePage = parseInt((req.query.vehiclePage as string) || "1");
    const vehicleLimit = parseInt((req.query.vehicleLimit as string) || "10");

    const validPeriods = ["weekly", "monthly", "quarterly", "yearly"];
    if (!validPeriods.includes(period)) {
      throw new BadRequestError(
        `Invalid period. Must be one of: ${validPeriods.join(", ")}`,
      );
    }

    const {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      periodLabel,
    } = getPeriodRanges(period);
    const now = new Date();

    // ============================================
    // 1. SUMMARY TILES (6 tiles with % change)
    // ============================================

    const [
      currentCompletedTrips,
      previousCompletedTrips,
      currentEarningsAgg,
      previousEarningsAgg,
      currentAllBookings,
      previousAllBookings,
      currentCancelledTrips,
      previousCancelledTrips,
      currentActiveDrivers,
      previousActiveDrivers,
      currentActiveVehicles,
      previousActiveVehicles,
    ] = await Promise.all([
      // Tile 1: Completed trips — current period
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: currentStart, lte: currentEnd },
        },
      }),
      // Tile 1: Completed trips — previous period
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: previousStart, lte: previousEnd },
        },
      }),
      // Tile 2: Earnings — current period
      prisma.booking.aggregate({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: currentStart, lte: currentEnd },
        },
        _sum: { totalPrice: true },
      }),
      // Tile 2: Earnings — previous period
      prisma.booking.aggregate({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: previousStart, lte: previousEnd },
        },
        _sum: { totalPrice: true },
      }),
      // Tile 4: All bookings — current (for completion rate)
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          tripDate: { gte: currentStart, lte: currentEnd },
        },
      }),
      // Tile 4: All bookings — previous (for completion rate)
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          tripDate: { gte: previousStart, lte: previousEnd },
        },
      }),
      // Tile 4: Cancelled — current
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          // VENDOR_REJECTED removed in Stage 2: vendor rejection is now a
          // per-offer event on BookingAssignmentOffer, not a booking
          // status. From the vendor's perspective, only bookings they
          // ACCEPTED (vendorId set) and were later cancelled appear here.
          status: "CANCELLED",
          tripDate: { gte: currentStart, lte: currentEnd },
        },
      }),
      // Tile 4: Cancelled — previous
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          // VENDOR_REJECTED removed in Stage 2: vendor rejection is now a
          // per-offer event on BookingAssignmentOffer, not a booking
          // status. From the vendor's perspective, only bookings they
          // ACCEPTED (vendorId set) and were later cancelled appear here.
          status: "CANCELLED",
          tripDate: { gte: previousStart, lte: previousEnd },
        },
      }),
      // Tile 5: Active drivers — current (as of now)
      prisma.driver.count({
        where: { vendorId: vendor.id, isActive: true, status: "APPROVED" },
      }),
      // Tile 5: Active drivers — previous (approximate, use total at that time)
      prisma.driver.count({
        where: {
          vendorId: vendor.id,
          isActive: true,
          status: "APPROVED",
          createdAt: { lte: previousEnd },
        },
      }),
      // Tile 6: Active vehicles — current
      prisma.vehicle.count({
        where: { vendorId: vendor.id, isActive: true, status: "APPROVED" },
      }),
      // Tile 6: Active vehicles — previous
      prisma.vehicle.count({
        where: {
          vendorId: vendor.id,
          isActive: true,
          status: "APPROVED",
          createdAt: { lte: previousEnd },
        },
      }),
    ]);

    const currentEarnings = Number(currentEarningsAgg._sum.totalPrice || 0);
    const previousEarnings = Number(previousEarningsAgg._sum.totalPrice || 0);
    const currentAvgTrip =
      currentCompletedTrips > 0 ? currentEarnings / currentCompletedTrips : 0;
    const previousAvgTrip =
      previousCompletedTrips > 0
        ? previousEarnings / previousCompletedTrips
        : 0;
    const currentCompletionRate =
      currentAllBookings > 0
        ? Math.round((currentCompletedTrips / currentAllBookings) * 100)
        : 0;
    const previousCompletionRate =
      previousAllBookings > 0
        ? Math.round((previousCompletedTrips / previousAllBookings) * 100)
        : 0;

    const summaryTiles = {
      totalTripsCompleted: {
        value: currentCompletedTrips,
        percentChange: calcPercentChange(
          currentCompletedTrips,
          previousCompletedTrips,
        ),
      },
      totalEarnings: {
        value: Math.round(currentEarnings * 100) / 100,
        percentChange: calcPercentChange(currentEarnings, previousEarnings),
      },
      averageTripValue: {
        value: Math.round(currentAvgTrip * 100) / 100,
        percentChange: calcPercentChange(currentAvgTrip, previousAvgTrip),
      },
      completionRate: {
        value: currentCompletionRate,
        percentChange: calcPercentChange(
          currentCompletionRate,
          previousCompletionRate,
        ),
      },
      activeDrivers: {
        value: currentActiveDrivers,
        percentChange: calcPercentChange(
          currentActiveDrivers,
          previousActiveDrivers,
        ),
      },
      activeVehicles: {
        value: currentActiveVehicles,
        percentChange: calcPercentChange(
          currentActiveVehicles,
          previousActiveVehicles,
        ),
      },
    };

    // ============================================
    // ============================================
    // 2. EARNINGS OVERVIEW — PERIOD-AWARE BUCKETS
    // ============================================
    //
    // Bucket shape varies by period (see getEarningsBuckets):
    //   weekly    → 7 daily buckets
    //   monthly   → last 6 months
    //   quarterly → 3 months of current quarter
    //   yearly    → 12 months of current year
    //
    // Each bucket gets a separate count + sum query. Chart-friendly
    // shape: oldest-first, with `month`/`monthKey` field names kept
    // for response compatibility with the existing frontend.

    const earningsBuckets = getEarningsBuckets(period);
    const monthlyEarnings: Array<{
      month: string;
      monthKey: string;
      amount: number;
      rides: number;
    }> = [];

    for (const bucket of earningsBuckets) {
      const result = await prisma.booking.aggregate({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: bucket.start, lte: bucket.end },
        },
        _sum: { totalPrice: true },
        _count: { id: true },
      });

      monthlyEarnings.push({
        month: bucket.label,
        monthKey: bucket.monthKey,
        amount: Number(result._sum.totalPrice || 0),
        rides: result._count.id,
      });
    }

    // For the "currentMonth"/"previousMonth" summary fields below the
    // chart, we use the last and second-to-last buckets — semantically
    // "current" and "previous" relative to whatever period the user
    // selected, not literally "month". The labels naming carry over
    // from the original API shape to keep the frontend stable.
    const lastIdx = monthlyEarnings.length - 1;
    const currentMonthEarning = monthlyEarnings[lastIdx]?.amount || 0;
    const previousMonthEarning =
      lastIdx > 0 ? monthlyEarnings[lastIdx - 1].amount : 0;
    const earningsPercentChange = calcPercentChange(
      currentMonthEarning,
      previousMonthEarning,
    );

    // ============================================
    // 3. TRIP STATUS BREAKDOWN
    // ============================================

    const statusCounts = await prisma.booking.groupBy({
      by: ["status"],
      where: {
        vendorId: vendor.id,
        tripDate: { gte: currentStart, lte: currentEnd },
      },
      _count: { id: true },
    });

    const statusMap: Record<string, number> = {
      Completed: 0,
      Confirmed: 0,
      "In Progress": 0,
      Cancelled: 0,
    };

    statusCounts.forEach((s) => {
      if (s.status === "COMPLETED") statusMap["Completed"] += s._count.id;
      else if (s.status === "CONFIRMED") statusMap["Confirmed"] += s._count.id;
      else if (s.status === "IN_PROGRESS")
        statusMap["In Progress"] += s._count.id;
      else if (s.status === "CANCELLED") statusMap["Cancelled"] += s._count.id;
    });

    const totalStatusBookings = Object.values(statusMap).reduce(
      (a, b) => a + b,
      0,
    );
    const tripStatusBreakdown = Object.entries(statusMap).map(
      ([status, count]) => ({
        status,
        count,
        percentage:
          totalStatusBookings > 0
            ? Math.round((count / totalStatusBookings) * 100)
            : 0,
      }),
    );

    // ============================================
    // 4. TRIP TYPE MIX + WEEKLY TREND
    // ============================================
    //
    // The previous section here exposed PARTNER vs DIRECT booking
    // counts — the booking's commercial source. Vendors aren't
    // supposed to know whether a booking came through a partner
    // (B2B referral) or admin-direct (B2C); pricing terms differ
    // upstream and surfacing the source breaks the abstraction that
    // a booking is just "a booking we got from admin." Replaced
    // with a tripType (ONE_WAY vs HOURLY) breakdown — that data is
    // already visible on each booking row and is actually
    // actionable: vendor can see e.g. "60% of our bookings are
    // hourly chauffeur, let's price our hourly availability
    // accordingly" or "lots of one-way airport runs, plan driver
    // shifts around peak flight times."

    const tripTypeCounts = await prisma.booking.groupBy({
      by: ["tripType"],
      where: {
        vendorId: vendor.id,
        tripDate: { gte: currentStart, lte: currentEnd },
      },
      _count: { id: true },
    });

    const totalTripTypeBookings = tripTypeCounts.reduce(
      (sum, s) => sum + s._count.id,
      0,
    );
    const oneWayCount =
      tripTypeCounts.find((s) => s.tripType === "ONE_WAY")?._count.id || 0;
    const hourlyCount =
      tripTypeCounts.find((s) => s.tripType === "HOURLY")?._count.id || 0;

    // Same shape (`direct` / `partner` keys) the frontend already
    // consumes for the source chart — keeps the diff minimal and
    // doesn't require touching the chart component. The keys are now
    // semantic-anchors only; their labels carry the real meaning.
    // `direct` slot holds one-way trips, `partner` slot holds hourly.
    const tripTypeMix = {
      total: totalTripTypeBookings,
      direct: {
        count: oneWayCount,
        percentage:
          totalTripTypeBookings > 0
            ? Math.round((oneWayCount / totalTripTypeBookings) * 100)
            : 0,
        label: "One-Way Trips",
      },
      partner: {
        count: hourlyCount,
        percentage:
          totalTripTypeBookings > 0
            ? Math.round((hourlyCount / totalTripTypeBookings) * 100)
            : 0,
        label: "Hourly Chauffeur",
      },
    };

    // Bookings trend — period-aware. At weekly zoom this is daily;
    // monthly is per-week; quarterly is per-week across the quarter;
    // yearly is per-month. Frontend renders as a bar chart so axes
    // are tight and counts read well.
    const trendBuckets = getTrendBuckets(period);
    const weeklyTrend: Array<{
      week: string;
      weekNumber: number;
      rides: number;
      dateRange: string;
    }> = [];

    for (const bucket of trendBuckets) {
      const ridesInBucket = await prisma.booking.count({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: bucket.start, lte: bucket.end },
        },
      });
      weeklyTrend.push({
        week: bucket.label,
        weekNumber: bucket.weekNumber,
        rides: ridesInBucket,
        dateRange: bucket.dateRange,
      });
    }

    // Label for the trend chart's header. Adapts to period so the user
    // sees what scope the trend covers.
    let trendLabel: string;
    if (period === "weekly") {
      trendLabel = "This Week";
    } else if (period === "quarterly") {
      trendLabel = periodLabel; // e.g. "Q2 2026"
    } else if (period === "yearly") {
      trendLabel = String(now.getFullYear());
    } else {
      // monthly — current month label, same as before
      trendLabel = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ).toLocaleString("default", { month: "long", year: "numeric" });
    }

    // ============================================
    // 5. VEHICLE PERFORMANCE (PAGINATED)
    // ============================================

    const vehicleSkip = (vehiclePage - 1) * vehicleLimit;

    const allVehicles = await prisma.vehicle.findMany({
      where: { vendorId: vendor.id },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        plateNumber: true,
        category: true,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
      skip: vehicleSkip,
      take: vehicleLimit,
    });

    const totalVehicleCount = await prisma.vehicle.count({
      where: { vendorId: vendor.id },
    });

    const vehiclePerformance = await Promise.all(
      allVehicles.map(async (v) => {
        const stats = await prisma.booking.aggregate({
          where: { vehicleId: v.id, status: "COMPLETED" },
          _count: { id: true },
          _sum: { totalPrice: true },
        });

        return {
          id: v.id,
          vehicle: `${v.make} ${v.model} ${v.year}`,
          plateNumber: v.plateNumber,
          category: v.category,
          categoryLabel: VEHICLE_CLASS_LABELS[v.category] || v.category,
          isActive: v.isActive,
          totalTrips: stats._count.id,
          totalEarnings: Number(stats._sum.totalPrice || 0),
          rating: null as number | null, // Placeholder — review system not yet implemented
          performance:
            stats._count.id > 0
              ? Math.min(
                  100,
                  Math.round(
                    (stats._count.id / Math.max(currentCompletedTrips, 1)) *
                      100,
                  ),
                )
              : 0,
        };
      }),
    );

    // Sort by total trips descending
    vehiclePerformance.sort((a, b) => b.totalTrips - a.totalTrips);

    // ============================================
    // 6. TOP 5 PERFORMING DRIVERS
    // ============================================

    const driverStats = await prisma.booking.groupBy({
      by: ["driverId"],
      where: {
        vendorId: vendor.id,
        status: "COMPLETED",
        driverId: { not: null },
      },
      _count: { id: true },
      _sum: { totalPrice: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    });

    const driverIds = driverStats
      .map((d) => d.driverId)
      .filter(Boolean) as string[];

    const drivers = await prisma.driver.findMany({
      where: { id: { in: driverIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        photoUrl: true,
        rating: true,
      },
    });

    const driverMap = new Map(drivers.map((d) => [d.id, d]));

    // Build top-drivers list with signed photo URLs. Raw GCS paths
    // wouldn't render in the browser — needs a 7-day signed read URL.
    // Promise.all so the signing fans out concurrently rather than
    // blocking sequentially on each driver.
    const topDrivers = await Promise.all(
      driverStats.map(async (stat, i) => {
        const driver = driverMap.get(stat.driverId!);
        const signedPhotoUrl = driver?.photoUrl
          ? await getReadUrl(driver.photoUrl)
          : null;
        return {
          rank: i + 1,
          driverId: stat.driverId,
          name: driver ? `${driver.firstName} ${driver.lastName}` : "Unknown",
          phone: driver?.phone || null,
          photoUrl: signedPhotoUrl,
          rating: driver?.rating ? Number(driver.rating) : null,
          totalTrips: stat._count.id,
          totalEarnings: Number(stat._sum.totalPrice || 0),
        };
      }),
    );

    // ============================================
    // RESPONSE
    // ============================================

    res.json({
      success: true,
      data: {
        period,
        periodLabel,
        currentPeriod: { start: currentStart, end: currentEnd },
        previousPeriod: { start: previousStart, end: previousEnd },

        // 1. Summary tiles
        summary: summaryTiles,

        // 2. Earnings overview — period-aware buckets (oldest first
        //    for chart). Bucket shape varies by period; see
        //    getEarningsBuckets for details.
        earningsOverview: {
          months: monthlyEarnings,
          currentMonth: {
            label: monthlyEarnings[lastIdx]?.month || "",
            amount: currentMonthEarning,
            rides: monthlyEarnings[lastIdx]?.rides || 0,
          },
          previousMonth: {
            label: lastIdx > 0 ? monthlyEarnings[lastIdx - 1].month : "",
            amount: previousMonthEarning,
          },
          percentChange: earningsPercentChange,
        },

        // 3. Trip status breakdown
        tripStatus: {
          total: totalStatusBookings,
          breakdown: tripStatusBreakdown,
        },

        // 4. Trip-type mix (was: booking source) + bookings trend.
        // Key `bookingSource` is retained for frontend compatibility —
        // the chart component already consumes that name and we just
        // changed what it represents (one-way vs hourly). Worth
        // renaming on both sides in a follow-up.
        bookingSource: tripTypeMix,
        weeklyTrend: {
          monthLabel: trendLabel,
          weeks: weeklyTrend,
        },

        // 5. Vehicle performance (paginated)
        vehiclePerformance: {
          vehicles: vehiclePerformance,
          pagination: {
            page: vehiclePage,
            limit: vehicleLimit,
            total: totalVehicleCount,
            totalPages: Math.ceil(totalVehicleCount / vehicleLimit),
          },
        },

        // 6. Top 5 drivers
        topDrivers,
      },
    });
  },
);

// ============== EXPORT REPORT CSV ==============

/**
 * GET /api/v1/vendor/analytics/export
 *
 * Export analytics data as CSV for the selected period.
 */
export const exportAnalyticsReport = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const period = (req.query.period as string) || "monthly";
    const { currentStart, currentEnd, periodLabel } = getPeriodRanges(period);

    // Get all completed bookings in the period
    const bookings = await prisma.booking.findMany({
      where: {
        vendorId: vendor.id,
        status: "COMPLETED",
        tripDate: { gte: currentStart, lte: currentEnd },
      },
      orderBy: { tripDate: "asc" },
      select: {
        bookingRef: true,
        guestName: true,
        guestPhone: true,
        route: true,
        pickupAddress: true,
        dropoffAddress: true,
        tripType: true,
        tripDate: true,
        tripTime: true,
        city: true,
        vehicleClass: true,
        basePrice: true,
        vatAmount: true,
        totalPrice: true,
        // source / partner intentionally not selected — see comment
        // in vendor/bookings.controller.ts. The vendor analytics CSV
        // export shouldn't carry booking-origin attribution either.
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { make: true, model: true, plateNumber: true } },
      },
    });

    // "Source" column intentionally omitted — same rationale as the
    // bookings-list CSV export.
    const headers = [
      "Booking No",
      "Customer",
      "Phone",
      "Route",
      "Trip Date",
      "Trip Time",
      "City",
      "Vehicle Class",
      "Base Price (SAR)",
      "VAT (SAR)",
      "Total (SAR)",
      "Driver",
      "Vehicle",
    ];

    const rows = bookings.map((b) => [
      b.bookingRef,
      b.guestName || "",
      b.guestPhone || "",
      b.route || `${b.pickupAddress} → ${b.dropoffAddress}`,
      new Date(b.tripDate).toLocaleDateString(),
      b.tripTime,
      b.city,
      b.vehicleClass,
      Number(b.basePrice).toFixed(2),
      Number(b.vatAmount).toFixed(2),
      Number(b.totalPrice).toFixed(2),
      b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : "",
      b.vehicle
        ? `${b.vehicle.make} ${b.vehicle.model} (${b.vehicle.plateNumber})`
        : "",
    ]);

    // Add totals
    const subTotal = bookings.reduce((s, b) => s + Number(b.basePrice), 0);
    const totalVat = bookings.reduce((s, b) => s + Number(b.vatAmount), 0);
    const grandTotal = bookings.reduce((s, b) => s + Number(b.totalPrice), 0);

    rows.push([]);
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Sub-Total",
      subTotal.toFixed(2),
      "",
      "",
      "",
      "",
    ]);
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "VAT (15%)",
      "",
      totalVat.toFixed(2),
      "",
      "",
      "",
    ]);
    rows.push([
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Grand Total",
      "",
      "",
      grandTotal.toFixed(2),
      "",
      "",
    ]);

    const csvContent = [
      `Report: ${vendor.companyName} — ${periodLabel}`,
      `Period: ${currentStart.toLocaleDateString()} – ${currentEnd.toLocaleDateString()}`,
      `Total Completed Trips: ${bookings.length}`,
      `Total Earnings: SAR ${grandTotal.toFixed(2)}`,
      "",
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const fileName = `analytics-${vendor.companyName.replace(/\s+/g, "_")}-${period}-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csvContent);
  },
);
