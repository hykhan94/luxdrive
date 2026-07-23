// ============================================
// apps/server/src/controller/partner/book-ride.controller.ts
//
// Partner Portal — Book a Ride.
//
// Post partner-priced-bookings refactor (July 2026):
//   - Admin no longer maintains route tariffs; the partner enters the
//     total price directly on the booking form.
//   - The `total` supplied by the partner is treated as VAT-inclusive
//     (matches the platform convention: PO, invoice, receipt are all
//     VAT-inclusive on the vendor side). Backend derives the base
//     (total / 1.15) and VAT (total - base) so the stored breakdown
//     agrees with the receipt the partner downloads.
//   - Peak surcharge is a partner concept only for the future customer
//     (B2C) portal — partner bookings hard-code peakMultiplier = 1.00.
//   - Vehicle-class availability is a per-city admin toggle: ELECTRIC
//     and ULTRA_LUXURY only appear when the target city has the
//     corresponding flag enabled. Backend re-validates on submit so
//     stale frontend state cannot slip through an unavailable class.
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import crypto from "crypto";
import { requireOperational, requireApprovedAndDocsValid } from "./_shared";
import { sendBookingCreatedAdminEmail } from "../../lib/email";

// ============== CONSTANTS ==============

// Max passengers per vehicle class. These reflect the *comfortable
// chauffeured-service* seat count for LuxDrive's fleet — the driver
// occupies the front-left seat and executive passengers get the
// remaining seats. Ultra Luxury is capped at 2 because it's a two-
// rear-seat experience (Rolls / Bentley / Maybach).
const VEHICLE_MAX_PASSENGERS: Record<string, number> = {
  ECONOMY_SEDAN: 3,
  BUSINESS_SEDAN: 3,
  FIRST_CLASS: 3,
  BUSINESS_SUV: 7,
  ELECTRIC: 3,
  ULTRA_LUXURY: 2,
  HIACE: 10,
  COASTER: 23,
  KING_LONG: 49,
};

// Human-readable labels for error messages. Enum values like
// ECONOMY_SEDAN read as shouting in a customer-facing error toast.
const VEHICLE_CLASS_LABELS: Record<string, string> = {
  ECONOMY_SEDAN: "Economy Sedan",
  BUSINESS_SEDAN: "Business Sedan",
  FIRST_CLASS: "First Class",
  BUSINESS_SUV: "Business SUV",
  ELECTRIC: "Electric",
  ULTRA_LUXURY: "Ultra Luxury",
  HIACE: "HiAce",
  COASTER: "Coaster",
  KING_LONG: "King Long",
};

// Saudi VAT rate — used to split the partner-entered total into base
// + VAT so the stored breakdown lines up with the invoice / PO.
const VAT_RATE = 0.15;

// Lower + upper bound on the price the partner can enter. Ceiling is
// generous (SAR 1,000,000) — high enough for a coaster-hire full-day
// package, low enough to catch a clear "typed 15000000 not 15000"
// slip. Zero and negative are rejected outright.
const MIN_TOTAL_PRICE = 1;
const MAX_TOTAL_PRICE = 1_000_000;

// ============== HELPERS ==============

async function getPartnerForUser(userId: string) {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: { id: true, status: true, companyName: true },
  });
  if (!partner) throw new NotFoundError("Partner profile");
  return partner;
}

/**
 * Booking ref generator — untouched from the pre-refactor version.
 * Partner bookings prefix with the first 3 letters of the company
 * (fallback "PTR"); direct bookings prefix with "LXD".
 */
async function generateBookingRef(
  source: "PARTNER" | "DIRECT",
  companyName?: string,
): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
  );

  let prefix: string;
  if (source === "PARTNER" && companyName) {
    prefix = companyName
      .replace(/[^a-zA-Z]/g, "")
      .substring(0, 3)
      .toUpperCase();
    if (prefix.length < 2) prefix = "PTR";
  } else {
    prefix = "LXD";
  }

  const existingCount = await prisma.booking.count({
    where: {
      bookingRef: { startsWith: `${prefix}-${yearMonth}-` },
      createdAt: { gte: monthStart, lte: monthEnd },
    },
  });

  const sequentialNumber = String(existingCount + 1).padStart(3, "0");
  return `${prefix}-${yearMonth}-${sequentialNumber}`;
}

/**
 * Airport-route heuristic. Not a hard rule — partners enter free-text
 * pickup/dropoff addresses, so we look for common airport tokens in
 * either address to trigger the flight-number requirement. Kept
 * intentionally loose to catch "RUH Airport", "KAIA T1", etc.
 */
function looksLikeAirport(pickup: string, dropoff: string): boolean {
  const s = `${pickup} ${dropoff}`.toLowerCase();
  return /\b(airport|intl|international|terminal|kaia|ruh|jed|med)\b/.test(s);
}

