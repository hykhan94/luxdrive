// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/admin/booking.controller.ts
// ============================================
// ============================================
// apps/server/src/controller/admin/booking.controller.ts
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import {
  formatStatusForUI,
  formatVehicleClass,
  buildVendorAssignment,
  buildStatusTimeline,
  getVendorStatusDisplay,
} from "../../utils/helpers/booking.helpers";
import { findEligibleVendors } from "../../lib/offer-cascade";
import { buildPOHtml } from "../../utils/helpers/po.helpers";
import {
  notifyVendorOfOffer,
  notifyVendorOfReOffer,
} from "../../lib/offer-notifications";

/**
 * Get all bookings with comprehensive filters
 */
export const getBookings = asyncWrapper(async (req: Request, res: Response) => {
  const {
    status,
    source,
    dateType,
    startDate,
    endDate,
    search,
    unreadOnly,
    attentionOnly,
    page = "1",
    limit = "10",
  } = req.query;

  const where: any = {};

  // Status filter
  if (status && status !== "all") {
    const statusMap: Record<string, string[]> = {
      pending: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
      confirmed: ["CONFIRMED"],
      "in-progress": ["IN_PROGRESS"],
      completed: ["COMPLETED"],
      cancelled: ["CANCELLED"],
    };
    const dbStatuses = statusMap[status as string];
    if (dbStatuses) {
      where.status = { in: dbStatuses };
    }
  }

  // Source filter
  if (source === "direct") {
    where.source = "DIRECT";
    where.partnerId = null;
  } else if (source === "partner") {
    where.source = "PARTNER";
    where.partnerId = { not: null };
  }

  // Date filter
  if (startDate && endDate) {
    const dateField = dateType === "receivedDate" ? "createdAt" : "tripDate";
    where[dateField] = {
      gte: new Date(startDate as string),
      lte: new Date(endDate as string),
    };
  }

  // Notification filters
  if (unreadOnly === "true") where.isReadByAdmin = false;
  if (attentionOnly === "true") where.needsAttention = true;

  // Search filter
  if (search) {
    const searchStr = search as string;
    where.OR = [
      { bookingRef: { contains: searchStr, mode: "insensitive" } },
      { guestName: { contains: searchStr, mode: "insensitive" } },
      { guestPhone: { contains: searchStr, mode: "insensitive" } },
      { customer: { name: { contains: searchStr, mode: "insensitive" } } },
      {
        partner: { companyName: { contains: searchStr, mode: "insensitive" } },
      },
    ];
  }

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  const [bookings, total, statusCounts, unreadCount, attentionCount] =
    await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: [
          { needsAttention: "desc" },
          { isReadByAdmin: "asc" },
          { createdAt: "desc" },
        ],
        include: {
          customer: {
            select: { id: true, name: true, email: true, phone: true },
          },
          partner: { select: { id: true, companyName: true } },
          vendor: { select: { id: true, companyName: true } },
          vehicle: {
            select: { id: true, make: true, model: true, plateNumber: true },
          },
          driver: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      }),
      prisma.booking.count({ where }),
      prisma.booking.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.booking.count({ where: { isReadByAdmin: false } }),
      prisma.booking.count({ where: { needsAttention: true } }),
    ]);

  // Calculate status counts
  const counts = {
    all: 0,
    pending: 0,
    confirmed: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
  };
  statusCounts.forEach((item) => {
    counts.all += item._count.status;
    if (
      ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"].includes(
        item.status,
      )
    ) {
      counts.pending += item._count.status;
    } else if (item.status === "CONFIRMED")
      counts.confirmed = item._count.status;
    else if (item.status === "IN_PROGRESS")
      counts.inProgress = item._count.status;
    else if (item.status === "COMPLETED") counts.completed = item._count.status;
    else if (item.status === "CANCELLED") counts.cancelled = item._count.status;
  });

  // "Needs action" — bookings genuinely waiting on admin, not the
  // broader Pending-tab grouping. The Pending tab also catches
  // bookings that are already offered to a vendor and just awaiting
  // *that vendor's* response, which is not admin work. Two genuine
  // admin-owed states:
  //   (a) status = PENDING — booking has never been offered, admin
  //       owes the initial dispatch decision.
  //   (b) status = ASSIGNMENT_OFFERED/RE_OFFERED with NO live PENDING
  //       offer row — stale state where the cascade failed to seat
  //       a new offer after a rejection. Admin needs to step in and
  //       reassign manually.
  // Mirrors the vendor portal's "New Requests" badge — count only
  // truly actionable items, never the passive in-flight rows.
  const needsActionCount = await prisma.booking.count({
    where: {
      OR: [
        { status: "PENDING" },
        {
          status: { in: ["ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"] },
          assignmentOffers: { none: { status: "PENDING" } },
        },
      ],
    },
  });
  (counts as any).needsAction = needsActionCount;

  const formattedBookings = bookings.map((booking) => ({
    id: booking.id,
    bookingRef: booking.bookingRef,
    customer: {
      name: booking.customer?.name || booking.guestName || "Guest",
      email: booking.customer?.email || booking.guestEmail,
      phone: booking.customer?.phone || booking.guestPhone,
    },
    partner: booking.partner
      ? { id: booking.partner.id, companyName: booking.partner.companyName }
      : null,
    isPartnerBooking: !!booking.partner,
    source: booking.source,
    route: { pickup: booking.pickupAddress, dropoff: booking.dropoffAddress },
    tripDate: booking.tripDate,
    tripTime: booking.tripTime,
    createdAt: booking.createdAt,
    vendor: booking.vendor
      ? { id: booking.vendor.id, companyName: booking.vendor.companyName }
      : null,
    vendorStatus: getVendorStatusDisplay(booking),
    status: booking.status,
    statusDisplay: formatStatusForUI(booking.status),
    amount: booking.totalPrice,
    vehicleClass: booking.vehicleClass,
    // Trip-type fields. Mirrors the partner portal's booking list
    // payload exactly so the same visual treatment ports across:
    // violet HOURLY chip with hours/duration, teal ONE_WAY chip,
    // sky CITY chip for HOURLY. The Route cell in the table also
    // branches on tripType (pickup-only for HOURLY since there's
    // no fixed drop-off).
    tripType: booking.tripType,
    hours: booking.hours,
    hourlyDuration: (booking as any).hourlyDuration || null,
    city: booking.city,
    isUnread: !booking.isReadByAdmin,
    needsAttention: booking.needsAttention,
    attentionReason: booking.attentionReason,
    highlightType: booking.needsAttention
      ? "attention"
      : !booking.isReadByAdmin
        ? "unread"
        : "normal",
  }));

  res.json({
    success: true,
    data: {
      bookings: formattedBookings,
      counts,
      alerts: { unreadCount, attentionCount },
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    },
  });
});

