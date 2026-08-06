// ============================================
// !!! DESTINATION PATH: apps/server/src/lib/booking-modification.service.ts
// ============================================
// The engine behind partner/admin booking modifications. Both the
// partner controller and the admin controller are thin wrappers that
// handle their own auth/ownership/lead-time gating, then delegate here.
//
// This module owns the parts that MUST be identical across actors:
//   - validating + coercing the incoming patch (whitelisted fields only)
//   - re-pricing (partner-priced model: re-split the VAT-inclusive total)
//   - the vendor-consent decision (the state-machine branch)
//   - persisting the BookingModification + booking update in one txn
//   - the cross-portal intimations (in-app + email) and the audit row
//
// The state-machine branch, in one place:
//   actor = ADMIN            -> NOT_REQUIRED (authoritative; vendor only informed)
//   actor = PARTNER, PENDING -> NOT_REQUIRED (no vendor yet)
//   actor = PARTNER, OFFERED -> PENDING (vendor decides via existing offer flow)
//   actor = PARTNER, CONFIRMED -> PENDING (vendor must re-consent; resolved in Step 3)

import { prisma } from "./prisma";
import { Prisma } from "../../generated/prisma/client";
import { BadRequestError, NotFoundError } from "../utils/AppError";
import {
  BOOKING_MODIFIABLE_FIELDS,
  buildBookingDiff,
  diffAffectsAssignment,
  type FieldDiff,
} from "../utils/helpers/booking-modification.helpers";
import { splitVatInclusive } from "../utils/helpers/pricing.helpers";
import {
  sendBookingModifiedAdminEmail,
  sendBookingModifiedVendorEmail,
} from "./email";

// Runtime value sets — defined locally rather than imported from the
// generated enum so validation never depends on the enum being emitted
// as a runtime object.
const VALID_VEHICLE_CLASSES = new Set([
  "ECONOMY_SEDAN",
  "BUSINESS_SEDAN",
  "BUSINESS_SUV",
  "FIRST_CLASS",
  "ELECTRIC",
  "ULTRA_LUXURY",
  "HIACE",
  "COASTER",
  "KING_LONG",
]);
const VALID_TRIP_TYPES = new Set(["ONE_WAY", "HOURLY"]);

// Booking states in which a PARTNER may modify. Admin bypasses this.
export const PARTNER_MODIFIABLE_STATUSES = new Set([
  "PENDING",
  "ASSIGNMENT_OFFERED",
  "ASSIGNMENT_RE_OFFERED",
  "CONFIRMED",
]);
const VENDOR_CONSENT_STATUSES = new Set([
  "ASSIGNMENT_OFFERED",
  "ASSIGNMENT_RE_OFFERED",
  "CONFIRMED",
]);

type Actor = "PARTNER" | "ADMIN";

interface CurrentVendor {
  id: string;
  userId: string;
  companyName: string;
  email: string | null;
}

export interface ModifyResult {
  bookingId: string;
  bookingRef: string;
  diff: FieldDiff[];
  vendorInvolved: boolean;
  requiresVendorConsent: boolean;
  affectsAssignment: boolean;
}

// ------------------------------------------------------------------
// Fetch with the relations the engine needs. The soft-delete extension
// makes this return null for a deleted booking, so callers get NotFound.
// ------------------------------------------------------------------
export async function fetchBookingForModification(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      partner: { select: { id: true, userId: true, companyName: true } },
      vendor: {
        select: {
          id: true,
          userId: true,
          companyName: true,
          contactEmail: true,
          user: { select: { email: true } },
        },
      },
      // The live offer identifies the vendor for a booking that has been
      // offered but not yet accepted (booking.vendorId is only set on
      // acceptance).
      assignmentOffers: {
        where: { status: "PENDING" },
        take: 1,
        select: {
          vendor: {
            select: {
              id: true,
              userId: true,
              companyName: true,
              contactEmail: true,
              user: { select: { email: true } },
            },
          },
        },
      },
    },
  });
}

type BookingForModification = NonNullable<
  Awaited<ReturnType<typeof fetchBookingForModification>>
>;

