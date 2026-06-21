// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/vendor/dashboard.controller.ts
// ============================================
import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { requireOperational, requireApprovedAndDocsValid } from "./_shared";

// ============== GCS (for signed photo URLs) ==============

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true, status: true, companyName: true },
  });
  if (!vendor) throw new NotFoundError("Vendor profile");
  return vendor;
}

// ============== SUMMARY TILES ==============

export const getDashboardSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    // ---- Tile 1: Monthly Earnings + 3-month trend ----
    const monthlyEarnings: { month: string; amount: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        0,
        23,
        59,
        59,
      );
      const label = mStart.toLocaleString("default", {
        month: "short",
        year: "numeric",
      });
      const agg = await prisma.booking.aggregate({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: mStart, lte: mEnd },
        },
        _sum: { totalPrice: true },
      });
      monthlyEarnings.push({
        month: label,
        amount: Number(agg._sum.totalPrice || 0),
      });
    }

    const currentEarning = monthlyEarnings[0].amount;
    const prevEarning = monthlyEarnings[1].amount;
    const earningsChange =
      prevEarning > 0
        ? Math.round(((currentEarning - prevEarning) / prevEarning) * 100)
        : currentEarning > 0
          ? 100
          : 0;

    // ---- Tile 2: Active Trips + Completed this month + Acceptance rate ----
    const [
      activeTrips,
      completedThisMonth,
      totalAssignedThisMonth,
      rejectedThisMonth,
    ] = await Promise.all([
      prisma.booking.count({
        where: { vendorId: vendor.id, status: "IN_PROGRESS" },
      }),
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: currentMonthStart, lte: currentMonthEnd },
        },
      }),
      // Acceptance rate uses the per-offer audit trail (Stage 2's new
      // BookingAssignmentOffer table) instead of the old booking-status-
      // based query. Old model: booking.status = "VENDOR_REJECTED"
      // meant THIS vendor rejected the booking. New model: every offer
      // is a row in BookingAssignmentOffer; we count this vendor's
      // accept/reject responses this month directly.
      prisma.bookingAssignmentOffer.count({
        where: {
          vendorId: vendor.id,
          offeredAt: { gte: currentMonthStart, lte: currentMonthEnd },
        },
      }),
      prisma.bookingAssignmentOffer.count({
        where: {
          vendorId: vendor.id,
          status: "REJECTED",
          offeredAt: { gte: currentMonthStart, lte: currentMonthEnd },
        },
      }),
    ]);

    const acceptanceRate =
      totalAssignedThisMonth > 0
        ? Math.round(
            ((totalAssignedThisMonth - rejectedThisMonth) /
              totalAssignedThisMonth) *
              100,
          )
        : 100;

    // ---- Tile 3: Fleet Overview ----
    //
    // Counting semantics differ between vehicles and drivers because the
    // `isActive` column means different things for each:
    //
    //   • Vehicles: `isActive=false` is an OPERATIONAL state (suspended
    //     for expired docs by cron, deactivated by vendor, or in
    //     maintenance). It does NOT mean deleted — vehicle delete is a
    //     hard delete that removes the row entirely. So totalVehicles
    //     counts EVERY vehicle row, regardless of isActive, because all
    //     of them are part of the fleet that the vendor needs to see
    //     (including suspended ones so they can renew docs and unsuspend).
    //
    //   • Drivers: `isActive=false` means soft-deleted (via the vendor's
    //     "Delete driver" action). No cron flips drivers to inactive.
    //     So totalDrivers filters by isActive=true to exclude soft-
    //     deleted drivers from the headline count — matches what the
    //     vendor sees on the Drivers page.
    //
    // activeVehicles and activeDrivers keep their `isActive: true,
    // status: "APPROVED"` filter — these count vehicles/drivers that
    // are RIGHT NOW operational (approved AND not suspended).
    const [totalVehicles, activeVehicles, totalDrivers, activeDrivers] =
      await Promise.all([
        prisma.vehicle.count({ where: { vendorId: vendor.id } }),
        prisma.vehicle.count({
          where: { vendorId: vendor.id, isActive: true, status: "APPROVED" },
        }),
        prisma.driver.count({ where: { vendorId: vendor.id, isActive: true } }),
        prisma.driver.count({
          where: { vendorId: vendor.id, isActive: true, status: "APPROVED" },
        }),
      ]);

    const avgDriverRating = await prisma.driver.aggregate({
      where: { vendorId: vendor.id, isActive: true, rating: { not: null } },
      _avg: { rating: true },
    });

    // ---- Tile 4: Compliance — expiring AND expired documents ----
    //
    // We track two distinct buckets because they need different
    // urgency treatment in the UI:
    //
    //   • EXPIRED docs (`expiryDate <= now`): already past the
    //     deadline. The vendor must act NOW. Vehicles with expired
    //     required docs get cron-suspended (status flips to
    //     EXPIRED_DOCS, isActive=false) — so we DO NOT filter by
    //     `status: APPROVED` for the expired-vehicle count, because
    //     those vehicles are precisely the ones we need to surface.
    //     We also don't filter by `isActive: true` for the same
    //     reason. Drivers don't have the same cron suspension, but
    //     we keep the count consistent by not filtering on their
    //     status either.
    //
    //   • EXPIRING docs (`expiryDate > now AND <= now+30d`): in the
    //     warning window but still valid. The vendor has time to
    //     renew. Filtered to APPROVED + isActive so we don't double-
    //     count vehicles that are ALREADY expired-and-suspended (those
    //     show up in the expired bucket instead).
    //
    // Counts are at the ENTITY level (vehicles / drivers), not at the
    // raw document row level. A vehicle with two expired docs is still
    // ONE compliance item.
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const [
      expiringDriverDocs,
      expiringVehicleDocs,
      expiredDriverDocs,
      expiredVehicleDocs,
    ] = await Promise.all([
      // Drivers with a doc expiring in the next 30 days (still valid today).
      prisma.driver.count({
        where: {
          vendorId: vendor.id,
          status: "APPROVED",
          isActive: true,
          documents: {
            some: {
              expiryDate: { lte: thirtyDaysFromNow, gt: now },
            },
          },
        },
      }),
      // Vehicles with a doc expiring in the next 30 days (still valid today).
      prisma.vehicle.count({
        where: {
          vendorId: vendor.id,
          status: "APPROVED",
          isActive: true,
          documents: {
            some: {
              expiryDate: { lte: thirtyDaysFromNow, gt: now },
            },
          },
        },
      }),
      // Drivers with at least one already-expired doc. No status filter
      // — we want to surface them regardless of where they are in the
      // approval pipeline because expired docs are blocking issues.
      prisma.driver.count({
        where: {
          vendorId: vendor.id,
          isActive: true,
          documents: {
            some: { expiryDate: { lte: now } },
          },
        },
      }),
      // Vehicles with at least one already-expired doc. NO status/isActive
      // filter: a vehicle whose Insurance just expired has status flipped
      // to EXPIRED_DOCS by cron, and that's exactly the row we want to
      // count here. Filtering by APPROVED would silently hide them.
      prisma.vehicle.count({
        where: {
          vendorId: vendor.id,
          documents: {
            some: { expiryDate: { lte: now } },
          },
        },
      }),
    ]);

    // ---- New booking requests = offers currently awaiting this
    // vendor's response. Replaces the old AWAITING_VENDOR booking-
    // status query. Counts both first-attempt offers and price-revised
    // re-offers; vendor sees them as a single "needs action" list.
    const newBookingRequests = await prisma.bookingAssignmentOffer.count({
      where: { vendorId: vendor.id, status: "PENDING" },
    });

    res.json({
      success: true,
      data: {
        newBookingRequests,
        earnings: {
          current: currentEarning,
          percentChange: earningsChange,
          trend: monthlyEarnings,
        },
        trips: {
          active: activeTrips,
          completedThisMonth,
          acceptanceRate,
        },
        fleet: {
          totalVehicles,
          activeVehicles,
          totalDrivers,
          activeDrivers,
          avgDriverRating: avgDriverRating._avg.rating
            ? Number(avgDriverRating._avg.rating)
            : null,
        },
        compliance: {
          // Sum of expiring (next 30d, not yet past). Frontend uses this
          // for the amber "expiring soon" treatment.
          expiringDocs: expiringDriverDocs + expiringVehicleDocs,
          expiringDriverDocs,
          expiringVehicleDocs,
          // Sum of already-expired. Frontend uses this for the red
          // "urgent — already expired" treatment that takes precedence
          // over expiring when both are non-zero.
          expiredDocs: expiredDriverDocs + expiredVehicleDocs,
          expiredDriverDocs,
          expiredVehicleDocs,
        },
      },
    });
  },
);

