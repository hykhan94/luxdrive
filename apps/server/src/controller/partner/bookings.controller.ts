// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/partner/bookings.controller.ts
// ============================================
// ============================================
// apps/server/src/controller/partner/bookings-repo.controller.ts
// Partner Portal — Bookings Repository (All Bookings List)
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError } from "../../utils/AppError";
import { requireOperational } from "./_shared";
import { getReadUrl } from "../../lib/gcs";
import { buildPOHtml } from "../../utils/helpers/po.helpers";

// ============== HELPERS ==============

async function getPartnerForUser(userId: string) {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: {
      id: true,
      status: true,
      companyName: true,
      crNumber: true,
      vatNumber: true,
      contactPerson: true,
      contactPhone: true,
      address: true,
    },
  });
  if (!partner) throw new NotFoundError("Partner profile");
  return partner;
}

// Partner-facing status labels.
//
// Per the design rule "partner shouldn't know there's a vendor in the
// middle", admin's internal offer states (ASSIGNMENT_OFFERED,
// ASSIGNMENT_RE_OFFERED) and the PENDING (admin hasn't offered yet)
// state all collapse to the single masked label "Awaiting Driver/Vehicle
// Assignment" on the partner side. The partner only sees the
// progression once a vendor has actually accepted (CONFIRMED onwards).
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting Driver/Vehicle Assignment",
  ASSIGNMENT_OFFERED: "Awaiting Driver/Vehicle Assignment",
  ASSIGNMENT_RE_OFFERED: "Awaiting Driver/Vehicle Assignment",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

// Status timeline steps — each booking progresses through these.
// The "AWAITING_VENDOR" step is the masked single-state shown to
// partner during the offer phase; internally the booking moves through
// PENDING → ASSIGNMENT_OFFERED → ASSIGNMENT_RE_OFFERED but partner
// sees it as one continuous step.
const STATUS_TIMELINE = [
  {
    key: "PENDING",
    label: "Booking Placed",
    description: "Sent to admin for assignment",
  },
  {
    key: "ASSIGNMENT_OFFERED",
    label: "Awaiting Driver/Vehicle Assignment",
    description: "Admin is assigning a driver and vehicle",
  },
  {
    key: "CONFIRMED",
    label: "Confirmed",
    description: "Driver and vehicle confirmed",
  },
  { key: "IN_PROGRESS", label: "In Progress", description: "Ride is ongoing" },
  {
    key: "COMPLETED",
    label: "Completed",
    description: "Ride completed successfully",
  },
];