/**
 * Get single booking - marks as read
 */
export const getBooking = asyncWrapper(async (req: Request, res: Response) => {
  const { id } = req.params;

  await prisma.booking.update({ where: { id }, data: { isReadByAdmin: true } });

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          loyaltyTier: true,
        },
      },
      partner: { select: { id: true, companyName: true } },
      vendor: { select: { id: true, companyName: true, rating: true } },
      vehicle: {
        select: {
          id: true,
          make: true,
          model: true,
          plateNumber: true,
          category: true,
          color: true,
        },
      },
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          rating: true,
        },
      },
    },
  });

  if (!booking) throw new NotFoundError("Booking");

  // Stage 2 dropped Booking.rejectionReasons; the rejection chain now
  // lives on BookingAssignmentOffer with one row per offer attempt.
  // We rebuild the legacy `rejectionReasons` array here so the helpers
  // buildVendorAssignment + buildStatusTimeline keep working without
  // a structural rewrite (Stage 3B will move helpers to consume offers
  // directly).
  const rejectedOffers = await prisma.bookingAssignmentOffer.findMany({
    where: { bookingId: booking.id, status: "REJECTED" },
    include: {
      vendor: { select: { id: true, companyName: true } },
    },
    orderBy: { respondedAt: "asc" },
  });
  const rejectionReasons = rejectedOffers.map((o: any) => ({
    vendorId: o.vendorId,
    vendorCompanyName: o.vendor?.companyName,
    reason: o.rejectionReason,
    rejectedAt: o.respondedAt,
    attemptNumber: o.attemptNumber,
  }));

  // Active pending offer — the single source of truth about whether
  // an offer is currently outstanding. We query unconditionally
  // (NOT gated on booking.status) because booking.status/vendorId can
  // desync from the offer table in practice:
  //   - the vendor reject endpoint does the booking-clearing update
  //     and the cascade in separate operations (not one transaction),
  //     so a crash between them can leave an orphan;
  //   - manual DB intervention from older bug-fix scripts can leave
  //     bookings with cleared vendorId but live offers;
  //   - any future state-machine path that forgets to keep the two
  //     tables in sync.
  // Whatever the cause, if a PENDING offer row exists, the booking
  // IS awaiting a response — that's what matters. The vendor relation
  // is included so the helper can identify who holds the offer even
  // when booking.vendorId was cleared.
  const activeOffer = await prisma.bookingAssignmentOffer.findFirst({
    where: { bookingId: booking.id, status: "PENDING" },
    orderBy: { offeredAt: "desc" },
    include: {
      vendor: { select: { id: true, companyName: true } },
    },
  });

  const vendorAssignment = buildVendorAssignment(
    booking,
    rejectionReasons,
    activeOffer,
  );

  const timeline = buildStatusTimeline(booking, rejectionReasons);

  // For the "available vendors" pool we use the exact same eligibility
  // function the assign-vendor endpoint uses (findEligibleVendors). The
  // previous code here ran a loose Prisma count that only checked
  // status=APPROVED + has-some-vehicle-in-category, while the actual
  // listing endpoint also enforces profile-doc expiry, vehicle-doc
  // expiry, driver-doc expiry, and APPROVED status on both vehicles and
  // drivers. That produced a confusing UX where the "Load Available
  // Vendors (N)" button advertised N candidates but clicking it
  // returned an empty list (admin loops back to the same button with
  // no feedback). One source of truth now: this count is the length
  // of what the list endpoint will actually return.
  const eligibleForCount = await findEligibleVendors(booking.id);
  const availableVendorsCount = eligibleForCount.length;

  res.json({
    success: true,
    data: {
      id: booking.id,
      bookingRef: booking.bookingRef,
      status: booking.status,
      statusDisplay: formatStatusForUI(booking.status),
      customer: {
        name: booking.customer?.name || booking.guestName || "Guest",
        email: booking.customer?.email || booking.guestEmail,
        phone: booking.customer?.phone || booking.guestPhone,
      },
      partner: booking.partner,
      isPartnerBooking: !!booking.partner,
      pickup: booking.pickupAddress,
      dropoff: booking.dropoffAddress,
      tripDate: booking.tripDate,
      tripTime: booking.tripTime,
      vehicleClass: booking.vehicleClass,
      vehicleClassDisplay: formatVehicleClass(booking.vehicleClass),
      passengers: booking.passengers,
      // Trip-type fields — power the Service Window / Trip Route
      // cards, the Service Day timeline, and the static map on the
      // detail panel. Ported from the partner portal so admin and
      // partner see the same booking the same way.
      tripType: booking.tripType,
      hours: booking.hours,
      hourlyDuration: (booking as any).hourlyDuration || null,
      city: booking.city,
      // Geolocation. Both pickup and drop-off lat/lng are stored as
      // optional Decimal columns; cast to Number for JSON. Drop-off
      // is irrelevant for HOURLY (no fixed destination) but we send
      // it regardless and let the frontend ignore based on tripType.
      pickupLat: booking.pickupLat ? Number(booking.pickupLat) : null,
      pickupLng: booking.pickupLng ? Number(booking.pickupLng) : null,
      dropoffLat: booking.dropoffLat ? Number(booking.dropoffLat) : null,
      dropoffLng: booking.dropoffLng ? Number(booking.dropoffLng) : null,
      flightNumber: booking.flightNumber || null,
      terminalNo: (booking as any).terminalNo || null,
      vendorAssignment,
      availableVendors: {
        count: availableVendorsCount,
        rejectedCount: rejectionReasons.length,
      },
      actions: {
        // Admin can re-assign whenever there's no current vendor
        // committed (no vendorId set) or the booking is still in an
        // offer state. Under new model VENDOR_REJECTED is gone; the
        // equivalent "needs reassignment" state is being in
        // ASSIGNMENT_OFFERED/ASSIGNMENT_RE_OFFERED with no live
        // pending offer (all current offers REJECTED).
        canAssignVendor:
          !booking.vendorId ||
          booking.status === "ASSIGNMENT_OFFERED" ||
          booking.status === "ASSIGNMENT_RE_OFFERED",
        canCancel: !["COMPLETED", "CANCELLED", "IN_PROGRESS"].includes(
          booking.status,
        ),
        // "Needs reassignment" means admin owes action — vendor is
        // not committed and no live offer is in flight either. Two
        // ways this happens:
        //   (a) booking is in ASSIGNMENT_OFFERED/RE_OFFERED state
        //       BUT no PENDING offer row exists (stale state — the
        //       cascade failed, or the offer was rejected and the
        //       cascade-to-next-vendor never created a new one).
        //   (b) booking is in PENDING after a rejection (rejection
        //       history exists, no live offer).
        // The presence of `activeOffer` is the canonical "live
        // offer" check. Previously this flag was set whenever the
        // booking was in offer state — which incorrectly flagged
        // every freshly-assigned booking as "needs reassignment"
        // the instant admin clicked Assign Vendor, since admin sees
        // ASSIGNMENT_OFFERED right away. Now: only fire when the
        // offer state has actually gone stale.
        needsReassignment:
          ((booking.status === "ASSIGNMENT_OFFERED" ||
            booking.status === "ASSIGNMENT_RE_OFFERED") &&
            !activeOffer) ||
          (booking.status === "PENDING" && rejectionReasons.length > 0),
      },
      timeline,
      totalAmount: booking.totalPrice,
      pricing: {
        basePrice: booking.basePrice,
        peakMultiplier: booking.peakMultiplier,
        vatAmount: booking.vatAmount,
        totalPrice: booking.totalPrice,
      },
      createdAt: booking.createdAt,
      confirmedAt: booking.confirmedAt,
      completedAt: booking.completedAt,
    },
  });
});