/**
 * Split a VAT-inclusive total into base + VAT, rounded to 2dp.
 * Used both to derive booking pricing columns AND to preview on the
 * partner form.
 */
function splitVatInclusive(total: number): {
  basePrice: number;
  vatAmount: number;
  totalPrice: number;
} {
  const base = Math.round((total / (1 + VAT_RATE)) * 100) / 100;
  const vat = Math.round((total - base) * 100) / 100;
  const totalRounded = Math.round(total * 100) / 100;
  return { basePrice: base, vatAmount: vat, totalPrice: totalRounded };
}

// ============== CREATE BOOKING ==============

/**
 * POST /api/v1/partner/book-ride
 *
 * Body shape:
 *   guestName, guestPhone, guestEmail? — customer info
 *   tripType — "ONE_WAY" | "HOURLY"
 *   city — City.code (e.g. RIYADH)
 *   vehicleClass — VehicleClass enum
 *   pickupAddress, dropoffAddress, pickupLat/Lng?, dropoffLat/Lng?
 *   tripDate (ISO), tripTime (HH:MM)
 *   hours? — required for HOURLY
 *   passengers?, luggage?, childSeat?
 *   flightNumber?, terminalNo?, terminalLocation? — if airport
 *   totalPrice — the ONLY money field the partner supplies
 *                (VAT-inclusive; base + VAT computed here)
 *   notes?
 *
 * Business rules enforced server-side:
 *   • City exists and is active
 *   • Vehicle class allowed in city (ELECTRIC needs city.electricEnabled,
 *     ULTRA_LUXURY needs city.ultraLuxuryEnabled)
 *   • Passenger count within class cap
 *   • Trip date not in the past
 *   • Total price within sanity bounds
 *   • Flight number required when pickup/dropoff mentions "airport"
 */
