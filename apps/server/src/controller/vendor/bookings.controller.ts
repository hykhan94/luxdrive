// ============================================
// apps/server/src/controller/vendor/bookings.controller.ts
// Vendor Portal — Bookings Section
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { requireOperational, requireApprovedAndDocsValid } from "./_shared";

// ============== GCS (for signed photo URLs) ==============
// Driver photoUrl in the DB is the raw GCS path (e.g. "drivers/abc/photo.jpg").
// The browser cannot fetch that directly — we have to mint a signed read URL.
// Mirrors the helper in dashboard.controller.ts.

// ============== HELPERS ==============

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true, status: true, companyName: true },
  });
  if (!vendor) throw new NotFoundError("Vendor profile");
  return vendor;
}

// Status labels for vendor-facing display.
//
// Under the new model the vendor sees a booking only while they have
// an outstanding offer (ASSIGNMENT_OFFERED / ASSIGNMENT_RE_OFFERED —
// both shown as "New Request") or once they've accepted it (CONFIRMED
// onward). They never see a "rejected by you" state on the booking
// itself because the booking moves on to the next vendor after they
// decline — the rejection record lives on BookingAssignmentOffer.
const STATUS_LABELS: Record<string, string> = {
  ASSIGNMENT_OFFERED: "New Request",
  ASSIGNMENT_RE_OFFERED: "New Request",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  PENDING: "Pending Admin",
};

// Status timeline steps for vendor view
const VENDOR_STATUS_TIMELINE = [
  {
    key: "ASSIGNMENT_OFFERED",
    label: "Request Received",
    description: "Booking assigned by admin",
  },
  {
    key: "CONFIRMED",
    label: "Accepted",
    description: "You accepted and assigned driver & vehicle",
  },
  {
    key: "IN_PROGRESS",
    label: "Trip Started",
    description: "Driver has started the trip",
  },
  {
    key: "COMPLETED",
    label: "Completed",
    description: "Trip completed successfully",
  },
];

function buildVendorStatusTimeline(currentStatus: string, booking: any) {
  if (currentStatus === "CANCELLED") {
    return [
      {
        key: "ASSIGNMENT_OFFERED",
        label: "Request Received",
        status: "completed",
        timestamp: booking.createdAt,
      },
      {
        key: "CANCELLED",
        label: "Cancelled",
        status: "current",
        timestamp: booking.updatedAt,
        description: "Booking was cancelled",
      },
    ];
  }

  // Treat both offer states equivalently for the timeline — vendor's
  // view doesn't differentiate first-offer vs price-revised re-offer.
  const normalizedCurrent =
    currentStatus === "ASSIGNMENT_RE_OFFERED"
      ? "ASSIGNMENT_OFFERED"
      : currentStatus;

  const statusOrder = [
    "ASSIGNMENT_OFFERED",
    "CONFIRMED",
    "IN_PROGRESS",
    "COMPLETED",
  ];
  const currentIndex = statusOrder.indexOf(normalizedCurrent);

  return VENDOR_STATUS_TIMELINE.map((step, i) => {
    let stepStatus: "completed" | "current" | "upcoming";
    let timestamp: Date | null = null;

    if (i < currentIndex) {
      stepStatus = "completed";
      if (step.key === "ASSIGNMENT_OFFERED") timestamp = booking.createdAt;
      if (step.key === "CONFIRMED") timestamp = booking.confirmedAt;
    } else if (i === currentIndex) {
      stepStatus = "current";
      if (step.key === "ASSIGNMENT_OFFERED") timestamp = booking.createdAt;
      if (step.key === "CONFIRMED") timestamp = booking.confirmedAt;
      if (step.key === "IN_PROGRESS") timestamp = booking.updatedAt;
      if (step.key === "COMPLETED") timestamp = booking.completedAt;
    } else {
      stepStatus = "upcoming";
    }

    return {
      key: step.key,
      label: step.label,
      description: step.description,
      status: stepStatus,
      timestamp,
    };
  });
}

// ============== BOOKINGS LIST WITH TABS ==============

/**
 * GET /api/v1/vendor/bookings
 *
 * Tabs: new_requests, active, completed, cancelled, all
 * - new_requests: AWAITING_VENDOR (need vendor action)
 * - active: CONFIRMED + IN_PROGRESS
 * - completed: COMPLETED
 * - cancelled: VENDOR_REJECTED + CANCELLED
 * - all: everything assigned to this vendor
 *
 * Supports: search (bookingRef, guestName), date range filter, pagination
 */
