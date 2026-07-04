// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/partner/dashboard.controller.ts
// ============================================
// ============================================
// apps/server/src/controller/partner/dashboard.controller.ts
// Partner Portal — Dashboard
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError } from "../../utils/AppError";
import { requireOperational } from "./_shared";

// Helper: get the partner record for the logged-in user
async function getPartnerForUser(userId: string) {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: { id: true, status: true, companyName: true },
  });
  if (!partner) throw new NotFoundError("Partner profile");
  return partner;
}

// ============== PROFILE STATUS ==============

/**
 * Get partner profile status
 * Used by frontend to gate all dashboard sections
 */
export const getProfileStatus = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await prisma.partner.findUnique({
      where: { userId: req.user!.id },
      select: {
        id: true,
        status: true,
        companyName: true,
        isProfileComplete: true,
        mouFileUrl: true,
        mouExpiryDate: true,
        profileSubmittedAt: true,
        profileReviewedAt: true,
        reviewComments: {
          where: { isResolved: false },
          select: {
            fieldName: true,
            comment: true,
            type: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!partner) throw new NotFoundError("Partner profile");

    res.json({
      success: true,
      data: {
        id: partner.id,
        status: partner.status,
        companyName: partner.companyName,
        isApproved: partner.status === "APPROVED",
        isProfileComplete: partner.isProfileComplete,
        hasMou: !!partner.mouFileUrl,
        mouExpiryDate: partner.mouExpiryDate,
        profileSubmittedAt: partner.profileSubmittedAt,
        profileReviewedAt: partner.profileReviewedAt,
        unresolvedComments: partner.reviewComments,
        unresolvedCount: partner.reviewComments.length,
      },
    });
  },
);

// ============== SUMMARY TILES ==============

/**
 * Get dashboard summary tiles
 * Tile 1: Active Bookings (IN_PROGRESS — assigned, customer is riding)
 * Tile 2: Monthly Rides (count + 4-month trend with % change)
 * Tile 3: Total Payable (accumulative unpaid invoices)
 * Tile 4: Upcoming Trips (CONFIRMED, not yet started)
 */
export const getDashboardSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

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

    // ---- Tile 1: Active Bookings (IN_PROGRESS) ----
    const activeBookings = await prisma.booking.count({
      where: {
        partnerId: partner.id,
        status: "IN_PROGRESS",
      },
    });

    // ---- Tile 2: Rides Completed (this month) + 4-month dual trend ----
    //
    // Switched from creation-based to completion-based in accordance
    // with how service businesses universally account for activity:
    // hotels report nights stayed, airlines report flights flown,
    // chauffeur platforms report rides delivered. A booking generated
    // today and cancelled tomorrow contributed zero service hours;
    // counting it inflates the month and misrepresents real workload.
    //
    // Slice rules:
    //   • "Completed" = `tripDate IN month AND status = COMPLETED`.
    //     We anchor on tripDate (not createdAt) because the operational
    //     fact is when the ride actually happened, not when the partner
    //     submitted the request. A booking created in June for an
    //     August trip belongs to August's completions.
    //   • "Created" = `createdAt IN month`, any status. Surfaces
    //     demand-side activity alongside delivery so the trend chart
    //     can show both lines and partners can spot a widening gap
    //     between bookings made and bookings delivered (the implicit
    //     cancellation/no-show signal).
    //
    // The percentChange figure is computed on completions — that's
    // the headline metric. Created counts are supplemental.
    const monthlyRideCounts: {
      month: string;
      completed: number;
      created: number;
    }[] = [];

    for (let i = 0; i < 5; i++) {
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

      const [completed, created] = await Promise.all([
        prisma.booking.count({
          where: {
            partnerId: partner.id,
            tripDate: { gte: monthStart, lte: monthEnd },
            status: "COMPLETED",
          },
        }),
        prisma.booking.count({
          where: {
            partnerId: partner.id,
            createdAt: { gte: monthStart, lte: monthEnd },
          },
        }),
      ]);

      monthlyRideCounts.push({ month: monthLabel, completed, created });
    }

    const currentMonthRides = monthlyRideCounts[0].completed;
    const previousMonthRides = monthlyRideCounts[1].completed;
    const percentChange =
      previousMonthRides > 0
        ? Math.round(
            ((currentMonthRides - previousMonthRides) / previousMonthRides) *
              100,
          )
        : currentMonthRides > 0
          ? 100
          : 0;

    // ---- Tile 2b: Cancellation rate (this month) ----
    //
    // Surfaced separately because mixing it into the headline rides
    // tile hides a quality signal. Denominator is bookings *created*
    // this month (only created bookings can be cancelled); numerator
    // is the subset that ended in CANCELLED. Anchored on createdAt so
    // the rate reflects this month's intake behaviour, not historical
    // cancellations of older bookings that happened to resolve this
    // month. A widening cancellation rate is the partner's earliest
    // warning of a vendor reliability or guest-side problem.
    const [cancelledThisMonth, createdThisMonth] = await Promise.all([
      prisma.booking.count({
        where: {
          partnerId: partner.id,
          createdAt: { gte: currentMonthStart, lte: currentMonthEnd },
          status: "CANCELLED",
        },
      }),
      prisma.booking.count({
        where: {
          partnerId: partner.id,
          createdAt: { gte: currentMonthStart, lte: currentMonthEnd },
        },
      }),
    ]);
    const cancellationRate =
      createdThisMonth > 0
        ? Math.round((cancelledThisMonth / createdThisMonth) * 100)
        : 0;

    // ---- Tile 3: Total Payable (accumulative unpaid invoices) ----
    // "Unpaid" under the new model = status not yet PAID. Stage 2
    // dropped the redundant isPaymentReceived boolean — status is now
    // the single source of truth. PENDING (newly issued, not yet acted
    // on) and OVERDUE (past dueDate) both count. PROOF_UPLOADED is
    // EXCLUDED here because the partner has already submitted proof
    // and is waiting on admin confirmation — surfacing it on the
    // "Total Payable" tile would imply the partner still needs to pay.
    const unpaidInvoices = await prisma.partnerInvoice.findMany({
      where: {
        partnerId: partner.id,
        status: { in: ["PENDING", "OVERDUE"] },
      },
      select: {
        id: true,
        amount: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        dueDate: true,
      },
      orderBy: { periodStart: "asc" },
    });

    const totalPayable = unpaidInvoices.reduce(
      (sum, inv) => sum + Number(inv.amount),
      0,
    );

    // ---- Tile 4: Upcoming Trips (CONFIRMED, tripDate in the future) ----
    const upcomingTrips = await prisma.booking.count({
      where: {
        partnerId: partner.id,
        status: "CONFIRMED",
        tripDate: { gte: now },
      },
    });

    // ---- Tile 5: Compliance — expiring AND expired documents ----
    //
    // Partners have two compliance surfaces:
    //
    //   1. Required profile documents (CR, VAT, Chamber, Balady,
    //      National Address, IBAN Letter — same 6 as vendor). Each has
    //      an expiryDate. Counted at the document level since partners
    //      are a single entity.
    //
    //   2. MOU. Single agreement per partner with one expiryDate on
    //      the partner row itself.
    //
    // We surface both in two buckets:
    //   • EXPIRED (`expiryDate <= now`): already past deadline. Red.
    //     Per requireApprovedAndDocsValid in _shared.ts, partner cannot
    //     perform write actions (create bookings, generate invoices)
    //     while any required doc is expired. Surface this urgently.
    //   • EXPIRING (`now < expiryDate <= now + 30d`): in the warning
    //     window but still valid. Amber.
    //
    // No `status` filter on the partner — even non-APPROVED partners
    // benefit from seeing what's expiring so they can renew proactively.
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const partnerWithMou = await prisma.partner.findUnique({
      where: { id: partner.id },
      select: { mouExpiryDate: true },
    });

    const [expiredDocCount, expiringDocCount] = await Promise.all([
      prisma.partnerDocument.count({
        where: {
          partnerId: partner.id,
          expiryDate: { lte: now },
        },
      }),
      prisma.partnerDocument.count({
        where: {
          partnerId: partner.id,
          expiryDate: { lte: thirtyDaysFromNow, gt: now },
        },
      }),
    ]);

    // MOU has its own column on the Partner row, not a PartnerDocument
    // entry — so it's not part of the doc counts above. Treat it as a
    // separate signal alongside the doc counts.
    const mouExpired =
      !!partnerWithMou?.mouExpiryDate &&
      new Date(partnerWithMou.mouExpiryDate) <= now;
    const mouExpiringSoon =
      !mouExpired &&
      !!partnerWithMou?.mouExpiryDate &&
      new Date(partnerWithMou.mouExpiryDate) <= thirtyDaysFromNow;

    // Headline totals: combine docs + MOU so the tile shows a single
    // urgent number. Granular fields below let the UI break it down.
    const expiredDocs = expiredDocCount + (mouExpired ? 1 : 0);
    const expiringDocs = expiringDocCount + (mouExpiringSoon ? 1 : 0);

    res.json({
      success: true,
      data: {
        activeBookings,
        // Renamed from `monthlyRides` to make the metric's basis
        // explicit in the API. `current` = COMPLETED rides this
        // month. Trend now carries both series so the frontend can
        // render a dual-line chart (completed vs created).
        ridesCompleted: {
          current: currentMonthRides,
          percentChange,
          trend: monthlyRideCounts, // [{ month, completed, created }, ...]
        },
        // Companion metric: cancellation rate for this month.
        // Separate tile so partners see quality alongside volume.
        cancellationRate: {
          rate: cancellationRate, // 0-100 integer percent
          cancelled: cancelledThisMonth,
          createdInMonth: createdThisMonth,
        },
        totalPayable: {
          amount: totalPayable,
          unpaidMonths: unpaidInvoices.length,
          breakdown: unpaidInvoices.map((inv) => ({
            id: inv.id,
            amount: Number(inv.amount),
            period: `${new Date(inv.periodStart).toLocaleString("default", { month: "short" })} ${new Date(inv.periodStart).getFullYear()}`,
            status: inv.status,
            dueDate: inv.dueDate,
          })),
        },
        upcomingTrips,
        compliance: {
          // Headline aggregates — UI picks the bigger number to drive
          // the red/amber color.
          expiredDocs,
          expiringDocs,
          // Per-category breakdown for the body of the tile.
          expiredProfileDocs: expiredDocCount,
          expiringProfileDocs: expiringDocCount,
          mouExpired,
          mouExpiringSoon,
        },
      },
    });
  },
);