function buildStatusTimeline(currentStatus: string, booking: any) {
  // CANCELLED is terminal — covers both explicit cancellation and the
  // implicit "all eligible vendors rejected and we ran out" path. Per
  // the design rule the partner sees only "Cancelled" with no internal
  // detail about why.
  if (currentStatus === "CANCELLED") {
    return [
      {
        key: "PENDING",
        label: "Booking Placed",
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

  // Normal flow. Both ASSIGNMENT_OFFERED and ASSIGNMENT_RE_OFFERED
  // collapse to ASSIGNMENT_OFFERED for the partner's timeline so they
  // don't see the offer-iteration internals.
  const normalizedCurrent =
    currentStatus === "ASSIGNMENT_RE_OFFERED"
      ? "ASSIGNMENT_OFFERED"
      : currentStatus;

  const statusOrder = [
    "PENDING",
    "ASSIGNMENT_OFFERED",
    "CONFIRMED",
    "IN_PROGRESS",
    "COMPLETED",
  ];
  const currentIndex = statusOrder.indexOf(normalizedCurrent);

  return STATUS_TIMELINE.map((step, i) => {
    let stepStatus: "completed" | "current" | "upcoming";
    let timestamp: Date | null = null;

    if (i < currentIndex) {
      stepStatus = "completed";
      if (step.key === "PENDING") timestamp = booking.createdAt;
      if (step.key === "CONFIRMED") timestamp = booking.confirmedAt;
    } else if (i === currentIndex) {
      stepStatus = "current";
      if (step.key === "PENDING") timestamp = booking.createdAt;
      if (step.key === "CONFIRMED") timestamp = booking.confirmedAt;
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
 * Get all partner bookings — supports tab filtering
 * Tabs: upcoming, pending, today, completed, cancelled, all
 *
 * Columns returned: booking no, guest name, mobile, email, route,
 * trip date/time, created date, vehicle category, price, status
 */
export const getBookingsList = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const {
      page = "1",
      limit = "10",
      tab = "all",
      search,
      startDate,
      endDate,
    } = req.query;

    const where: any = { partnerId: partner.id };

    // ---- TAB FILTERS ----
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );

    switch (tab) {
      case "upcoming":
        // Confirmed by vendor, trip date in the future
        where.status = "CONFIRMED";
        where.tripDate = { gte: todayStart };
        break;
      case "pending":
        // Awaiting admin or vendor action. Maps to the partner-facing
        // "Awaiting Driver/Vehicle Assignment" step in the timeline —
        // internally three enum values:
        //   PENDING               — booking placed, admin hasn't offered to vendor
        //   ASSIGNMENT_OFFERED    — admin offered to a vendor, awaiting accept
        //   ASSIGNMENT_RE_OFFERED — same vendor, re-offered at higher price
        // Previous values "AWAITING_VENDOR" and "VENDOR_REJECTED" were
        // placeholder names from an earlier design; they don't exist on
        // the BookingStatus enum and caused Prisma to reject the query.
        // VENDOR_REJECTED specifically was removed from the model in
        // Stage 2 — the "needs reassignment" state is now represented
        // by being in ASSIGNMENT_OFFERED/ASSIGNMENT_RE_OFFERED with no
        // live pending offer.
        where.status = {
          in: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
        };
        break;
      case "today":
        // All bookings with tripDate = today (any status)
        where.tripDate = { gte: todayStart, lte: todayEnd };
        break;
      case "completed":
        where.status = "COMPLETED";
        break;
      case "cancelled":
        where.status = "CANCELLED";
        break;
      case "all":
      default:
        // No filter — show everything
        break;
    }

    // ---- SEARCH ----
    if (search) {
      const s = search as string;
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { bookingRef: { contains: s, mode: "insensitive" } },
            { guestName: { contains: s, mode: "insensitive" } },
            { guestPhone: { contains: s, mode: "insensitive" } },
            { guestEmail: { contains: s, mode: "insensitive" } },
            { route: { contains: s, mode: "insensitive" } },
            { pickupAddress: { contains: s, mode: "insensitive" } },
            { dropoffAddress: { contains: s, mode: "insensitive" } },
          ],
        },
      ];
    }

    // ---- DATE RANGE FILTER ----
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59);
        dateFilter.lte = end;
      }
      // If tab already set tripDate, merge with AND
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
        orderBy: [{ tripDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
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
          hourlyDuration: true,
          city: true,
          vehicleClass: true,
          passengers: true,
          totalPrice: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.booking.count({ where }),
    ]);

    // Format for table columns
    const formattedBookings = bookings.map((b) => ({
      id: b.id,
      bookingRef: b.bookingRef,
      guestName: b.guestName || "—",
      guestPhone: b.guestPhone || "—",
      guestEmail: b.guestEmail || "—",
      route: b.route || `${b.pickupAddress} → ${b.dropoffAddress}`,
      pickupAddress: b.pickupAddress,
      dropoffAddress: b.dropoffAddress,
      tripType: b.tripType,
      hours: b.hours,
      hourlyDuration: (b as any).hourlyDuration || null,
      tripDate: b.tripDate,
      tripTime: b.tripTime,
      createdAt: b.createdAt,
      city: b.city,
      vehicleClass: b.vehicleClass,
      passengers: b.passengers,
      totalPrice: Number(b.totalPrice),
      status: b.status,
      statusLabel: STATUS_LABELS[b.status] || b.status,
    }));

    // ---- TAB COUNTS (for badge numbers) ----
    const [
      upcomingCount,
      pendingCount,
      todayCount,
      completedCount,
      cancelledCount,
      allCount,
    ] = await Promise.all([
      prisma.booking.count({
        where: {
          partnerId: partner.id,
          status: "CONFIRMED",
          tripDate: { gte: todayStart },
        },
      }),
      prisma.booking.count({
        where: {
          partnerId: partner.id,
          // Partner-facing "Pending" = booking still in the assignment
          // pipeline (admin hasn't offered, or vendor hasn't accepted).
          // Partner doesn't distinguish first-offer vs re-offer; that's
          // admin-only context.
          status: {
            in: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
          },
        },
      }),
      prisma.booking.count({
        where: {
          partnerId: partner.id,
          tripDate: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.booking.count({
        where: { partnerId: partner.id, status: "COMPLETED" },
      }),
      prisma.booking.count({
        where: { partnerId: partner.id, status: "CANCELLED" },
      }),
      prisma.booking.count({
        where: { partnerId: partner.id },
      }),
    ]);

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        tabs: {
          upcoming: upcomingCount,
          pending: pendingCount,
          today: todayCount,
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

// ============== BOOKING DETAIL WITH STATUS TIMELINE ==============

/**
 * Get full booking detail with status timeline, customer info,
 * route/location, vehicle, pricing, and driver assignment
 */
export const getBookingDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const { bookingId } = req.params;

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        partnerId: partner.id,
      },
      include: {
        vendor: {
          select: { companyName: true },
        },
        driver: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
            rating: true,
          },
        },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            plateNumber: true,
            color: true,
            category: true,
          },
        },
      },
    });

    if (!booking) throw new NotFoundError("Booking");

    // Build status timeline
    const timeline = buildStatusTimeline(booking.status, booking);

    // Sign the driver's photoUrl before returning. The DB stores raw
    // GCS object paths (e.g. "drivers/abc/photo.jpg") that the browser
    // can't load directly — getReadUrl mints a short-lived signed URL
    // that ProfileImage on the frontend can route through the resize
    // proxy. Without this call, the partner UI showed a broken image
    // / fallback icon for every driver photo because the raw object
    // path was being sent as-is. Same pattern admin and vendor
    // controllers use for documents, vehicle photos, and MOUs.
    const driverPhotoReadUrl = booking.driver
      ? await getReadUrl(booking.driver.photoUrl)
      : null;

    res.json({
      success: true,
      data: {
        id: booking.id,
        bookingRef: booking.bookingRef,
        // Public trip-card token for the WhatsApp share flow. The
        // partner UI constructs the customer-facing trip card URL
        // (https://luxdriveksa.com/trip/{shareToken}) and includes
        // it in the WhatsApp message body. Falls back to null if
        // the booking was created before the shareToken column
        // landed and hasn't been backfilled yet — the frontend
        // gracefully hides the trip-card link in that case and
        // sends the older inline-details message instead.
        shareToken: (booking as any).shareToken || null,
        status: booking.status,
        statusLabel: STATUS_LABELS[booking.status] || booking.status,

        // Status Timeline
        timeline,

        // Customer Info
        customer: {
          name: booking.guestName || "—",
          phone: booking.guestPhone || "—",
          email: booking.guestEmail || null,
        },

        // Route & Location
        trip: {
          tripType: booking.tripType,
          city: booking.city,
          route: booking.route,
          hours: booking.hours,
          hourlyDuration: (booking as any).hourlyDuration || null,
          pickupAddress: booking.pickupAddress,
          pickupLat: booking.pickupLat ? Number(booking.pickupLat) : null,
          pickupLng: booking.pickupLng ? Number(booking.pickupLng) : null,
          dropoffAddress: booking.dropoffAddress,
          dropoffLat: booking.dropoffLat ? Number(booking.dropoffLat) : null,
          dropoffLng: booking.dropoffLng ? Number(booking.dropoffLng) : null,
          tripDate: booking.tripDate,
          tripTime: booking.tripTime,
          // Airport fields
          flightNumber: booking.flightNumber || null,
          terminalNo: (booking as any).terminalNo || null,
          terminalLocation: (booking as any).terminalLocation || null,
        },

        // Vehicle
        vehicle: {
          vehicleClass: booking.vehicleClass,
          passengers: booking.passengers,
          // Assigned vehicle details (if vendor has assigned one)
          assigned: booking.vehicle
            ? {
                make: booking.vehicle.make,
                model: booking.vehicle.model,
                year: booking.vehicle.year,
                plateNumber: booking.vehicle.plateNumber,
                color: booking.vehicle.color,
                category: booking.vehicle.category,
              }
            : null,
        },

        // Pricing (booking fare)
        pricing: {
          basePrice: Number(booking.basePrice),
          peakMultiplier: Number(booking.peakMultiplier),
          peakSurcharge:
            Number(booking.basePrice) * Number(booking.peakMultiplier) -
            Number(booking.basePrice),
          vatAmount: Number(booking.vatAmount),
          totalPrice: Number(booking.totalPrice),
        },

        // Driver Info (if assigned)
        driver: booking.driver
          ? {
              name: `${booking.driver.firstName} ${booking.driver.lastName}`,
              phone: booking.driver.phone,
              photoUrl: driverPhotoReadUrl,
              rating: booking.driver.rating
                ? Number(booking.driver.rating)
                : null,
            }
          : null,

        // Vendor
        vendor: booking.vendor?.companyName || null,

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

// ============== EXPORT CSV (tab-aware) ==============

/**
 * Export bookings as CSV — respects the currently selected tab/filter
 * Only exports the data matching the active filter
 */
export const exportBookingsCsv = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { tab = "all", search, startDate, endDate } = req.query;

    const where: any = { partnerId: partner.id };

    // Same tab logic as getBookingsList
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
    );

    switch (tab) {
      case "upcoming":
        where.status = "CONFIRMED";
        where.tripDate = { gte: todayStart };
        break;
      case "pending":
        // Same set as the bookings-list endpoint above. See its comment
        // for why AWAITING_VENDOR / VENDOR_REJECTED were the wrong names.
        where.status = {
          in: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
        };
        break;
      case "today":
        where.tripDate = { gte: todayStart, lte: todayEnd };
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
            { guestPhone: { contains: s, mode: "insensitive" } },
            { route: { contains: s, mode: "insensitive" } },
          ],
        },
      ];
    }

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59);
        dateFilter.lte = end;
      }
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
        createdAt: true,
        driver: { select: { firstName: true, lastName: true } },
        vehicle: { select: { make: true, model: true, plateNumber: true } },
      },
    });

    const headers = [
      "Booking No",
      "Guest Name",
      "Mobile",
      "Email",
      "Route",
      "Pickup",
      "Dropoff",
      "Trip Type",
      "Trip Date",
      "Trip Time",
      "Hours",
      "City",
      "Vehicle Class",
      "Passengers",
      "Base Price (SAR)",
      "VAT (SAR)",
      "Total Price (SAR)",
      "Status",
      "Driver",
      "Vehicle",
      "Booking Created",
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
      b.hours || "",
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
    const fileName = `bookings-${partner.companyName.replace(/\s+/g, "_")}${tabLabel}-${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csvContent);
  },
);

// ============== DOWNLOAD PURCHASE ORDER (PO) PDF ==============

/**
 * Generate and download a Purchase Order PDF for a specific booking
 * Contains: booking details, customer info, route, vehicle, pricing
 */
export const downloadBookingPO = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const { bookingId } = req.params;

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        partnerId: partner.id,
      },
      include: {
        driver: {
          select: { firstName: true, lastName: true, phone: true },
        },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            plateNumber: true,
            color: true,
          },
        },
        vendor: {
          select: {
            companyName: true,
            crNumber: true,
            vatNumber: true,
            contactPerson: true,
            contactPhone: true,
            address: true,
          },
        },
      },
    });

    if (!booking) throw new NotFoundError("Booking");

    // Build PO HTML content
    const poHtml = buildPOHtml(booking, partner, "partner");

    // Return HTML for now — frontend can render this in a print-friendly window
    // or convert to PDF using browser's print-to-PDF
    // For server-side PDF generation, integrate puppeteer or jspdf later
    res.json({
      success: true,
      data: {
        bookingRef: booking.bookingRef,
        html: poHtml,
        // Metadata for frontend-side PDF generation
        meta: {
          fileName: `PO-${booking.bookingRef}.pdf`,
          title: `Purchase Order — ${booking.bookingRef}`,
          partner: partner.companyName,
          date: new Date().toISOString(),
        },
      },
    });
  },
);