export const createBooking = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    await requireApprovedAndDocsValid(partner);

    const {
      guestName,
      guestPhone,
      guestEmail,
      tripType,
      city,
      vehicleClass,
      pickupAddress,
      pickupLat,
      pickupLng,
      dropoffAddress,
      dropoffLat,
      dropoffLng,
      tripDate,
      tripTime,
      hours: hoursFromBody,
      passengers,
      flightNumber,
      terminalNo,
      terminalLocation,
      totalPrice: totalPriceFromBody,
      notes,
    } = req.body ?? {};

    // ---------- Required-field validation ----------
    if (!guestName?.trim()) throw new BadRequestError("Guest name is required");
    if (!guestPhone?.trim())
      throw new BadRequestError("Guest phone is required");
    if (!["ONE_WAY", "HOURLY"].includes(tripType)) {
      throw new BadRequestError("tripType must be ONE_WAY or HOURLY");
    }
    if (!city) throw new BadRequestError("City is required");
    if (!vehicleClass) throw new BadRequestError("Vehicle class is required");
    if (!pickupAddress?.trim())
      throw new BadRequestError("Pickup address is required");
    if (tripType === "ONE_WAY" && !dropoffAddress?.trim()) {
      throw new BadRequestError(
        "Drop-off address is required for one-way bookings",
      );
    }
    if (!tripDate) throw new BadRequestError("Trip date is required");
    if (!tripTime?.trim()) throw new BadRequestError("Trip time is required");

    // ---------- City validity ----------
    const cityRow = await prisma.city.findUnique({ where: { code: city } });
    if (!cityRow) throw new BadRequestError(`Unknown city "${city}".`);
    if (!cityRow.isActive) {
      throw new BadRequestError(
        `${cityRow.name} is not currently available for booking.`,
      );
    }

    // ---------- Vehicle-class validity for city ----------
    if (!(vehicleClass in VEHICLE_MAX_PASSENGERS)) {
      throw new BadRequestError(`Unknown vehicle class "${vehicleClass}".`);
    }
    if (vehicleClass === "ELECTRIC" && !cityRow.electricEnabled) {
      throw new BadRequestError(
        `Electric vehicles are not available in ${cityRow.name}.`,
      );
    }
    if (vehicleClass === "ULTRA_LUXURY" && !cityRow.ultraLuxuryEnabled) {
      throw new BadRequestError(
        `Ultra Luxury vehicles are not available in ${cityRow.name}.`,
      );
    }

    // ---------- Passenger count ----------
    const maxPassengers = VEHICLE_MAX_PASSENGERS[vehicleClass];
    const requestedPassengers = Number(passengers) || maxPassengers;
    if (requestedPassengers < 1) {
      throw new BadRequestError("At least 1 passenger is required.");
    }
    if (requestedPassengers > maxPassengers) {
      // Human-friendly label — the raw enum value like ULTRA_LUXURY
      // doesn't read well in an error toast to a partner.
      const label = VEHICLE_CLASS_LABELS[vehicleClass] || vehicleClass;
      throw new BadRequestError(
        `Too many passengers for ${label}. This vehicle class seats ${maxPassengers} passenger${maxPassengers === 1 ? "" : "s"} — you selected ${requestedPassengers}. Please reduce the passenger count or pick a larger vehicle class.`,
      );
    }

    // ---------- Hours (HOURLY only) ----------
    let hours: number | null = null;
    let hourlyDuration: string | null = null;
    if (tripType === "HOURLY") {
      const parsed = Number(hoursFromBody);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new BadRequestError(
          "hours is required and must be a positive number for hourly bookings.",
        );
      }
      hours = parsed;
      hourlyDuration = `${parsed} hour${parsed === 1 ? "" : "s"}`;
    }

    // ---------- Trip date not in the past ----------
    const tripDateObj = new Date(tripDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (tripDateObj < today) {
      throw new BadRequestError("Trip date cannot be in the past.");
    }

    // ---------- Total price ----------
    const totalPriceNum = Number(totalPriceFromBody);
    if (!Number.isFinite(totalPriceNum)) {
      throw new BadRequestError("Total price is required.");
    }
    if (totalPriceNum < MIN_TOTAL_PRICE || totalPriceNum > MAX_TOTAL_PRICE) {
      throw new BadRequestError(
        `Total price must be between SAR ${MIN_TOTAL_PRICE} and SAR ${MAX_TOTAL_PRICE}.`,
      );
    }
    const { basePrice, vatAmount, totalPrice } =
      splitVatInclusive(totalPriceNum);

    // ---------- Airport heuristic → flight number required ----------
    const isAirport = looksLikeAirport(
      pickupAddress,
      dropoffAddress || pickupAddress,
    );
    if (isAirport && !flightNumber?.trim()) {
      throw new BadRequestError(
        "Flight number is required for airport bookings.",
      );
    }

    // ---------- Create booking ----------
    const booking = await prisma.booking.create({
      data: {
        bookingRef: await generateBookingRef("PARTNER", partner.companyName),
        // Opaque token for the public /trip/{token} card. 128 bits of
        // entropy — non-guessable even by a determined enumerator.
        shareToken: crypto.randomUUID(),

        partnerId: partner.id,
        source: "PARTNER",

        // Customer
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail?.trim() || null,

        // Trip
        tripType: tripType as any,
        city: cityRow.code,
        // `route` is now optional / cosmetic — under partner-priced
        // bookings there is no admin-defined route to reference.
        // Kept nullable on the model; leaving null here.
        route: null,
        hours,
        hourlyDuration,

        // Locations
        pickupAddress: pickupAddress.trim(),
        pickupLat: pickupLat || null,
        pickupLng: pickupLng || null,
        dropoffAddress: (dropoffAddress || pickupAddress).trim(),
        dropoffLat: dropoffLat || null,
        dropoffLng: dropoffLng || null,

        // Airport (only when heuristic matched)
        flightNumber: isAirport ? flightNumber?.trim() || null : null,
        terminalNo: isAirport ? terminalNo?.trim() || null : null,
        terminalLocation: isAirport ? terminalLocation?.trim() || null : null,

        // Schedule
        tripDate: tripDateObj,
        tripTime: tripTime.trim(),

        // Vehicle
        vehicleClass: vehicleClass as any,
        passengers: requestedPassengers,

        // Pricing — partner-set, VAT-inclusive split. Peak multiplier
        // hard-coded to 1.00 for partner bookings (peak is a future
        // customer/B2C concept).
        basePrice,
        peakMultiplier: 1.0,
        vatAmount,
        totalPrice,

        status: "PENDING",
        notes: notes?.trim() || null,

        // Admin attention flags — untouched from prior behavior.
        isReadByAdmin: false,
        needsAttention: true,
        attentionReason: "New partner booking — needs vendor assignment",
        attentionAt: new Date(),
      },
    });

    // ---------- Admin notifications ----------
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "New Partner Booking",
          message: `${partner.companyName} booked a ${vehicleClass} ride for ${guestName} on ${tripDateObj.toLocaleDateString()} in ${cityRow.name}`,
          type: "PARTNER_BOOKING_CREATED",
          data: {
            bookingId: booking.id,
            bookingRef: booking.bookingRef,
            partnerId: partner.id,
          },
        })),
      });

      // Fire-and-forget admin email. Failure never blocks the booking
      // flow — the lib logs internally. See renderAdminShell in
      // src/lib/email.ts for the layout.
      sendBookingCreatedAdminEmail({
        bookingRef: booking.bookingRef,
        guestName: booking.guestName,
        guestPhone: booking.guestPhone,
        partnerCompanyName: partner.companyName,
        vehicleClass,
        passengers: booking.passengers,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        totalPrice: Number(booking.totalPrice),
      }).catch((err) => {
        console.error("[email] sendBookingCreatedAdminEmail failed:", err);
      });
    }

    // ---------- Audit ----------
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_BOOKING_CREATED",
        entity: "Booking",
        entityId: booking.id,
        changes: {
          bookingRef: booking.bookingRef,
          partnerCompany: partner.companyName,
          guestName,
          city: cityRow.code,
          tripType,
          vehicleClass,
          totalPrice,
        },
      },
    });

    res.json({
      success: true,
      data: {
        id: booking.id,
        bookingRef: booking.bookingRef,
        status: booking.status,
        totalPrice,
      },
    });
  },
);