export const getBookingsList = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const {
      page = "1",
      limit = "10",
      tab = "all",
      search,
      startDate,
      endDate,
      dateFrom,
      dateTo,
    } = req.query;

    // Frontend historically sends both shapes — accept either. `dateFrom`/`dateTo` is what
    // the bookings page UI uses; `startDate`/`endDate` is the canonical API name. They mean
    // the same thing; canonicalize here.
    const resolvedStartDate = (startDate || dateFrom) as string | undefined;
    const resolvedEndDate = (endDate || dateTo) as string | undefined;

    const where: any = { vendorId: vendor.id };

    // Tab filters
    const now = new Date();
    switch (tab) {
      case "new_requests":
        where.status = { in: ["ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"] };
        break;
      case "active":
        where.status = { in: ["CONFIRMED", "IN_PROGRESS"] };
        break;
      case "completed":
        where.status = "COMPLETED";
        break;
      case "cancelled":
        where.status = "CANCELLED";
        break;
      case "all":
      default:
        break;
    }

    // Search
    if (search) {
      const s = search as string;
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { bookingRef: { contains: s, mode: "insensitive" } },
            { guestName: { contains: s, mode: "insensitive" } },
            { guestPhone: { contains: s, mode: "insensitive" } },
            { route: { contains: s, mode: "insensitive" } },
          ],
        },
      ];
    }

    // Date range filter — mirrors the partner backend pattern that's known to work.
    // Plain `new Date(yyyy-mm-dd)` produces UTC midnight for that day. Bookings are stored
    // with tripDate at UTC midnight for the booking date, so an inclusive [gte, lte] range
    // with both bounds equal to that midnight correctly matches the single-day case.
    if (resolvedStartDate || resolvedEndDate) {
      const dateFilter: any = {};
      if (resolvedStartDate) dateFilter.gte = new Date(resolvedStartDate);
      if (resolvedEndDate) dateFilter.lte = new Date(resolvedEndDate);
      if (where.tripDate) {
        where.AND = [...(where.AND || []), { tripDate: dateFilter }];
      } else {
        where.tripDate = dateFilter;
      }
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: [
          // New requests first by creation date, others by trip date
          ...(tab === "new_requests"
            ? [{ createdAt: "desc" as const }]
            : [{ tripDate: "desc" as const }, { createdAt: "desc" as const }]),
        ],
        select: {
          id: true,
          bookingRef: true,
          guestName: true,
          guestPhone: true,
          route: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripType: true,
          tripDate: true,
          tripTime: true,
          hours: true,
          hourlyDuration: true,
          city: true,
          vehicleClass: true,
          passengers: true,
          basePrice: true,
          vatAmount: true,
          totalPrice: true,
          // Stage 3B-1: denormalized payout amount admin agreed with
          // this vendor for the booking. Stage 7 surfaces this to the
          // frontend so the vendor sees what they're being paid
          // instead of the partner-facing totalPrice. The legacy
          // basePrice/vatAmount/totalPrice fields are kept in the
          // response for backwards-compat with older clients; planned
          // removal once all vendors are on a build that prefers
          // vendorPayoutAmount.
          vendorPayoutAmount: true,
          status: true,
          // source / partner intentionally not selected — vendor-facing
          // responses don't carry booking-origin attribution. See list
          // mapping below for the longer rationale.
          createdAt: true,
          driver: { select: { id: true, firstName: true, lastName: true } },
          vehicle: {
            select: { id: true, make: true, model: true, plateNumber: true },
          },
          // Latest offer between this booking and the current vendor.
          // Used downstream to distinguish ASSIGNMENT_RE_OFFERED's two
          // sub-states from the vendor's perspective:
          //   - latest offer PENDING  → admin has revised and re-offered,
          //                             vendor sees "Revised Offer" (actionable)
          //   - latest offer REJECTED → vendor declined for price and is
          //                             waiting for admin's revision,
          //                             vendor sees "Awaiting Revised Offer"
          // Booking-level status alone (ASSIGNMENT_RE_OFFERED) is the
          // same for both sub-states, so without this we were mislabelling
          // the just-rejected case as "New Request".
          assignmentOffers: {
            where: { vendorId: vendor.id },
            orderBy: { attemptNumber: "desc" },
            take: 1,
            select: { status: true, attemptNumber: true },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    const formattedBookings = bookings.map((b) => {
      // Refined status label for the two ASSIGNMENT_RE_OFFERED
      // sub-states. ASSIGNMENT_OFFERED is unambiguous — vendor has a
      // fresh offer awaiting their response. ASSIGNMENT_RE_OFFERED
      // splits in two: admin has just sent a revised offer (latest
      // offer PENDING) vs vendor just rejected and is waiting for
      // admin to revise (latest offer REJECTED). The base STATUS_LABELS
      // map can't distinguish these because the booking-level status is
      // the same; only the offer row reveals which sub-state we're in.
      const latestOffer = b.assignmentOffers[0]; // ordered attemptNumber desc, may be undefined
      let statusLabel: string;
      if (
        b.status === "ASSIGNMENT_RE_OFFERED" &&
        latestOffer?.status === "REJECTED"
      ) {
        statusLabel = "Awaiting Revised Offer";
      } else if (
        b.status === "ASSIGNMENT_RE_OFFERED" &&
        latestOffer?.status === "PENDING"
      ) {
        // Could read "New Request" here for parity with first-time
        // offers, but flagging it as revised gives vendor the context
        // that they previously declined this same booking for price.
        statusLabel = "Revised Offer";
      } else {
        statusLabel = STATUS_LABELS[b.status] || b.status;
      }

      return {
        id: b.id,
        bookingRef: b.bookingRef,
        guestName: b.guestName || "—",
        guestPhone: b.guestPhone || "—",
        route: b.route || `${b.pickupAddress} → ${b.dropoffAddress}`,
        pickupAddress: b.pickupAddress,
        dropoffAddress: b.dropoffAddress,
        tripType: b.tripType,
        tripTypeLabel: b.tripType === "ONE_WAY" ? "One Way" : "By the Hour",
        tripDate: b.tripDate,
        tripTime: b.tripTime,
        hours: b.hours,
        hourlyDuration: b.hourlyDuration,
        city: b.city,
        vehicleClass: b.vehicleClass,
        passengers: b.passengers,
        basePrice: Number(b.basePrice),
        vatAmount: Number(b.vatAmount),
        totalPrice: Number(b.totalPrice),
        // Null when admin hasn't offered yet (PENDING booking with no
        // BookingAssignmentOffer row), or when the booking pre-dates
        // Stage 2 schema changes. Frontend handles either case by
        // falling back to totalPrice.
        vendorPayoutAmount:
          b.vendorPayoutAmount != null ? Number(b.vendorPayoutAmount) : null,
        status: b.status,
        statusLabel,
        // True when the booking is in an actionable offer state for
        // this vendor — fresh offer OR a revised offer that hasn't
        // been responded to yet. Used by the frontend to gate the
        // Accept / Reject buttons and the "New Request" tab presence.
        // Without this, a booking in ASSIGNMENT_RE_OFFERED with the
        // latest offer already REJECTED would still show actions even
        // though the vendor has already responded.
        isActionable:
          b.status === "ASSIGNMENT_OFFERED" ||
          (b.status === "ASSIGNMENT_RE_OFFERED" &&
            latestOffer?.status === "PENDING"),
        // Source attribution (isPartnerBooking / partnerName /
        // sourceLabel) is intentionally NOT exposed to the vendor.
        // The vendor's job is to fulfill a booking regardless of how
        // it was originated; partner commercial terms are an upstream
        // concern that stays hidden. Same rationale as the analytics
        // tripTypeMix swap done in the prior pass.
        // Assignment info
        driverName: b.driver
          ? `${b.driver.firstName} ${b.driver.lastName}`
          : null,
        vehicleInfo: b.vehicle
          ? `${b.vehicle.make} ${b.vehicle.model} (${b.vehicle.plateNumber})`
          : null,
        createdAt: b.createdAt,
      };
    });

    // Tab counts for badges
    const [
      newRequestsCount,
      activeCount,
      completedCount,
      cancelledCount,
      allCount,
    ] = await Promise.all([
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          status: { in: ["ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"] },
        },
      }),
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          status: { in: ["CONFIRMED", "IN_PROGRESS"] },
        },
      }),
      prisma.booking.count({
        where: { vendorId: vendor.id, status: "COMPLETED" },
      }),
      prisma.booking.count({
        where: {
          vendorId: vendor.id,
          status: "CANCELLED",
        },
      }),
      prisma.booking.count({
        where: { vendorId: vendor.id },
      }),
    ]);

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        tabs: {
          new_requests: newRequestsCount,
          active: activeCount,
          completed: completedCount,
          cancelled: cancelledCount,
          all: allCount,
        },
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