/**
 * Get booking statistics
 */
export const getBookingStats = asyncWrapper(
  async (req: Request, res: Response) => {
    const [statusCounts, sourceCounts] = await Promise.all([
      prisma.booking.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.booking.groupBy({ by: ["source"], _count: { source: true } }),
    ]);

    const stats = {
      byStatus: {
        all: 0,
        pending: 0,
        confirmed: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
      },
      bySource: { all: 0, direct: 0, partner: 0 },
    };

    statusCounts.forEach((item) => {
      stats.byStatus.all += item._count.status;
      if (
        ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"].includes(
          item.status,
        )
      ) {
        stats.byStatus.pending += item._count.status;
      } else if (item.status === "CONFIRMED")
        stats.byStatus.confirmed = item._count.status;
      else if (item.status === "IN_PROGRESS")
        stats.byStatus.inProgress = item._count.status;
      else if (item.status === "COMPLETED")
        stats.byStatus.completed = item._count.status;
      else if (item.status === "CANCELLED")
        stats.byStatus.cancelled = item._count.status;
    });

    sourceCounts.forEach((item) => {
      stats.bySource.all += item._count.source;
      if (item.source === "DIRECT") stats.bySource.direct = item._count.source;
      else if (item.source === "PARTNER")
        stats.bySource.partner = item._count.source;
    });

    res.json({ success: true, data: stats });
  },
);