// ============== RECENT BOOKINGS ==============

export const getRecentBookings = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const { page = "1", limit = "10" } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: { vendorId: vendor.id },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          bookingRef: true,
          guestName: true,
          route: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripType: true,
          // Trip-type detail fields drive the violet HOURLY chip with
          // hours label, the sky CityBadge (HOURLY only), and the
          // smart route cell (HOURLY shows pickup-only). Same shape
          // partner + admin recent-bookings consume.
          hours: true,
          hourlyDuration: true,
          city: true,
          tripDate: true,
          tripTime: true,
          vehicleClass: true,
          totalPrice: true,
          // Vendor cares about their payout, not the customer's
          // total price. Surfaced alongside totalPrice — the row
          // can show vendorPayoutAmount as the headline number for
          // the vendor; totalPrice is left here in case anything
          // downstream still expects it.
          vendorPayoutAmount: true,
          status: true,
          // source / partner intentionally not selected — vendor-facing
          // responses don't carry booking-origin attribution.
          driver: { select: { firstName: true, lastName: true } },
          createdAt: true,
        },
      }),
      prisma.booking.count({ where: { vendorId: vendor.id } }),
    ]);

    const formattedBookings = bookings.map((b) => ({
      id: b.id,
      bookingRef: b.bookingRef,
      guestName: b.guestName || "—",
      route: b.route || `${b.pickupAddress} → ${b.dropoffAddress}`,
      pickupAddress: b.pickupAddress,
      dropoffAddress: b.dropoffAddress,
      tripType: b.tripType,
      hours: b.hours,
      hourlyDuration: (b as any).hourlyDuration || null,
      city: b.city,
      tripDate: b.tripDate,
      tripTime: b.tripTime,
      vehicleClass: b.vehicleClass,
      totalPrice: Number(b.totalPrice),
      vendorPayoutAmount: b.vendorPayoutAmount
        ? Number(b.vendorPayoutAmount)
        : null,
      status: b.status,
      // isPartnerBooking / partnerName intentionally omitted.
      driverName: b.driver
        ? `${b.driver.firstName} ${b.driver.lastName}`
        : null,
      createdAt: b.createdAt,
    }));

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