// ============== BOOKING DETAIL ==============

/**
 * GET /api/v1/vendor/bookings/:bookingId
 *
 * Full booking detail with timeline, customer info, route, vehicle,
 * pricing, driver assignment. Content varies by status.
 */
export const getBookingDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const { bookingId } = req.params;

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, vendorId: vendor.id },
      include: {
        // partner intentionally not included — see response builder
        // below for the full rationale.
        driver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
            rating: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            plateNumber: true,
            color: true,
            category: true,
            seats: true,
          },
        },
        // Latest offer with this vendor — same purpose as in
        // getBookingsList: lets the detail response distinguish
        // ASSIGNMENT_RE_OFFERED's two sub-states (vendor just declined
        // for price vs admin re-offered a revised price). Drives
        // statusLabel + isActionable below.
        assignmentOffers: {
          where: { vendorId: vendor.id },
          orderBy: { attemptNumber: "desc" },
          take: 1,
          select: { status: true, attemptNumber: true },
        },
      },
    });

    if (!booking) throw new NotFoundError("Booking");

    const timeline = buildVendorStatusTimeline(booking.status, booking);

    // Same statusLabel + isActionable derivation as getBookingsList —
    // see the longer comment there for why ASSIGNMENT_RE_OFFERED needs
    // to be split by the latest offer's status. Keeping the logic
    // duplicated rather than extracted because the two responses have
    // different return shapes and a shared helper would obscure that.
    const latestOffer = booking.assignmentOffers[0];
    let statusLabel: string;
    if (
      booking.status === "ASSIGNMENT_RE_OFFERED" &&
      latestOffer?.status === "REJECTED"
    ) {
      statusLabel = "Awaiting Revised Offer";
    } else if (
      booking.status === "ASSIGNMENT_RE_OFFERED" &&
      latestOffer?.status === "PENDING"
    ) {
      statusLabel = "Revised Offer";
    } else {
      statusLabel = STATUS_LABELS[booking.status] || booking.status;
    }
    const isActionable =
      booking.status === "ASSIGNMENT_OFFERED" ||
      (booking.status === "ASSIGNMENT_RE_OFFERED" &&
        latestOffer?.status === "PENDING");

    // Resolve the raw GCS path to a signed URL so the browser can render it.
    const driverPhotoSignedUrl = booking.driver
      ? await getReadUrl(booking.driver.photoUrl || null)
      : null;

    res.json({
      success: true,
      data: {
        id: booking.id,
        bookingRef: booking.bookingRef,
        status: booking.status,
        statusLabel,
        isActionable,

        // Timeline
        timeline,

        // Source attribution is intentionally NOT in the vendor-facing
        // response. Even `booking.source` ("PARTNER" / "DIRECT") leaks
        // partner-vs-admin originator info that vendors shouldn't have
        // visibility into. List response strips the same trio of
        // fields — see comment there for the full rationale.

        // Customer
        customer: {
          name: booking.guestName || "—",
          phone: booking.guestPhone || "—",
          email: booking.guestEmail || null,
        },

        // Trip
        trip: {
          tripType: booking.tripType,
          tripTypeLabel:
            booking.tripType === "ONE_WAY" ? "One Way" : "By the Hour",
          city: booking.city,
          route: booking.route,
          hours: booking.hours,
          hourlyDuration: booking.hourlyDuration,
          pickupAddress: booking.pickupAddress,
          pickupLat: booking.pickupLat ? Number(booking.pickupLat) : null,
          pickupLng: booking.pickupLng ? Number(booking.pickupLng) : null,
          dropoffAddress: booking.dropoffAddress,
          dropoffLat: booking.dropoffLat ? Number(booking.dropoffLat) : null,
          dropoffLng: booking.dropoffLng ? Number(booking.dropoffLng) : null,
          tripDate: booking.tripDate,
          tripTime: booking.tripTime,
          flightNumber: booking.flightNumber || null,
          terminalNo: (booking as any).terminalNo || null,
          terminalLocation: (booking as any).terminalLocation || null,
        },

        // Vehicle
        vehicleClass: booking.vehicleClass,
        passengers: booking.passengers,
        assignedVehicle: booking.vehicle
          ? {
              id: booking.vehicle.id,
              make: booking.vehicle.make,
              model: booking.vehicle.model,
              year: booking.vehicle.year,
              plateNumber: booking.vehicle.plateNumber,
              color: booking.vehicle.color,
              category: booking.vehicle.category,
              seats: booking.vehicle.seats,
            }
          : null,

        // Driver
        assignedDriver: booking.driver
          ? {
              id: booking.driver.id,
              name: `${booking.driver.firstName} ${booking.driver.lastName}`,
              phone: booking.driver.phone,
              photoUrl: driverPhotoSignedUrl,
              rating: booking.driver.rating
                ? Number(booking.driver.rating)
                : null,
            }
          : null,

        // Pricing
        pricing: {
          basePrice: Number(booking.basePrice),
          vatAmount: Number(booking.vatAmount),
          totalPrice: Number(booking.totalPrice),
          // See same note in getBookings — vendor-specific payout
          // surfaces here so the detail modal can show "Your Payout"
          // instead of the partner price breakdown.
          vendorPayoutAmount:
            booking.vendorPayoutAmount != null
              ? Number(booking.vendorPayoutAmount)
              : null,
        },

        // Notes
        notes: booking.notes || null,

        // Timestamps
        createdAt: booking.createdAt,
        confirmedAt: booking.confirmedAt,
        completedAt: booking.completedAt,
      },
    });
  },
);