/**
 * Resolve attention flag
 */
export const resolveAttention = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundError("Booking");

    await prisma.booking.update({
      where: { id },
      data: { needsAttention: false, attentionReason: null, attentionAt: null },
    });

    res.json({ success: true, message: "Attention resolved" });
  },
);

/**
 * Mark bookings as read
 */
export const markAsRead = asyncWrapper(async (req: Request, res: Response) => {
  const { bookingIds } = req.body;
  if (!bookingIds || !Array.isArray(bookingIds)) {
    throw new BadRequestError("bookingIds array is required");
  }

  await prisma.booking.updateMany({
    where: { id: { in: bookingIds } },
    data: { isReadByAdmin: true },
  });

  res.json({
    success: true,
    message: `${bookingIds.length} bookings marked as read`,
  });
});

/**
 * Mark all bookings as read
 */
export const markAllAsRead = asyncWrapper(
  async (req: Request, res: Response) => {
    const result = await prisma.booking.updateMany({
      where: { isReadByAdmin: false },
      data: { isReadByAdmin: true },
    });

    res.json({
      success: true,
      message: `${result.count} bookings marked as read`,
    });
  },
);

/**
 * Get available vendors for assignment
 *
 * Returns vendors who pass the full eligibility filter:
 *   - status APPROVED
 *   - profile docs valid through trip date
 *   - has at least one matching-category vehicle with valid docs
 *   - has at least one driver with valid docs
 *   - hasn't already rejected this booking
 *
 * Sorted by total completed bookings desc (tie: createdAt asc).
 * Auto-cascade in vendor reject paths uses the same helper so admin
 * sees the same prioritization the system would apply.
 */
export const getAvailableVendors = asyncWrapper(
  async (req: Request, res: Response) => {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, vehicleClass: true, tripDate: true, tripTime: true },
    });
    if (!booking) throw new NotFoundError("Booking");

    const eligible = await findEligibleVendors(bookingId);

    const rejectedOffers = await prisma.bookingAssignmentOffer.findMany({
      where: { bookingId, status: "REJECTED" },
      include: { vendor: { select: { id: true, companyName: true } } },
      orderBy: { respondedAt: "asc" },
    });

    res.json({
      success: true,
      data: {
        available: eligible.map((v) => ({
          id: v.id,
          companyName: v.companyName,
          rating: v.rating,
          completedBookingsCount: v.completedBookingsCount,
          vehicleCount: v.vehicleCount,
          driverCount: v.driverCount,
          displayText: `${v.companyName} — ${v.completedBookingsCount} completed bookings (${v.vehicleCount} vehicles, ${v.driverCount} drivers)`,
        })),
        rejected: rejectedOffers.map((o) => ({
          id: o.vendorId,
          companyName: o.vendor?.companyName ?? "Unknown",
          reason: o.rejectionReason,
          attemptNumber: o.attemptNumber,
          rejectedAt: o.respondedAt,
        })),
        summary: {
          availableCount: eligible.length,
          rejectedCount: rejectedOffers.length,
        },
      },
    });
  },
);

/**
 * Assign vendor to booking
 */
/**
 * Assign vendor to booking
 *
 * Required body: { vendorId, payoutAmount }
 * Optional body: { vehicleId, driverId } — admin can pre-suggest a
 *                vehicle/driver, but vendor still owns final allocation
 *                on accept.
 *
 * Behavior:
 *   - Validates vendor passes the eligibility filter (status APPROVED,
 *     hasn't already rejected this booking).
 *   - Validates payoutAmount is a positive number (warning shown
 *     client-side if it exceeds partner price, but server allows it).
 *   - Creates a BookingAssignmentOffer row at attemptNumber=1 in PENDING.
 *     This is the canonical record of "we offered vendor X this price";
 *     accepted/rejected response is recorded on the same row.
 *   - Sets booking status to ASSIGNMENT_OFFERED + denormalizes the
 *     amount to Booking.vendorPayoutAmount for fast-read by aggregations.
 *   - Fires BOOKING_OFFER_RECEIVED notification to vendor.
 *
 * Doc-expiry pre-validation on suggested vehicle/driver is kept (still
 * useful as defense even though vendor owns final allocation), but it
 * doesn't gate the offer — it raises a 400 with a clear message so
 * admin picks a different vehicle/driver before offering.
 */