// ============== BOOKINGS LIST ==============

/**
 * Get bookings for this partner (paginated, searchable)
 * Shows: guest name, route, date/time, status
 */
export const getPartnerBookings = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const {
      page = "1",
      limit = "10",
      search,
      status,
      startDate,
      endDate,
    } = req.query;

    const where: any = { partnerId: partner.id };

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      const s = search as string;
      where.OR = [
        { guestName: { contains: s, mode: "insensitive" } },
        { bookingRef: { contains: s, mode: "insensitive" } },
        { pickupAddress: { contains: s, mode: "insensitive" } },
        { dropoffAddress: { contains: s, mode: "insensitive" } },
        { route: { contains: s, mode: "insensitive" } },
      ];
    }

    if (startDate || endDate) {
      where.tripDate = {};
      if (startDate) where.tripDate.gte = new Date(startDate as string);
      if (endDate) where.tripDate.lte = new Date(endDate as string);
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          bookingRef: true,
          guestName: true,
          guestPhone: true,
          route: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripDate: true,
          tripTime: true,
          tripType: true,
          hours: true,
          hourlyDuration: true,
          city: true,
          vehicleClass: true,
          passengers: true,
          totalPrice: true,
          status: true,
          createdAt: true,
          vendor: {
            select: { companyName: true },
          },
          driver: {
            select: { firstName: true, lastName: true, phone: true },
          },
          vehicle: {
            select: { make: true, model: true, plateNumber: true },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    // Status counts for filter badges
    const statusCounts = await prisma.booking.groupBy({
      by: ["status"],
      where: { partnerId: partner.id },
      _count: { id: true },
    });
    const statusCountsObj: Record<string, number> = {};
    statusCounts.forEach((sc) => {
      statusCountsObj[sc.status] = sc._count.id;
    });

    res.json({
      success: true,
      data: {
        bookings,
        statusCounts: statusCountsObj,
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

// ============== BOOKINGS EXPORT (CSV) ==============

/**
 * Export all partner bookings as CSV
 */
export const exportBookingsCsv = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { startDate, endDate, status } = req.query;

    const where: any = { partnerId: partner.id };
    if (status && status !== "all") where.status = status;
    if (startDate || endDate) {
      where.tripDate = {};
      if (startDate) where.tripDate.gte = new Date(startDate as string);
      if (endDate) where.tripDate.lte = new Date(endDate as string);
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { tripDate: "desc" },
      select: {
        bookingRef: true,
        guestName: true,
        guestPhone: true,
        route: true,
        pickupAddress: true,
        dropoffAddress: true,
        tripDate: true,
        tripTime: true,
        tripType: true,
        city: true,
        vehicleClass: true,
        passengers: true,
        basePrice: true,
        vatAmount: true,
        totalPrice: true,
        status: true,
        createdAt: true,
        vendor: { select: { companyName: true } },
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { make: true, model: true, plateNumber: true } },
      },
    });

    // Build CSV
    const headers = [
      "Booking Ref",
      "Guest Name",
      "Guest Phone",
      "Route",
      "Pickup",
      "Dropoff",
      "Trip Date",
      "Trip Time",
      "Trip Type",
      "City",
      "Vehicle Class",
      "Passengers",
      "Base Price (SAR)",
      "VAT (SAR)",
      "Total (SAR)",
      "Status",
      "Vendor",
      "Driver",
      "Vehicle",
      "Created At",
    ];

    const rows = bookings.map((b) => [
      b.bookingRef,
      b.guestName || "",
      b.guestPhone || "",
      b.route || "",
      b.pickupAddress,
      b.dropoffAddress,
      new Date(b.tripDate).toLocaleDateString(),
      b.tripTime,
      b.tripType,
      b.city,
      b.vehicleClass,
      b.passengers,
      Number(b.basePrice).toFixed(2),
      Number(b.vatAmount).toFixed(2),
      Number(b.totalPrice).toFixed(2),
      b.status,
      b.vendor?.companyName || "",
      b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : "",
      b.vehicle
        ? `${b.vehicle.make} ${b.vehicle.model} (${b.vehicle.plateNumber})`
        : "",
      new Date(b.createdAt).toISOString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bookings-${partner.companyName.replace(/\s+/g, "_")}-${new Date().toISOString().split("T")[0]}.csv"`,
    );
    res.send(csvContent);
  },
);

// ============== CALENDAR DATA ==============

/**
 * Get bookings organized by date for calendar view
 * Returns: per-date summary with booking count, statuses, and created-today count
 */
export const getCalendarData = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { month, year } = req.query;

    const targetMonth = month
      ? parseInt(month as string) - 1
      : new Date().getMonth();
    const targetYear = year
      ? parseInt(year as string)
      : new Date().getFullYear();

    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    // Get all bookings for this month (by tripDate — when they're scheduled)
    const bookings = await prisma.booking.findMany({
      where: {
        partnerId: partner.id,
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
        createdAt: true,
      },
      orderBy: { tripTime: "asc" },
    });

    // Get bookings created on each date this month (for "X bookings made today" count)
    const bookingsCreatedThisMonth = await prisma.booking.findMany({
      where: {
        partnerId: partner.id,
        createdAt: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    // Group by tripDate
    const calendarMap: Record<
      string,
      {
        date: string;
        bookings: typeof bookings;
        count: number;
        statuses: Record<string, number>;
        createdCount: number; // bookings made on this date
      }
    > = {};

    // Initialize all days of the month
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      calendarMap[dateKey] = {
        date: dateKey,
        bookings: [],
        count: 0,
        statuses: {},
        createdCount: 0,
      };
    }

    // Fill in trip bookings by tripDate
    bookings.forEach((b) => {
      const dateKey = new Date(b.tripDate).toISOString().split("T")[0];
      if (calendarMap[dateKey]) {
        calendarMap[dateKey].bookings.push(b);
        calendarMap[dateKey].count++;
        calendarMap[dateKey].statuses[b.status] =
          (calendarMap[dateKey].statuses[b.status] || 0) + 1;
      }
    });

    // Fill in created counts
    bookingsCreatedThisMonth.forEach((b) => {
      const dateKey = new Date(b.createdAt).toISOString().split("T")[0];
      if (calendarMap[dateKey]) {
        calendarMap[dateKey].createdCount++;
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

// ============== CONTRACT & VEHICLE USAGE ==============

/**
 * Get contract status, expiry, and most used vehicle class
 */
export const getContractAndVehicleStats = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    // Contract / MOU info
    const partnerFull = await prisma.partner.findUnique({
      where: { id: partner.id },
      select: {
        status: true,
        mouFileUrl: true,
        mouExpiryDate: true,
        mouUploadedAt: true,
        creditLimit: true,
        currentBalance: true,
        paymentTerms: true,
      },
    });

    let contractStatus: "ACTIVE" | "EXPIRING" | "EXPIRED" | "NO_MOU" = "NO_MOU";
    let daysUntilExpiry: number | null = null;

    if (partnerFull?.mouExpiryDate) {
      const now = new Date();
      const twoMonthsFromNow = new Date();
      twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

      daysUntilExpiry = Math.ceil(
        (partnerFull.mouExpiryDate.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (partnerFull.mouExpiryDate < now) {
        contractStatus = "EXPIRED";
      } else if (partnerFull.mouExpiryDate <= twoMonthsFromNow) {
        contractStatus = "EXPIRING";
      } else {
        contractStatus = "ACTIVE";
      }
    }

    // Most used vehicle classes — counted from COMPLETED bookings
    // only. A vehicle that was booked four times and cancelled four
    // times was not "used" in any operational sense; counting it
    // would mislead the partner about which class to invest in.
    // Completion is the universal definition of "used" for service
    // platforms.
    const vehicleUsage = await prisma.booking.groupBy({
      by: ["vehicleClass"],
      where: {
        partnerId: partner.id,
        status: "COMPLETED",
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const totalBookingsForVehicle = vehicleUsage.reduce(
      (sum, v) => sum + v._count.id,
      0,
    );

    const vehicleBreakdown = vehicleUsage.map((v) => ({
      vehicleClass: v.vehicleClass,
      count: v._count.id,
      percentage:
        totalBookingsForVehicle > 0
          ? Math.round((v._count.id / totalBookingsForVehicle) * 100)
          : 0,
    }));

    res.json({
      success: true,
      data: {
        contract: {
          status: contractStatus,
          mouFileUrl: partnerFull?.mouFileUrl || null,
          mouExpiryDate: partnerFull?.mouExpiryDate || null,
          mouUploadedAt: partnerFull?.mouUploadedAt || null,
          daysUntilExpiry,
        },
        creditInfo: {
          creditLimit: Number(partnerFull?.creditLimit || 0),
          currentBalance: Number(partnerFull?.currentBalance || 0),
          paymentTerms: partnerFull?.paymentTerms || 30,
        },
        vehicleUsage: {
          mostUsed: vehicleBreakdown[0] || null,
          breakdown: vehicleBreakdown,
          totalBookings: totalBookingsForVehicle,
        },
      },
    });
  },
);