// ============== GET AVAILABLE DRIVERS & VEHICLES FOR ASSIGNMENT ==============

/**
 * GET /api/v1/vendor/bookings/:bookingId/assignment-options
 *
 * Returns available drivers and vehicles matching the booking's vehicle class.
 * Only approved, active drivers and vehicles that are not already assigned
 * to another active booking at the same date/time.
 */
export const getAssignmentOptions = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { bookingId } = req.params;

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, vendorId: vendor.id },
    });

    if (!booking) throw new NotFoundError("Booking");
    if (
      booking.status !== "ASSIGNMENT_OFFERED" &&
      booking.status !== "ASSIGNMENT_RE_OFFERED"
    ) {
      throw new BadRequestError(
        "Can only assign driver/vehicle to new requests",
      );
    }

    // Get the trip date for conflict checking
    const tripDateStart = new Date(booking.tripDate);
    tripDateStart.setHours(0, 0, 0, 0);
    const tripDateEnd = new Date(booking.tripDate);
    tripDateEnd.setHours(23, 59, 59);

    // Find drivers already assigned to bookings on the same date
    const busyDriverIds = await prisma.booking.findMany({
      where: {
        vendorId: vendor.id,
        driverId: { not: null },
        tripDate: { gte: tripDateStart, lte: tripDateEnd },
        status: {
          in: [
            "CONFIRMED",
            "IN_PROGRESS",
            "ASSIGNMENT_OFFERED",
            "ASSIGNMENT_RE_OFFERED",
          ],
        },
        id: { not: bookingId },
      },
      select: { driverId: true },
    });
    const busyDriverIdSet = new Set(
      busyDriverIds.map((b) => b.driverId).filter(Boolean),
    );

    // Find vehicles already assigned to bookings on the same date
    const busyVehicleIds = await prisma.booking.findMany({
      where: {
        vendorId: vendor.id,
        vehicleId: { not: null },
        tripDate: { gte: tripDateStart, lte: tripDateEnd },
        status: {
          in: [
            "CONFIRMED",
            "IN_PROGRESS",
            "ASSIGNMENT_OFFERED",
            "ASSIGNMENT_RE_OFFERED",
          ],
        },
        id: { not: bookingId },
      },
      select: { vehicleId: true },
    });
    const busyVehicleIdSet = new Set(
      busyVehicleIds.map((b) => b.vehicleId).filter(Boolean),
    );

    // Get available drivers (approved + active + not busy + no expired-by-trip-date docs)
    const allDrivers = await prisma.driver.findMany({
      where: {
        vendorId: vendor.id,
        isActive: true,
        status: "APPROVED",
        documents: {
          none: { expiryDate: { lte: booking.tripDate } },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        photoUrl: true,
        rating: true,
        assignedVehicleId: true,
      },
      orderBy: { firstName: "asc" },
    });

    const availableDrivers = allDrivers.map((d) => ({
      id: d.id,
      name: `${d.firstName} ${d.lastName}`,
      phone: d.phone,
      photoUrl: d.photoUrl,
      rating: d.rating ? Number(d.rating) : null,
      assignedVehicleId: d.assignedVehicleId,
      isBusy: busyDriverIdSet.has(d.id),
    }));

    // Get available vehicles matching the requested class (approved + active + not busy
    // + no required doc expiring on/before the trip date)
    const allVehicles = await prisma.vehicle.findMany({
      where: {
        vendorId: vendor.id,
        isActive: true,
        status: "APPROVED",
        category: booking.vehicleClass,
        // Exclude vehicles whose any document expires on/before the trip date
        documents: {
          none: { expiryDate: { lte: booking.tripDate } },
        },
      },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        plateNumber: true,
        color: true,
        seats: true,
        category: true,
      },
      orderBy: { make: "asc" },
    });

    const availableVehicles = allVehicles.map((v) => ({
      id: v.id,
      label: `${v.make} ${v.model} ${v.year} — ${v.plateNumber}`,
      make: v.make,
      model: v.model,
      year: v.year,
      plateNumber: v.plateNumber,
      color: v.color,
      seats: v.seats,
      category: v.category,
      isBusy: busyVehicleIdSet.has(v.id),
    }));

    res.json({
      success: true,
      data: {
        bookingRef: booking.bookingRef,
        requestedVehicleClass: booking.vehicleClass,
        tripDate: booking.tripDate,
        drivers: availableDrivers,
        vehicles: availableVehicles,
        availableDriverCount: availableDrivers.filter((d) => !d.isBusy).length,
        availableVehicleCount: availableVehicles.filter((v) => !v.isBusy)
          .length,
      },
    });
  },
);