// ============== GET BOOKING DETAIL ==============

/**
 * GET /api/v1/partner/book-ride/:bookingId
 * Partner's own booking detail view.
 */
export const getBookingDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const { bookingId } = req.params;

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, partnerId: partner.id },
      include: {
        vendor: { select: { companyName: true } },
        driver: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
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

    // Partner-facing wording masks the PENDING / ASSIGNMENT_OFFERED /
    // ASSIGNMENT_RE_OFFERED triplet as one "awaiting" state — partners
    // don't see the internal vendor-offer cycle.
    const statusLabels: Record<string, string> = {
      PENDING: "Awaiting Driver/Vehicle Assignment",
      ASSIGNMENT_OFFERED: "Awaiting Driver/Vehicle Assignment",
      ASSIGNMENT_RE_OFFERED: "Awaiting Driver/Vehicle Assignment",
      CONFIRMED: "Confirmed",
      IN_PROGRESS: "In Progress",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
    };

    res.json({
      success: true,
      data: {
        id: booking.id,
        bookingRef: booking.bookingRef,
        status: booking.status,
        statusLabel: statusLabels[booking.status] || booking.status,
        // Customer
        guestName: booking.guestName,
        guestPhone: booking.guestPhone,
        guestEmail: booking.guestEmail,
        // Trip
        tripType: booking.tripType,
        city: booking.city,
        route: booking.route,
        hours: booking.hours,
        hourlyDuration: booking.hourlyDuration,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        // Airport
        flightNumber: booking.flightNumber,
        terminalNo: (booking as any).terminalNo,
        terminalLocation: (booking as any).terminalLocation,
        // Vehicle
        vehicleClass: booking.vehicleClass,
        passengers: booking.passengers,
        // Pricing — partner set the total; base + VAT are the split
        // stored at booking-create time. peakMultiplier is retained
        // in the API shape for compat, but is always 1.00 for
        // partner bookings post-refactor.
        pricing: {
          basePrice: Number(booking.basePrice),
          peakMultiplier: Number(booking.peakMultiplier),
          vatAmount: Number(booking.vatAmount),
          totalPrice: Number(booking.totalPrice),
        },
        vendor: booking.vendor,
        driver: booking.driver,
        vehicle: booking.vehicle,
        notes: booking.notes,
        createdAt: booking.createdAt,
        confirmedAt: booking.confirmedAt,
        completedAt: booking.completedAt,
      },
    });
  },
);

// ============== CANCEL BOOKING ==============

/**
 * PATCH /api/v1/partner/book-ride/:bookingId/cancel
 * Partner can cancel while awaiting assignment; once a vendor confirms,
 * cancellation goes through the regular admin-involved flow.
 */
export const cancelBooking = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const { bookingId } = req.params;
    const { reason } = req.body ?? {};

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, partnerId: partner.id },
    });
    if (!booking) throw new NotFoundError("Booking");

    const cancellableStatuses = [
      "PENDING",
      "ASSIGNMENT_OFFERED",
      "ASSIGNMENT_RE_OFFERED",
    ];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestError(
        `Cannot cancel a booking with status "${booking.status}". Only bookings awaiting driver/vehicle assignment can be cancelled by the partner.`,
      );
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        // "client" (neutral) rather than "partner" — the vendor-visible
        // note shouldn't leak the partner channel. Admin sees the full
        // partner attribution through the admin notification below.
        notes: reason
          ? `${booking.notes ? booking.notes + " | " : ""}Cancelled by client: ${reason}`
          : booking.notes,
      },
    });

    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Booking Cancelled by Partner",
          message: `${partner.companyName} cancelled booking ${booking.bookingRef}${reason ? ` — Reason: ${reason}` : ""}`,
          type: "PARTNER_BOOKING_CANCELLED",
          data: { bookingId, bookingRef: booking.bookingRef },
        })),
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_BOOKING_CANCELLED",
        entity: "Booking",
        entityId: bookingId,
        changes: { bookingRef: booking.bookingRef, reason },
      },
    });

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      data: {
        id: updated.id,
        bookingRef: updated.bookingRef,
        status: updated.status,
      },
    });
  },
);

// End of file — all exports are declared above.