// ------------------------------------------------------------------
// Validate + coerce the incoming patch. Returns the DB-ready column
// patch AND a "comparable" map (user-meaningful values keyed by the
// modifiable field name) used to build the before/after diff.
// ------------------------------------------------------------------
async function sanitizeBookingPatch(
  raw: Record<string, unknown>,
  booking: BookingForModification,
): Promise<{
  dbPatch: Record<string, unknown>;
  comparablePatch: Record<string, unknown>;
  before: Record<string, unknown>;
}> {
  const dbPatch: Record<string, unknown> = {};
  const comparablePatch: Record<string, unknown> = {};

  const keys = Object.keys(raw).filter((k) => k in BOOKING_MODIFIABLE_FIELDS);
  if (keys.length === 0) {
    throw new BadRequestError("No modifiable fields supplied.");
  }

  for (const key of keys) {
    const value = raw[key];

    switch (key) {
      case "tripType": {
        const v = String(value);
        if (!VALID_TRIP_TYPES.has(v)) {
          throw new BadRequestError(`Invalid trip type: ${v}`);
        }
        dbPatch.tripType = v;
        comparablePatch.tripType = v;
        break;
      }
      case "vehicleClass": {
        const v = String(value);
        if (!VALID_VEHICLE_CLASSES.has(v)) {
          throw new BadRequestError(`Invalid vehicle class: ${v}`);
        }
        dbPatch.vehicleClass = v;
        comparablePatch.vehicleClass = v;
        break;
      }
      case "city": {
        const code = String(value);
        const city = await prisma.city.findFirst({ where: { code } });
        if (!city) {
          throw new BadRequestError(`Unknown city: ${code}`);
        }
        dbPatch.city = code;
        comparablePatch.city = code;
        break;
      }
      case "tripDate": {
        const d = new Date(value as string);
        if (Number.isNaN(d.getTime())) {
          throw new BadRequestError("Invalid trip date.");
        }
        dbPatch.tripDate = d;
        comparablePatch.tripDate = d;
        break;
      }
      case "tripTime": {
        const v = String(value);
        if (!/^\d{1,2}:\d{2}$/.test(v)) {
          throw new BadRequestError("Invalid trip time (expected HH:MM).");
        }
        dbPatch.tripTime = v;
        comparablePatch.tripTime = v;
        break;
      }
      case "hours": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          throw new BadRequestError("Hours must be a positive whole number.");
        }
        dbPatch.hours = n;
        comparablePatch.hours = n;
        break;
      }
      case "passengers": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          throw new BadRequestError("Passengers must be at least 1.");
        }
        dbPatch.passengers = n;
        comparablePatch.passengers = n;
        break;
      }
      case "luggage": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) {
          throw new BadRequestError("Luggage must be zero or more.");
        }
        dbPatch.luggage = n;
        comparablePatch.luggage = n;
        break;
      }
      case "childSeat": {
        const b = Boolean(value);
        dbPatch.childSeat = b;
        comparablePatch.childSeat = b;
        break;
      }
      case "totalPrice": {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) {
          throw new BadRequestError("Total price must be greater than zero.");
        }
        if (n > 1_000_000) {
          throw new BadRequestError("Total price exceeds the allowed ceiling.");
        }
        const split = splitVatInclusive(n);
        dbPatch.basePrice = split.basePrice;
        dbPatch.vatAmount = split.vatAmount;
        dbPatch.totalPrice = split.totalPrice;
        comparablePatch.totalPrice = split.totalPrice;
        break;
      }
      // Free-text / nullable string fields.
      case "route":
      case "pickupAddress":
      case "dropoffAddress":
      case "flightNumber":
      case "terminalNo":
      case "terminalLocation":
      case "hourlyDuration":
      case "notes": {
        const v = value == null || value === "" ? null : String(value).trim();
        dbPatch[key] = v;
        comparablePatch[key] = v;
        break;
      }
      default:
        break;
    }
  }

  // Cross-field guard: an HOURLY trip needs an hours value (from the
  // patch or already on the booking).
  const resultingTripType = (dbPatch.tripType as string) ?? booking.tripType;
  const resultingHours =
    dbPatch.hours !== undefined ? (dbPatch.hours as number) : booking.hours;
  if (resultingTripType === "HOURLY" && !resultingHours) {
    throw new BadRequestError("Hourly bookings require an hours value.");
  }

  // Enforce city-gated classes (mirror createBooking): ELECTRIC and
  // ULTRA_LUXURY are only bookable where an admin has enabled them for the
  // city. Only checked when the class or city is actually changing, so an
  // existing grandfathered booking isn't blocked on unrelated edits.
  const resultingClass =
    (dbPatch.vehicleClass as string) ?? booking.vehicleClass;
  const resultingCityCode = (dbPatch.city as string) ?? booking.city;
  if (
    (dbPatch.vehicleClass !== undefined || dbPatch.city !== undefined) &&
    (resultingClass === "ELECTRIC" || resultingClass === "ULTRA_LUXURY")
  ) {
    const cityRow = await prisma.city.findFirst({
      where: { code: resultingCityCode },
    });
    const enabled =
      resultingClass === "ELECTRIC"
        ? cityRow?.electricEnabled
        : cityRow?.ultraLuxuryEnabled;
    if (!enabled) {
      const label = resultingClass === "ELECTRIC" ? "Electric" : "Ultra Luxury";
      throw new BadRequestError(
        `${label} vehicles aren't available in ${
          cityRow?.name ?? resultingCityCode
        }. Ask admin to enable them first.`,
      );
    }
  }

  // Build the `before` snapshot for the diff, keyed by the same
  // comparable field names.
  const bookingRecord = booking as unknown as Record<string, unknown>;
  const before: Record<string, unknown> = {};
  for (const key of Object.keys(comparablePatch)) {
    before[key] = bookingRecord[key];
  }

  // Pass-through pickup/drop-off coordinates: written alongside an
  // address change so routing stays accurate, but deliberately kept OUT
  // of the diff (they're derived values, not user-facing changes).
  for (const cf of ["pickupLat", "pickupLng", "dropoffLat", "dropoffLng"]) {
    const v = raw[cf];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) dbPatch[cf] = n;
    }
  }

  return { dbPatch, comparablePatch, before };
}