// ============== ACCEPT BOOKING ==============

/**
 * POST /api/v1/vendor/bookings/:bookingId/accept
 *
 * Vendor accepts the booking and assigns a driver + vehicle.
 * Status changes from AWAITING_VENDOR → CONFIRMED.
 * Admin and partner (if applicable) are notified.
 */
export const acceptBooking = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { bookingId } = req.params;
    const { driverId, vehicleId } = req.body;

    if (!driverId) throw new BadRequestError("Driver selection is required");
    if (!vehicleId) throw new BadRequestError("Vehicle selection is required");

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, vendorId: vendor.id },
      // No `partner` include — the partner-confirmation notification
      // dispatched below fetches partner.userId itself via the lib
      // helper. Defense in depth: keeps even the userId field out of
      // this query's result shape so it can't accidentally surface in
      // a future res.json() reorg.
    });

    if (!booking) throw new NotFoundError("Booking");
    if (
      booking.status !== "ASSIGNMENT_OFFERED" &&
      booking.status !== "ASSIGNMENT_RE_OFFERED"
    ) {
      throw new BadRequestError(
        `Cannot accept booking with status "${booking.status}". Only offers awaiting your response can be accepted.`,
      );
    }

    // Validate driver belongs to this vendor and is approved
    const driver = await prisma.driver.findFirst({
      where: {
        id: driverId,
        vendorId: vendor.id,
        isActive: true,
        status: "APPROVED",
      },
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    if (!driver)
      throw new BadRequestError("Invalid or inactive driver selected");

    // Validate vehicle belongs to this vendor, matches class, and is approved
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: vehicleId,
        vendorId: vendor.id,
        isActive: true,
        status: "APPROVED",
        category: booking.vehicleClass,
      },
      select: { id: true, make: true, model: true, plateNumber: true },
    });
    if (!vehicle) {
      throw new BadRequestError(
        `Invalid vehicle selected. Must be an active, approved ${booking.vehicleClass} vehicle.`,
      );
    }

    // Ensure no required vehicle/driver document expires on or before the trip date.
    // If any does, refuse the assignment — vendor must renew first.
    const tripDate = booking.tripDate;
    const expiringVehicleDocs = await prisma.vehicleDocument.findMany({
      where: {
        vehicleId,
        expiryDate: { lte: tripDate },
      },
      select: { type: true, expiryDate: true },
    });
    if (expiringVehicleDocs.length > 0) {
      const list = expiringVehicleDocs
        .map(
          (d) =>
            `${d.type} (expires ${d.expiryDate!.toISOString().split("T")[0]})`,
        )
        .join(", ");
      throw new BadRequestError(
        `Cannot assign this vehicle. The following document(s) expire on or before the trip date: ${list}. Please renew them first.`,
      );
    }
    const expiringDriverDocs = await prisma.driverDocument.findMany({
      where: {
        driverId,
        expiryDate: { lte: tripDate },
      },
      select: { type: true, expiryDate: true },
    });
    if (expiringDriverDocs.length > 0) {
      const list = expiringDriverDocs
        .map(
          (d) =>
            `${d.type} (expires ${d.expiryDate!.toISOString().split("T")[0]})`,
        )
        .join(", ");
      throw new BadRequestError(
        `Cannot assign this driver. The following document(s) expire on or before the trip date: ${list}. Please renew them first.`,
      );
    }

    // Find this vendor's PENDING offer row for this booking — that's
    // what we're flipping to ACCEPTED. Under the offer model the offer
    // row is the canonical record of "vendor said yes at this price";
    // the booking.vendorPayoutAmount denormalization is for fast read.
    const pendingOffer = await prisma.bookingAssignmentOffer.findFirst({
      where: { bookingId, vendorId: vendor.id, status: "PENDING" },
    });
    if (!pendingOffer) {
      throw new BadRequestError(
        "No pending offer found for you on this booking. It may have been withdrawn or already responded to.",
      );
    }

    // Single transaction: flip offer to ACCEPTED, transition booking
    // to CONFIRMED with driver/vehicle/payout denormalized.
    const [, updated] = await prisma.$transaction([
      prisma.bookingAssignmentOffer.update({
        where: { id: pendingOffer.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      }),
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: "CONFIRMED",
          driverId: driver.id,
          vehicleId: vehicle.id,
          // Denormalize the offer's payoutAmount onto booking — that
          // way downstream payout aggregation doesn't need to join
          // back to BookingAssignmentOffer for every row.
          vendorPayoutAmount: pendingOffer.payoutAmount,
          confirmedAt: new Date(),
          needsAttention: false,
          attentionReason: null,
        },
      }),
    ]);

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Booking Accepted by Vendor",
          message: `${vendor.companyName} accepted booking ${booking.bookingRef}. Driver: ${driver.firstName} ${driver.lastName}, Vehicle: ${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`,
          type: "BOOKING_CONFIRMED",
          data: {
            bookingId,
            bookingRef: booking.bookingRef,
            vendorId: vendor.id,
          },
        })),
      });
    }

    // Notify partner — uses the shared lib helper which intentionally
    // omits driver / vehicle details. The previous inline code here
    // included driver name + vehicle plate in the partner-facing
    // notification, which leaked vendor-side info to the partner and
    // contradicted the cross-visibility rule documented at the top of
    // lib/offer-notifications.ts.
    if (booking.partnerId) {
      const { notifyPartnerOfConfirmation } =
        await import("../../lib/offer-notifications");
      await notifyPartnerOfConfirmation({
        id: booking.id,
        bookingRef: booking.bookingRef,
        partnerId: booking.partnerId,
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_ACCEPTED_BOOKING",
        entity: "Booking",
        entityId: bookingId,
        changes: {
          bookingRef: booking.bookingRef,
          vendor: vendor.companyName,
          driver: `${driver.firstName} ${driver.lastName}`,
          vehicle: `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`,
        },
      },
    });

    res.json({
      success: true,
      message: "Booking accepted successfully",
      data: {
        id: updated.id,
        bookingRef: updated.bookingRef,
        status: updated.status,
        statusLabel: STATUS_LABELS[updated.status],
        driver: {
          name: `${driver.firstName} ${driver.lastName}`,
          phone: driver.phone,
        },
        vehicle: {
          label: `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`,
        },
      },
    });
  },
);