export const assignVendor = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { vendorId, vehicleId, driverId, payoutAmount } = req.body;

    if (!vendorId) throw new BadRequestError("Vendor ID is required");
    if (payoutAmount === undefined || payoutAmount === null) {
      throw new BadRequestError("payoutAmount is required");
    }
    const payoutNum = Number(payoutAmount);
    if (!Number.isFinite(payoutNum) || payoutNum <= 0) {
      throw new BadRequestError("payoutAmount must be a positive number");
    }

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundError("Booking");

    // Booking must be in an offer-eligible state. CONFIRMED/IN_PROGRESS/
    // COMPLETED/CANCELLED are terminal-ish — assignment is over.
    if (
      !["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"].includes(
        booking.status,
      )
    ) {
      throw new BadRequestError(
        `Cannot offer booking in status "${booking.status}". Must be PENDING / ASSIGNMENT_OFFERED / ASSIGNMENT_RE_OFFERED.`,
      );
    }

    // This vendor must not have already rejected this booking. The
    // PRICE_TOO_LOW re-offer flow is handled by reOfferBooking below.
    const priorRejection = await prisma.bookingAssignmentOffer.findFirst({
      where: { bookingId: id, vendorId, status: "REJECTED" },
    });
    if (priorRejection) {
      throw new BadRequestError(
        "This vendor has already rejected this booking. Use the re-offer endpoint if the rejection reason was price.",
      );
    }

    // Outstanding-offer handling — supports override semantics.
    //   • If the existing PENDING offer is to the SAME vendor admin is
    //     trying to (re)assign — refuse with a clear error. That's a
    //     no-op or accidental double-click; the unique constraint on
    //     (bookingId, vendorId, attemptNumber) would catch it anyway.
    //   • If it's to a DIFFERENT vendor — admin is overriding. Mark
    //     the previous offer REJECTED and create the new one in a
    //     single transaction below. Vendor X gets a notification that
    //     their offer was withdrawn; Vendor Y gets the standard
    //     new-offer notification.
    // The "Override" framing in the frontend (`Override — pick a
    // different vendor (revokes the current offer)`) is now backed
    // by real backend behaviour. Previously this branch threw, which
    // contradicted the UI promise.
    const existingPending = await prisma.bookingAssignmentOffer.findFirst({
      where: { bookingId: id, status: "PENDING" },
      include: {
        vendor: { select: { id: true, companyName: true, userId: true } },
      },
    });
    if (existingPending && existingPending.vendorId === vendorId) {
      throw new BadRequestError(
        `Booking is already offered to ${existingPending.vendor?.companyName ?? "this vendor"}. Wait for their response.`,
      );
    }
    const isOverride = !!existingPending;
    const displacedVendorId = existingPending?.vendorId ?? null;
    const displacedVendorUserId = existingPending?.vendor?.userId ?? null;
    const displacedVendorName = existingPending?.vendor?.companyName ?? null;

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundError("Vendor");
    if (vendor.status !== "APPROVED")
      throw new BadRequestError("Vendor is not approved");

    // Doc-expiry pre-validation on suggested vehicle/driver. Keeps admin
    // from offering a booking with a stale pre-suggestion.
    if (vehicleId) {
      const expiring = await prisma.vehicleDocument.findMany({
        where: { vehicleId, expiryDate: { lte: booking.tripDate } },
        select: { type: true, expiryDate: true },
      });
      if (expiring.length > 0) {
        const list = expiring
          .map(
            (d) =>
              `${d.type} (expires ${d.expiryDate!.toISOString().split("T")[0]})`,
          )
          .join(", ");
        throw new BadRequestError(
          `Cannot assign this vehicle. Document(s) expire on or before the trip date: ${list}`,
        );
      }
    }
    if (driverId) {
      const expiring = await prisma.driverDocument.findMany({
        where: { driverId, expiryDate: { lte: booking.tripDate } },
        select: { type: true, expiryDate: true },
      });
      if (expiring.length > 0) {
        const list = expiring
          .map(
            (d) =>
              `${d.type} (expires ${d.expiryDate!.toISOString().split("T")[0]})`,
          )
          .join(", ");
        throw new BadRequestError(
          `Cannot assign this driver. Document(s) expire on or before the trip date: ${list}`,
        );
      }
    }

    // Create offer row + transition booking + (when overriding) close
    // the previously-outstanding offer — all in one transaction so we
    // never leave the booking in an inconsistent state.
    //
    // When `isOverride`, we mark the displaced offer REJECTED with
    // reason CAR_DRIVER_UNAVAILABLE. None of the three current enum
    // values exactly captures "admin withdrew the offer", but
    // CAR_DRIVER_UNAVAILABLE is the closest pragmatic match (admin
    // determined the previous vendor wasn't going to fulfill). The
    // audit log entry below preserves the truth of WHO closed the
    // offer (admin, not vendor). A future schema migration could add
    // a WITHDRAWN_BY_ADMIN status or rejection reason for cleaner
    // audit fidelity; tracked separately.
    const txOps: any[] = [];
    if (isOverride && existingPending) {
      txOps.push(
        prisma.bookingAssignmentOffer.update({
          where: { id: existingPending.id },
          data: {
            status: "REJECTED",
            rejectionReason: "CAR_DRIVER_UNAVAILABLE",
            respondedAt: new Date(),
          },
        }),
      );
    }
    txOps.push(
      prisma.bookingAssignmentOffer.create({
        data: {
          bookingId: id,
          vendorId,
          payoutAmount: payoutNum,
          attemptNumber: 1,
          status: "PENDING",
        },
      }),
    );
    txOps.push(
      prisma.booking.update({
        where: { id },
        data: {
          vendorId,
          vehicleId: vehicleId ?? null,
          driverId: driverId ?? null,
          vendorPayoutAmount: payoutNum,
          status: "ASSIGNMENT_OFFERED",
          needsAttention: false,
          attentionReason: null,
        },
        include: { vendor: { select: { companyName: true } } },
      }),
    );
    const results = await prisma.$transaction(txOps);
    // The new offer is either the second op (override case, after the
    // displaced-offer update) or the first op (fresh case). Booking
    // update is always last.
    const offer = isOverride ? results[1] : results[0];
    const updatedBooking = results[results.length - 1];

    await notifyVendorOfOffer(offer.id);

    // Notify the displaced vendor that admin withdrew their offer.
    // Inlined (rather than going through offer-notifications.ts) since
    // this is an admin-action notification, conceptually distinct from
    // vendor-action notifications that file lives for. If this becomes
    // a pattern (e.g. admin-initiated revokes from other endpoints),
    // promote to a `notifyVendorOfWithdrawal` helper.
    if (isOverride && displacedVendorUserId) {
      try {
        await prisma.notification.create({
          data: {
            userId: displacedVendorUserId,
            title: "Booking Offer Withdrawn",
            message: `The offer for booking ${booking.bookingRef} has been withdrawn by admin and reassigned. You no longer need to respond.`,
            type: "BOOKING_OFFER_WITHDRAWN",
            data: {
              bookingId: id,
              bookingRef: booking.bookingRef,
              reassignedTo: vendorId,
            },
          },
        });
      } catch (err) {
        // Don't fail the override on a notification glitch — admin
        // already committed the swap; vendor will simply not see the
        // proactive message but their UI will still reflect the
        // booking is no longer in their pending-offers list.
        console.error("Failed to notify displaced vendor:", err);
      }
    }

    // Audit log — distinguish a clean assign from an override so
    // dispute resolution can trace decision history. The displaced
    // vendor id is captured for that purpose.
    await prisma.auditLog
      .create({
        data: {
          userId: req.user!.id,
          action: isOverride
            ? "BOOKING_OFFER_OVERRIDDEN_BY_ADMIN"
            : "BOOKING_ASSIGNED_TO_VENDOR",
          entity: "Booking",
          entityId: id,
          changes: {
            bookingRef: booking.bookingRef,
            newVendorId: vendorId,
            payoutAmount: payoutNum,
            ...(isOverride
              ? {
                  displacedVendorId,
                  displacedVendorName,
                  displacedOfferId: existingPending?.id,
                }
              : {}),
          },
        },
      })
      .catch((err) => {
        console.error("Audit log write failed:", err);
      });

    res.json({
      success: true,
      message: isOverride
        ? `Booking reassigned from ${displacedVendorName ?? "previous vendor"} to ${updatedBooking.vendor?.companyName} at SAR ${payoutNum.toFixed(2)}.`
        : `Booking offered to ${updatedBooking.vendor?.companyName} at SAR ${payoutNum.toFixed(2)}`,
      data: {
        id: updatedBooking.id,
        status: updatedBooking.status,
        offerId: offer.id,
        payoutAmount: payoutNum,
        ...(isOverride
          ? { displacedVendorId, displacedOfferId: existingPending?.id }
          : {}),
      },
    });
  },
);