// ------------------------------------------------------------------
// Core entry point.
// ------------------------------------------------------------------
export async function applyBookingModification(params: {
  bookingId: string;
  rawPatch: Record<string, unknown>;
  actor: Actor;
  actorUserId: string;
  actorLabel: string;
  reason?: string;
  // Ownership guard for partner callers — the booking must belong to
  // this partner. Omit for admin.
  expectedPartnerId?: string;
  ip?: string;
  userAgent?: string;
}): Promise<ModifyResult> {
  const booking = await fetchBookingForModification(params.bookingId);
  if (!booking) throw new NotFoundError("Booking");

  if (
    params.expectedPartnerId &&
    booking.partnerId !== params.expectedPartnerId
  ) {
    // Don't leak existence of a booking the partner doesn't own.
    throw new NotFoundError("Booking");
  }

  const { dbPatch, comparablePatch, before } = await sanitizeBookingPatch(
    params.rawPatch,
    booking,
  );

  const diff = buildBookingDiff(before, comparablePatch);
  if (diff.length === 0) {
    throw new BadRequestError("No changes detected.");
  }

  // Resolve the current vendor (assigned, or the one holding a live offer).
  const offerVendor = booking.assignmentOffers[0]?.vendor;
  const rawVendor = booking.vendor ?? offerVendor ?? null;
  const currentVendor: CurrentVendor | null = rawVendor
    ? {
        id: rawVendor.id,
        userId: rawVendor.userId,
        companyName: rawVendor.companyName,
        email: rawVendor.contactEmail ?? rawVendor.user?.email ?? null,
      }
    : null;

  const vendorInvolved = currentVendor !== null;

  const affectsAssignment = vendorInvolved && diffAffectsAssignment(diff);

  // The state-machine branch.
  //
  // A partner change to a booking the vendor has already committed to
  // (offered or confirmed) goes back to that vendor for consent — the
  // Two paths for a change to a booking a vendor already holds:
  //   - Assignment-affecting (vehicle class / city): the vendor was
  //     matched for the OLD class/city, so the booking is released back
  //     to admin for reassignment — it "leaves" the vendor. The vendor
  //     is told, and pointed at admin (with the support number) to have
  //     it reassigned.
  //   - Any other change (time, pickup, price, ...): the vendor keeps
  //     the booking and is asked to re-consent (accept / reject).
  let vendorDecision: "NOT_REQUIRED" | "PENDING";
  if (params.actor === "ADMIN") {
    vendorDecision = "NOT_REQUIRED";
  } else if (
    VENDOR_CONSENT_STATUSES.has(booking.status) &&
    vendorInvolved &&
    !affectsAssignment
  ) {
    vendorDecision = "PENDING";
  } else {
    vendorDecision = "NOT_REQUIRED";
  }
  const requiresVendorConsent = vendorDecision === "PENDING";

  // The change invalidated the vendor match (class/city) → release the
  // booking: void the live offer and return it to PENDING for admin
  // reassignment.
  const assignmentReleased = affectsAssignment;

  const summary = diff
    .slice(0, 3)
    .map((d) => d.label)
    .join(", ");
  const attentionReason = `Modified by ${
    params.actor === "ADMIN" ? "admin" : "partner"
  }: ${summary}${diff.length > 3 ? "\u2026" : ""}`;

  // Persist modification + booking update atomically.
  await prisma.$transaction([
    prisma.bookingModification.create({
      data: {
        bookingId: booking.id,
        actor: params.actor,
        actorUserId: params.actorUserId,
        // JSON column — FieldDiff values are normalised to JSON primitives.
        changedFields: diff as unknown as Prisma.InputJsonValue,
        reason: params.reason ?? null,
        vendorDecision,
      },
    }),
    // Assignment-invalidating change → void the live offer so it stops
    // holding the vendor / blocking reassignment. Cancel the ACCEPTED
    // offer too (not just an outstanding PENDING one) — a confirmed
    // booking's offer is ACCEPTED, and leaving it uncancelled is why the
    // booking still read as "vendor assigned". CANCELLED (not REJECTED)
    // keeps the vendor eligible if admin re-offers them.
    ...(assignmentReleased
      ? [
          prisma.bookingAssignmentOffer.updateMany({
            where: {
              bookingId: booking.id,
              status: { in: ["PENDING", "ACCEPTED"] },
            },
            data: { status: "CANCELLED" },
          }),
        ]
      : []),
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        ...dbPatch,
        modifiedAt: new Date(),
        modificationCount: { increment: 1 },
        needsAttention: true,
        attentionReason,
        isReadByAdmin: false,
        // Unseen-update glow for whichever party didn't make the change.
        // (The internal category-upgrade authorization is a separate write
        // path, so this only fires on real trip changes the party sees.)
        // Actor is only ever PARTNER or ADMIN here, so any vendor on the
        // booking is always a "didn't make the change" party.
        ...(params.actor !== "PARTNER" ? { isReadByPartner: false } : {}),
        ...(vendorInvolved ? { isReadByVendor: false } : {}),
        // Re-raise the "trip changed" badge on the vendor portal.
        ...(vendorInvolved ? { modificationVendorSeenAt: null } : {}),
        // Release from the vendor for reassignment when the change
        // invalidated the match.
        ...(assignmentReleased
          ? {
              status: "PENDING",
              vendorId: null,
              vehicleId: null,
              driverId: null,
              temporaryDriverId: null,
              temporaryVehicleId: null,
              // No longer confirmed — clearing this stops the timeline
              // from still showing "Vendor Accepted" after the release.
              confirmedAt: null,
            }
          : {}),
      },
    }),
  ]);

  await dispatchIntimations({
    booking,
    actor: params.actor,
    actorLabel: params.actorLabel,
    diff,
    currentVendor,
    requiresVendorConsent,
    assignmentReleased,
    reason: params.reason,
    ip: params.ip,
    userAgent: params.userAgent,
    actorUserId: params.actorUserId,
  });

  return {
    bookingId: booking.id,
    bookingRef: booking.bookingRef,
    diff,
    vendorInvolved,
    requiresVendorConsent,
    affectsAssignment,
  };
}