// ============== REJECT BOOKING ==============

/**
 * POST /api/v1/vendor/bookings/:bookingId/reject
 *
 * Vendor rejects an outstanding offer.
 *
 * Required body: { reason }
 *
 * `reason` is the OfferRejectionReason enum value:
 *   - CAR_DRIVER_UNAVAILABLE → vendor out, auto-cascade to next eligible
 *   - UNSUITABLE_ROUTE       → vendor out, auto-cascade
 *   - PRICE_TOO_LOW          → at attempt 1: booking → ASSIGNMENT_RE_OFFERED
 *                              for admin to enter revised price
 *                              at attempt 2: vendor out, auto-cascade
 *
 * For backwards-compat the endpoint also accepts a legacy free-text
 * reason and maps "price"/"route" substrings to the enum; new
 * frontend should send the enum value directly.
 *
 * Behavior:
 *   - Finds the vendor's PENDING offer row for this booking, flips
 *     it to REJECTED with the reason and respondedAt timestamp.
 *   - Branches based on (reason, attemptNumber) to decide whether to
 *     trigger ASSIGNMENT_RE_OFFERED, auto-cascade, or auto-cancel
 *     (when the eligible pool is exhausted).
 *   - Notifies admin in all cases.
 */
export const rejectBooking = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { bookingId } = req.params;
    const { reason } = req.body;

    if (!reason || !String(reason).trim()) {
      throw new BadRequestError(
        "Please provide a reason for declining the booking",
      );
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, vendorId: vendor.id },
    });

    if (!booking) throw new NotFoundError("Booking");
    if (
      booking.status !== "ASSIGNMENT_OFFERED" &&
      booking.status !== "ASSIGNMENT_RE_OFFERED"
    ) {
      throw new BadRequestError(
        `Cannot reject booking with status "${booking.status}". Only offers awaiting your response can be rejected.`,
      );
    }

    // Normalize reason to enum. Accept either enum value or legacy
    // free-text (for the transition period).
    const VALID_REASONS = [
      "CAR_DRIVER_UNAVAILABLE",
      "PRICE_TOO_LOW",
      "UNSUITABLE_ROUTE",
    ] as const;
    type RejectReason = (typeof VALID_REASONS)[number];
    let mappedReason: RejectReason;
    if ((VALID_REASONS as readonly string[]).includes(String(reason))) {
      mappedReason = String(reason) as RejectReason;
    } else {
      const reasonLower = String(reason).toLowerCase();
      if (reasonLower.includes("price")) mappedReason = "PRICE_TOO_LOW";
      else if (reasonLower.includes("route")) mappedReason = "UNSUITABLE_ROUTE";
      else mappedReason = "CAR_DRIVER_UNAVAILABLE";
    }

    // Find the PENDING offer row this rejection responds to. Must
    // exist if booking is in ASSIGNMENT_OFFERED/RE_OFFERED state.
    const pendingOffer = await prisma.bookingAssignmentOffer.findFirst({
      where: { bookingId, vendorId: vendor.id, status: "PENDING" },
    });
    if (!pendingOffer) {
      throw new BadRequestError(
        "No pending offer found. The offer may have been withdrawn.",
      );
    }

    // Flip offer to REJECTED with the response details. Booking
    // updates branch below based on (mappedReason, attemptNumber).
    await prisma.bookingAssignmentOffer.update({
      where: { id: pendingOffer.id },
      data: {
        status: "REJECTED",
        rejectionReason: mappedReason,
        respondedAt: new Date(),
      },
    });

    // BRANCH 1: PRICE_TOO_LOW at attempt 1 → wait for admin to re-offer.
    // Keep vendor reference on booking so reOfferBooking can find them.
    const isPriceAtAttempt1 =
      mappedReason === "PRICE_TOO_LOW" && pendingOffer.attemptNumber === 1;

    if (isPriceAtAttempt1) {
      const updated = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: "ASSIGNMENT_RE_OFFERED",
          // Previous code appended the rejection text to booking.notes
          // ("X requested higher price"), but booking.notes is visible
          // to whatever vendor currently owns the booking and we don't
          // want vendor↔vendor leakage. The rejection is already
          // captured structurally on the BookingAssignmentOffer row
          // updated above (status=REJECTED, rejectionReason=...) and
          // admin sees the same info via attentionReason below — no
          // need to duplicate into a free-text field.
          needsAttention: true,
          attentionReason: `${vendor.companyName} requested higher price — enter revised payout`,
          attentionAt: new Date(),
          isReadByAdmin: false,
        },
      });

      const { notifyAdminOfRejection } =
        await import("../../lib/offer-notifications");
      await notifyAdminOfRejection(
        bookingId,
        vendor.id,
        mappedReason,
        pendingOffer.attemptNumber,
      );

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "VENDOR_REJECTED_PRICE_AWAITING_REOFFER",
          entity: "Booking",
          entityId: bookingId,
          changes: {
            bookingRef: booking.bookingRef,
            vendor: vendor.companyName,
            reason: mappedReason,
            attemptNumber: pendingOffer.attemptNumber,
          },
        },
      });

      res.json({
        success: true,
        message:
          "Booking declined. Admin will revise the price and re-offer to you.",
        data: {
          id: updated.id,
          bookingRef: updated.bookingRef,
          status: updated.status,
        },
      });
      return;
    }

    // BRANCH 2: any other reason (or PRICE_TOO_LOW at attempt 2) →
    // vendor is out. Clear them from booking, cascade to next eligible.
    // Note we deliberately do NOT append "Rejected by <vendor>" to
    // booking.notes any more: that field is visible to whatever vendor
    // currently owns the booking, and stamping it with a prior
    // vendor's company name + reason leaked rejection history across
    // the cascade. The same data lives structurally on the
    // BookingAssignmentOffer row (status=REJECTED, rejectionReason,
    // respondedAt) which only admin reads.
    await prisma.booking.update({
      where: { id: bookingId },
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
    const { notifyAdminOfRejection } =
      await import("../../lib/offer-notifications");

    // Preserve the original payoutAmount from the rejected offer when
    // cascading — admin's judgement of "fair price for this booking"
    // doesn't change just because one vendor declined for non-price
    // reasons. If you want to bump prices automatically on cascade,
    // that's a policy change for a later stage.
    const cascadePayout = Number(pendingOffer.payoutAmount) || 0;
    const cascadeResult = await cascadeToNextVendor(bookingId, {
      payoutAmount: cascadePayout,
    });

    await notifyAdminOfRejection(
      bookingId,
      vendor.id,
      mappedReason,
      pendingOffer.attemptNumber,
    );

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_REJECTED_BOOKING",
        entity: "Booking",
        entityId: bookingId,
        changes: {
          bookingRef: booking.bookingRef,
          vendor: vendor.companyName,
          reason: mappedReason,
          attemptNumber: pendingOffer.attemptNumber,
          cascadeOutcome: cascadeResult
            ? `OFFERED_TO_${cascadeResult.vendorId}`
            : "CANCELLED_POOL_EXHAUSTED",
        },
      },
    });

    res.json({
      success: true,
      message: cascadeResult
        ? "Booking declined. Offered to next eligible vendor."
        : "Booking declined. No eligible vendors remain — booking cancelled.",
      data: {
        id: bookingId,
        bookingRef: booking.bookingRef,
        status: cascadeResult ? "ASSIGNMENT_OFFERED" : "CANCELLED",
        cascadedToNext: !!cascadeResult,
      },
    });
  },
);