/**
 * Re-offer booking at revised price (PRICE_TOO_LOW second chance).
 *
 * Required body: { payoutAmount }
 *
 * Triggered when vendor rejected with PRICE_TOO_LOW at attempt 1 and
 * the booking is currently in ASSIGNMENT_RE_OFFERED status (admin's
 * action item). Creates a fresh offer row at attemptNumber=2 for the
 * SAME vendor with the new amount, sets booking back to
 * ASSIGNMENT_OFFERED, notifies vendor with the "Updated Price" framing.
 *
 * After attempt 2:
 *   - If vendor accepts → CONFIRMED (normal path).
 *   - If vendor rejects → vendor is out, auto-cascade to next eligible.
 *     The price-re-offer flow is one-shot — no attempt 3 with the
 *     same vendor.
 */
export const reOfferBooking = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { payoutAmount } = req.body;

    if (payoutAmount === undefined || payoutAmount === null) {
      throw new BadRequestError("payoutAmount is required");
    }
    const payoutNum = Number(payoutAmount);
    if (!Number.isFinite(payoutNum) || payoutNum <= 0) {
      throw new BadRequestError("payoutAmount must be a positive number");
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { vendor: { select: { id: true, companyName: true } } },
    });
    if (!booking) throw new NotFoundError("Booking");

    if (booking.status !== "ASSIGNMENT_RE_OFFERED") {
      throw new BadRequestError(
        `Booking is not awaiting a re-offer (status: ${booking.status}). Re-offer is only valid after a PRICE_TOO_LOW rejection at attempt 1.`,
      );
    }
    if (!booking.vendorId) {
      throw new BadRequestError(
        "Re-offer requires a vendor reference on the booking, but vendorId is null.",
      );
    }

    // The re-offer always goes to the SAME vendor that price-rejected at
    // attempt 1. There must be a single attempt-1 REJECTED offer for them
    // with reason PRICE_TOO_LOW; that's the entry condition into RE_OFFERED.
    const priorOffer = await prisma.bookingAssignmentOffer.findFirst({
      where: {
        bookingId: id,
        vendorId: booking.vendorId,
        status: "REJECTED",
        rejectionReason: "PRICE_TOO_LOW",
        attemptNumber: 1,
      },
    });
    if (!priorOffer) {
      throw new BadRequestError(
        "No qualifying prior offer to re-offer against. Expected an attempt-1 PRICE_TOO_LOW rejection from the booking's current vendor.",
      );
    }

    // Create attempt-2 offer + flip booking back to ASSIGNMENT_OFFERED.
    const [offer, updatedBooking] = await prisma.$transaction([
      prisma.bookingAssignmentOffer.create({
        data: {
          bookingId: id,
          vendorId: booking.vendorId,
          payoutAmount: payoutNum,
          attemptNumber: 2,
          status: "PENDING",
        },
      }),
      prisma.booking.update({
        where: { id },
        data: {
          vendorPayoutAmount: payoutNum,
          status: "ASSIGNMENT_OFFERED",
          needsAttention: false,
          attentionReason: null,
        },
        include: { vendor: { select: { companyName: true } } },
      }),
    ]);

    await notifyVendorOfReOffer(offer.id);

    res.json({
      success: true,
      message: `Booking re-offered to ${updatedBooking.vendor?.companyName} at revised SAR ${payoutNum.toFixed(2)}`,
      data: {
        id: updatedBooking.id,
        status: updatedBooking.status,
        offerId: offer.id,
        payoutAmount: payoutNum,
        attemptNumber: 2,
      },
    });
  },
);