// ============== CALENDAR DATA ==============

export const getCalendarData = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const { month, year } = req.query;
    const targetMonth = month
      ? parseInt(month as string) - 1
      : new Date().getMonth();
    const targetYear = year
      ? parseInt(year as string)
      : new Date().getFullYear();
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    const bookings = await prisma.booking.findMany({
      where: {
        vendorId: vendor.id,
        tripDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        bookingRef: true,
        guestName: true,
        tripDate: true,
        tripTime: true,
        status: true,
        vehicleClass: true,
        route: true,
      },
      orderBy: { tripTime: "asc" },
    });

    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const calendarMap: Record<
      string,
      {
        date: string;
        bookings: any[];
        count: number;
        statuses: Record<string, number>;
      }
    > = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      calendarMap[dateKey] = {
        date: dateKey,
        bookings: [],
        count: 0,
        statuses: {},
      };
    }

    bookings.forEach((b) => {
      const dateKey = new Date(b.tripDate).toISOString().split("T")[0];
      if (calendarMap[dateKey]) {
        calendarMap[dateKey].bookings.push(b);
        calendarMap[dateKey].count++;
        calendarMap[dateKey].statuses[b.status] =
          (calendarMap[dateKey].statuses[b.status] || 0) + 1;
      }
    });

    res.json({
      success: true,
      data: {
        month: targetMonth + 1,
        year: targetYear,
        days: Object.values(calendarMap),
      },
    });
  },
);

// ============== TOP PERFORMER DRIVERS ==============

export const getTopDrivers = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const driverStats = await prisma.booking.groupBy({
      by: ["driverId"],
      where: {
        vendorId: vendor.id,
        status: "COMPLETED",
        driverId: { not: null },
      },
      _count: { id: true },
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

    // Resolve photoUrl through GCS signed URL — raw paths can't be loaded by the browser
    const topDrivers = await Promise.all(
      driverStats.map(async (stat, i) => {
        const driver = driverMap.get(stat.driverId!);
        return {
          rank: i + 1,
          driverId: stat.driverId,
          name: driver ? `${driver.firstName} ${driver.lastName}` : "Unknown",
          phone: driver?.phone || null,
          photoUrl: await getReadUrl(driver?.photoUrl || null),
          rating: driver?.rating ? Number(driver.rating) : null,
          completedTrips: stat._count.id,
        };
      }),
    );

    res.json({ success: true, data: { drivers: topDrivers } });
  },
);

// ============== PENDING PAYOUTS ==============

export const getPendingPayouts = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    );

    // Get completed bookings from last month
    const lastMonthBookings = await prisma.booking.aggregate({
      where: {
        vendorId: vendor.id,
        status: "COMPLETED",
        tripDate: { gte: prevMonthStart, lte: prevMonthEnd },
      },
      _sum: { totalPrice: true },
      _count: { id: true },
    });

    // Check if payout already exists for this period
    const existingPayout = await prisma.vendorPayout.findFirst({
      where: {
        vendorId: vendor.id,
        periodStart: prevMonthStart,
        periodEnd: prevMonthEnd,
      },
    });

    // Get all pending payouts
    const pendingPayouts = await prisma.vendorPayout.findMany({
      where: { vendorId: vendor.id, status: "PENDING" },
      orderBy: { periodStart: "desc" },
    });

    const totalPending = pendingPayouts.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    res.json({
      success: true,
      data: {
        lastMonth: {
          period: prevMonthStart.toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
          amount: Number(lastMonthBookings._sum.totalPrice || 0),
          bookingCount: lastMonthBookings._count.id,
          isPaid: existingPayout?.status === "PAID",
          payoutId: existingPayout?.id || null,
        },
        pendingPayouts: pendingPayouts.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          period: `${new Date(p.periodStart).toLocaleString("default", { month: "short" })} ${new Date(p.periodStart).getFullYear()}`,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          bookingCount: p.bookingCount,
          status: p.status,
        })),
        totalPending,
      },
    });
  },
);