// ============== START TRIP ==============

/**
 * PATCH /api/v1/vendor/bookings/:bookingId/start
 *
 * Vendor starts the trip. Status: CONFIRMED → IN_PROGRESS
 */
export const startTrip = asyncWrapper(async (req: Request, res: Response) => {
  const vendor = await getVendorForUser(req.user!.id);
  await requireApprovedAndDocsValid(vendor);

  const { bookingId } = req.params;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, vendorId: vendor.id },
    // No partner include — the trip-start notification fetches
    // partner.userId itself. See accept handler for the full rationale.
  });

  if (!booking) throw new NotFoundError("Booking");
  if (booking.status !== "CONFIRMED") {
    throw new BadRequestError(
      `Cannot start trip for booking with status "${booking.status}". Booking must be CONFIRMED.`,
    );
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "IN_PROGRESS" },
  });

  // Notify admin
  const adminUsers = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  if (adminUsers.length > 0) {
    await prisma.notification.createMany({
      data: adminUsers.map((admin) => ({
        userId: admin.id,
        title: "Trip Started",
        message: `Booking ${booking.bookingRef} trip has started.`,
        type: "BOOKING_IN_PROGRESS",
        data: { bookingId, bookingRef: booking.bookingRef },
      })),
    });
  }

  // Notify partner via the lib helper (lazy fetches partner.userId).
  if (booking.partnerId) {
    const { notifyPartnerOfTripStart } =
      await import("../../lib/offer-notifications");
    await notifyPartnerOfTripStart({
      id: booking.id,
      bookingRef: booking.bookingRef,
      partnerId: booking.partnerId,
    });
  }

  res.json({
    success: true,
    message: "Trip started",
    data: {
      id: updated.id,
      bookingRef: updated.bookingRef,
      status: updated.status,
      statusLabel: STATUS_LABELS[updated.status],
    },
  });
});

// ============== COMPLETE TRIP ==============