/**
 * Update booking status
 */
export const updateBookingStatus = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = [
      "PENDING",
      "ASSIGNMENT_OFFERED",
      "ASSIGNMENT_RE_OFFERED",
      "CONFIRMED",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
    ];
    if (!validStatuses.includes(status)) {
      throw new BadRequestError(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      );
    }

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundError("Booking");

    const updateData: any = { status };
    if (notes) updateData.notes = notes;
    if (status === "CONFIRMED") updateData.confirmedAt = new Date();
    if (status === "COMPLETED") updateData.completedAt = new Date();

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      message: `Status updated to ${formatStatusForUI(status)}`,
      data: updatedBooking,
    });
  },
);

/**
 * Cancel booking
 */
export const cancelBooking = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundError("Booking");

    if (booking.status === "COMPLETED")
      throw new BadRequestError("Cannot cancel completed booking");
    if (booking.status === "CANCELLED")
      throw new BadRequestError("Already cancelled");
    if (booking.status === "IN_PROGRESS")
      throw new BadRequestError("Cannot cancel in-progress booking");

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: "CANCELLED",
        notes: reason ? `Cancelled: ${reason}` : booking.notes,
        needsAttention: false,
      },
    });

    res.json({
      success: true,
      message: "Booking cancelled",
      data: { id: updatedBooking.id },
    });
  },
);

/**
 * Record vendor rejection (admin-driven)
 *
 * Path used when vendor declines via phone/email to admin instead of
 * through the app. Admin records the rejection on the vendor's behalf;
 * the offer flow then proceeds the same way the in-app path does.
 *
 * Required body: { vendorId, reason }
 * `reason` is the OfferRejectionReason enum value:
 *   - CAR_DRIVER_UNAVAILABLE → vendor out, auto-cascade
 *   - UNSUITABLE_ROUTE       → vendor out, auto-cascade
 *   - PRICE_TOO_LOW          → if attempt 1 → ASSIGNMENT_RE_OFFERED;
 *                              if attempt 2 → vendor out, auto-cascade
 *
 * Accepts legacy free-text reasons by mapping common substrings
 * ("price"/"route") to the enum — kept for backwards compat until the
 * frontend is updated. New callers should pass the enum directly.
 */