// ------------------------------------------------------------------
// Notifications (in-app), emails (fire-and-forget), and the audit row.
// Routing:
//   PARTNER change -> admins + the vendor (if any)
//   ADMIN change   -> the partner + the vendor (if any)
// ------------------------------------------------------------------
// Admin support line shown to a vendor when their booking is released
// back to admin after an assignment-invalidating change, so they know
// exactly who to contact to have it reassigned.
const SUPPORT_WHATSAPP = process.env.SUPPORT_WHATSAPP ?? "+966 54 555 9510";

async function dispatchIntimations(args: {
  booking: BookingForModification;
  actor: Actor;
  actorLabel: string;
  diff: FieldDiff[];
  currentVendor: CurrentVendor | null;
  requiresVendorConsent: boolean;
  assignmentReleased: boolean;
  reason?: string;
  ip?: string;
  userAgent?: string;
  actorUserId: string;
}) {
  const {
    booking,
    actor,
    actorLabel,
    diff,
    currentVendor,
    requiresVendorConsent,
    assignmentReleased,
  } = args;

  const changedForEmail = diff.map((d) => ({
    label: d.label,
    from: formatValue(d.from),
    to: formatValue(d.to),
  }));
  const summary = diff.map((d) => d.label).join(", ");

  const inApp: Array<{
    userId: string;
    title: string;
    message: string;
    type: string;
    data: Prisma.InputJsonValue;
  }> = [];

  const baseData: Prisma.InputJsonObject = {
    bookingId: booking.id,
    bookingRef: booking.bookingRef,
    changedFields: diff as unknown as Prisma.InputJsonValue,
  };

  if (actor === "PARTNER") {
    // Intimate all admins.
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    for (const a of admins) {
      inApp.push({
        userId: a.id,
        title: "Booking modified",
        message: `${actorLabel} modified ${booking.bookingRef} (${summary})`,
        type: "BOOKING_MODIFIED",
        data: baseData,
      });
    }
    // Admin email.
    sendBookingModifiedAdminEmail({
      bookingRef: booking.bookingRef,
      actorLabel,
      changedFields: changedForEmail,
      requiresVendorConsent,
      pickupAddress: booking.pickupAddress,
      dropoffAddress: booking.dropoffAddress,
    }).catch((err) =>
      console.error("[email] sendBookingModifiedAdminEmail failed:", err),
    );
  } else {
    // ADMIN change -> tell the partner.
    if (booking.partner?.userId) {
      inApp.push({
        userId: booking.partner.userId,
        title: "Booking updated by LuxDrive",
        message: `Admin updated ${booking.bookingRef} (${summary})`,
        type: "BOOKING_MODIFIED",
        data: baseData,
      });
    }
  }

  // Vendor (present for both actors when a vendor is involved).
  if (currentVendor) {
    inApp.push({
      userId: currentVendor.userId,
      title: assignmentReleased
        ? "Booking reassigned \u2014 details changed"
        : requiresVendorConsent
          ? "Trip changed \u2014 action needed"
          : "Trip details updated",
      message: assignmentReleased
        ? `${booking.bookingRef} changed (${summary}) and can no longer be served from your current assignment, so it has been unassigned. Contact admin on WhatsApp ${SUPPORT_WHATSAPP} to have it reassigned.`
        : requiresVendorConsent
          ? `${booking.bookingRef} changed (${summary}). Please accept or reject.`
          : `${booking.bookingRef} was updated (${summary}).`,
      type: assignmentReleased
        ? "BOOKING_RELEASED_AFTER_CHANGE"
        : requiresVendorConsent
          ? "BOOKING_MODIFICATION_VENDOR_REVIEW"
          : "BOOKING_MODIFIED",
      data: {
        ...baseData,
        requiresVendorConsent,
        assignmentReleased,
        ...(assignmentReleased ? { supportWhatsApp: SUPPORT_WHATSAPP } : {}),
      } as Prisma.InputJsonValue,
    });
    if (currentVendor.email) {
      sendBookingModifiedVendorEmail({
        to: currentVendor.email,
        bookingRef: booking.bookingRef,
        actorLabel,
        changedFields: changedForEmail,
        requiresVendorConsent,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
      }).catch((err) =>
        console.error("[email] sendBookingModifiedVendorEmail failed:", err),
      );
    }
  }

  if (inApp.length > 0) {
    // One unread change-notification per booking per user: drop any earlier
    // unread ones for this booking before adding the new one, so repeated
    // modifications don't stack up in the sidebar count.
    const recipientIds = [...new Set(inApp.map((n: any) => n.userId))];
    await prisma.notification.deleteMany({
      where: {
        userId: { in: recipientIds },
        isRead: false,
        type: { in: ["BOOKING_MODIFIED", "BOOKING_ASSIGNMENT_UPDATED"] },
        data: { path: ["bookingId"], equals: booking.id },
      },
    });
    await prisma.notification.createMany({ data: inApp });
  }

  await prisma.auditLog.create({
    data: {
      userId: args.actorUserId,
      action:
        actor === "ADMIN"
          ? "ADMIN_BOOKING_MODIFIED"
          : "PARTNER_BOOKING_MODIFIED",
      entity: "Booking",
      entityId: booking.id,
      changes: {
        changedFields: diff as unknown as Prisma.InputJsonValue,
        reason: args.reason ?? null,
        requiresVendorConsent,
        vendorId: currentVendor?.id ?? null,
      } as Prisma.InputJsonValue,
      ip: args.ip ?? null,
      userAgent: args.userAgent ?? null,
    },
  });
}

function formatValue(v: unknown): string {
  if (v == null || v === "") return "\u2014";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    // ISO date -> readable date
    return new Date(v).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  return String(v);
}