/**
 * PATCH /api/v1/vendor/bookings/:bookingId/complete
 *
 * Vendor marks the trip as completed. Status: IN_PROGRESS → COMPLETED
 */
export const completeTrip = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    await requireApprovedAndDocsValid(vendor);

    const { bookingId } = req.params;

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, vendorId: vendor.id },
      // No partner include — see accept handler for rationale.
    });

    if (!booking) throw new NotFoundError("Booking");
    if (booking.status !== "IN_PROGRESS") {
      throw new BadRequestError(
        `Cannot complete booking with status "${booking.status}". Trip must be IN_PROGRESS.`,
      );
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Trip Completed",
          message: `Booking ${booking.bookingRef} has been completed. Amount: SAR ${Number(booking.totalPrice).toFixed(2)}`,
          type: "BOOKING_COMPLETED",
          data: {
            bookingId,
            bookingRef: booking.bookingRef,
            amount: Number(booking.totalPrice),
          },
        })),
      });
    }

    // Notify partner via the lib helper.
    if (booking.partnerId) {
      const { notifyPartnerOfCompletion } =
        await import("../../lib/offer-notifications");
      await notifyPartnerOfCompletion({
        id: booking.id,
        bookingRef: booking.bookingRef,
        partnerId: booking.partnerId,
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "VENDOR_COMPLETED_BOOKING",
        entity: "Booking",
        entityId: bookingId,
        changes: {
          bookingRef: booking.bookingRef,
          vendor: vendor.companyName,
          totalPrice: Number(booking.totalPrice),
        },
      },
    });

    res.json({
      success: true,
      message: "Trip completed successfully",
      data: {
        id: updated.id,
        bookingRef: updated.bookingRef,
        status: updated.status,
        statusLabel: STATUS_LABELS[updated.status],
        completedAt: updated.completedAt,
      },
    });
  },
);

// ============== EXPORT BOOKINGS CSV ==============

/**
 * GET /api/v1/vendor/bookings/export/csv
 *
 * Exports bookings as CSV with 3 sheets (tabs):
 * Respects the currently selected tab filter.
 */
export const exportBookingsCsv = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireOperational(vendor.status);

    const {
      tab = "all",
      search,
      startDate,
      endDate,
      dateFrom,
      dateTo,
    } = req.query;

    // Accept either naming convention — see getBookingsList for the rationale.
    const resolvedStartDate = (startDate || dateFrom) as string | undefined;
    const resolvedEndDate = (endDate || dateTo) as string | undefined;

    const where: any = { vendorId: vendor.id };

    switch (tab) {
      case "new_requests":
        where.status = { in: ["ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"] };
        break;
      case "active":
        where.status = { in: ["CONFIRMED", "IN_PROGRESS"] };
        break;
      case "completed":
        where.status = "COMPLETED";
        break;
      case "cancelled":
        where.status = "CANCELLED";
        break;
      case "all":
      default:
        break;
    }

    if (search) {
      const s = search as string;
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { bookingRef: { contains: s, mode: "insensitive" } },
            { guestName: { contains: s, mode: "insensitive" } },
          ],
        },
      ];
    }

    if (resolvedStartDate || resolvedEndDate) {
      const dateFilter: any = {};
      if (resolvedStartDate) dateFilter.gte = new Date(resolvedStartDate);
      if (resolvedEndDate) dateFilter.lte = new Date(resolvedEndDate);
      if (where.tripDate) {
        where.AND = [...(where.AND || []), { tripDate: dateFilter }];
      } else {
        where.tripDate = dateFilter;
      }
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: [{ tripDate: "desc" }, { createdAt: "desc" }],
      select: {
        bookingRef: true,
        guestName: true,
        guestPhone: true,
        guestEmail: true,
        route: true,
        pickupAddress: true,
        dropoffAddress: true,
        tripType: true,
        tripDate: true,
        tripTime: true,
        hours: true,
        city: true,
        vehicleClass: true,
        passengers: true,
        basePrice: true,
        vatAmount: true,
        totalPrice: true,
        status: true,
        // source / partner intentionally not selected for the CSV
        // export — see the "Source column intentionally omitted"
        // comment below.
        createdAt: true,
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { make: true, model: true, plateNumber: true } },
      },
    });

    // Source column intentionally omitted — see list/detail response
    // comments for the rationale. A vendor exporting their bookings
    // CSV shouldn't be able to reconstruct partner-vs-direct
    // attribution either.
    const headers = [
      "Booking No",
      "Customer",
      "Phone",
      "Email",
      "Route",
      "Pickup",
      "Dropoff",
      "Trip Type",
      "Trip Date",
      "Trip Time",
      "City",
      "Vehicle Class",
      "Passengers",
      "Base Price (SAR)",
      "VAT (SAR)",
      "Total Price (SAR)",
      "Status",
      "Driver",
      "Vehicle",
      "Created",
    ];

    const rows = bookings.map((b) => [
      b.bookingRef,
      b.guestName || "",
      b.guestPhone || "",
      b.guestEmail || "",
      b.route || "",
      b.pickupAddress,
      b.dropoffAddress,
      b.tripType,
      new Date(b.tripDate).toLocaleDateString(),
      b.tripTime,
      b.city,
      b.vehicleClass,
      b.passengers,
      Number(b.basePrice).toFixed(2),
      Number(b.vatAmount).toFixed(2),
      Number(b.totalPrice).toFixed(2),
      STATUS_LABELS[b.status] || b.status,
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

    const tabLabel = tab !== "all" ? `-${tab}` : "";
    const fileName = `vendor-bookings-${vendor.companyName.replace(/\s+/g, "_")}${tabLabel}-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csvContent);
  },
);