export const recordVendorRejection = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { vendorId, reason } = req.body;

    if (!vendorId || !reason)
      throw new BadRequestError("Vendor ID and reason required");

    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundError("Booking");

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, companyName: true },
    });
    if (!vendor) throw new NotFoundError("Vendor");

    // Normalize reason — accept either an enum value or legacy free-text.
    const VALID_REASONS = [
      "CAR_DRIVER_UNAVAILABLE",
      "PRICE_TOO_LOW",
      "UNSUITABLE_ROUTE",
    ] as const;
    type RejectReason = (typeof VALID_REASONS)[number];
    let mappedReason: RejectReason;
    if ((VALID_REASONS as readonly string[]).includes(reason)) {
      mappedReason = reason as RejectReason;
    } else {
      const reasonLower = String(reason).toLowerCase();
      if (reasonLower.includes("price")) mappedReason = "PRICE_TOO_LOW";
      else if (reasonLower.includes("route")) mappedReason = "UNSUITABLE_ROUTE";
      else mappedReason = "CAR_DRIVER_UNAVAILABLE";
    }

    // Find the offer row this rejection responds to. Admin's offer must
    // have created a PENDING row first (assignVendor or reOfferBooking),
    // so we flip that row rather than create a new one.
    const pendingOffer = await prisma.bookingAssignmentOffer.findFirst({
      where: { bookingId: id, vendorId, status: "PENDING" },
    });

    // If no PENDING offer exists (e.g. admin is recording a rejection
    // they got out-of-band before any in-app offer was created), we
    // create a standalone REJECTED row at attempt 1 so the audit trail
    // captures the event. This is a corner case but worth supporting.
    if (!pendingOffer) {
      const priorAttempts = await prisma.bookingAssignmentOffer.count({
        where: { bookingId: id, vendorId },
      });
      await prisma.bookingAssignmentOffer.create({
        data: {
          bookingId: id,
          vendorId,
          payoutAmount: booking.vendorPayoutAmount ?? 0,
          attemptNumber: priorAttempts + 1,
          status: "REJECTED",
          rejectionReason: mappedReason,
          respondedAt: new Date(),
        },
      });
    } else {
      await prisma.bookingAssignmentOffer.update({
        where: { id: pendingOffer.id },
        data: {
          status: "REJECTED",
          rejectionReason: mappedReason,
          respondedAt: new Date(),
        },
      });
    }

    // Decide next state. Same branching as the vendor reject endpoint
    // so admin-driven and vendor-driven rejections behave identically.
    const wasPriceAtAttempt1 =
      mappedReason === "PRICE_TOO_LOW" &&
      (pendingOffer?.attemptNumber ?? 1) === 1;

    if (wasPriceAtAttempt1) {
      // Wait for admin to enter a revised price via reOfferBooking.
      // Keep vendor reference on booking so reOfferBooking can find it.
      const updated = await prisma.booking.update({
        where: { id },
        data: {
          status: "ASSIGNMENT_RE_OFFERED",
          needsAttention: true,
          attentionReason: `Vendor ${vendor.companyName} requested higher price — enter revised payout`,
          attentionAt: new Date(),
          isReadByAdmin: false,
        },
      });
      res.json({
        success: true,
        message: "Vendor rejection recorded. Admin must enter a revised price.",
        data: {
          id: updated.id,
          status: updated.status,
          nextAction: "RE_OFFER",
        },
      });
      return;
    }

    // Other reasons (or PRICE_TOO_LOW on attempt 2) → vendor is out.
    // Clear them from the booking and cascade to the next eligible vendor.
    await prisma.booking.update({
      where: { id },
      data: {
        status: "PENDING",
        vendorId: null,
        vehicleId: null,
        driverId: null,
        vendorPayoutAmount: null,
        needsAttention: false,
        attentionReason: null,
      },
    });

    const { cascadeToNextVendor } = await import("../../lib/offer-cascade");
    const cascadeResult = await cascadeToNextVendor(id, {
      payoutAmount: Number(booking.vendorPayoutAmount ?? 0) || 0,
    });

    if (cascadeResult) {
      res.json({
        success: true,
        message: "Vendor rejection recorded. Cascaded to next eligible vendor.",
        data: {
          id,
          nextAction: "CASCADED",
          newVendorId: cascadeResult.vendorId,
          newOfferId: cascadeResult.offerId,
        },
      });
    } else {
      res.json({
        success: true,
        message:
          "Vendor rejection recorded. No eligible vendors remain — booking cancelled.",
        data: { id, nextAction: "CANCELLED" },
      });
    }
  },
);

// ============== DOWNLOAD PURCHASE ORDER PDF ==============
//
// Admin can download a PO for any booking, regardless of whether it
// came in via the partner portal or directly from a customer. The PO
// itself is identical to the one a partner downloads for their own
// booking — same template, same trip-type branching, same pricing
// breakdown — generated by the shared `buildPOHtml` helper. The only
// difference is that direct customer bookings have no Partner
// Information section: that block is omitted entirely and the PO
// header carries a small "Direct customer" source tag instead.

export const downloadBookingPO = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true },
        },
        partner: true,
        vendor: {
          select: {
            id: true,
            companyName: true,
            crNumber: true,
            vatNumber: true,
            contactPerson: true,
            contactPhone: true,
            address: true,
          },
        },
        driver: { select: { firstName: true, lastName: true, phone: true } },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            plateNumber: true,
            color: true,
          },
        },
      },
    });

    if (!booking) throw new NotFoundError("Booking");

    const poHtml = buildPOHtml(booking, booking.partner, "admin");

    res.json({
      success: true,
      data: {
        bookingRef: booking.bookingRef,
        html: poHtml,
        meta: {
          fileName: `PO-${booking.bookingRef}.pdf`,
          title: `Purchase Order — ${booking.bookingRef}`,
          partner: booking.partner?.companyName || "Direct customer",
          date: new Date().toISOString(),
        },
      },
    });
  },
);
