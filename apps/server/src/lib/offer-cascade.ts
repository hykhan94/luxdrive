// ============================================
// apps/server/src/lib/offer-cascade.ts
//
// Vendor eligibility + auto-cascade engine for the booking-offer
// state machine.
//
// Two responsibilities, kept in one module because they share their
// trickiest piece (the eligibility filter):
//
//   1. findEligibleVendors(bookingId)
//      Returns vendors who could plausibly take the booking, sorted by
//      total completed bookings (desc, tie-broken by Vendor.createdAt
//      asc). Used by the admin's "Available Vendors" panel.
//
//      Eligibility means ALL of:
//        - Vendor status = APPROVED
//        - Vendor has not rejected this specific booking previously
//          (any prior REJECTED offer row for (booking, vendor) blocks)
//        - Vendor's required profile docs (CR, VAT, Chamber, Balady,
//          National-Address, IBAN-Letter) are all valid through the
//          trip date
//        - Vendor has at least one active vehicle of the booking's
//          vehicleClass whose docs are all valid through trip date
//        - Vendor has at least one active driver whose docs are all
//          valid through trip date
//
//      "Valid through trip date" = strict `tripDate < doc.expiryDate`.
//      No buffer, per requirement: a vendor whose insurance expires at
//      midnight Friday can take a Friday-morning trip but not a
//      Friday-evening trip.
//
//   2. cascadeToNextVendor(bookingId, options)
//      Finds the next eligible vendor and creates an ASSIGNMENT_OFFERED
//      offer row at attemptNumber=1. If no eligible vendor remains,
//      sets the booking to CANCELLED, notifies partner, and returns
//      null. Auto-called from vendor reject paths so admin doesn't
//      have to manually pick the next vendor every time.
//
//      Required option: `payoutAmount` (Decimal) — the per-booking
//      amount admin is offering. The cascade itself can't invent a
//      number; if you're auto-cascading after a non-PRICE rejection
//      the cascade preserves the original payoutAmount of the rejected
//      offer. The caller passes that in.
// ============================================

import { prisma } from "./prisma";
import {
  notifyVendorOfOffer,
  notifyPartnerOfCancellation,
} from "./offer-notifications";

// Required vendor profile document types. Matches the set used in
// requireApprovedAndDocsValid + the vendor profile pages.
// Vendor profile doc types that are required to mark a vendor as fully
// onboarded. Names MUST match the VendorDocument.type strings written
// by vendor/profile.controller.ts and admin/vendor.controller.ts —
// previously this file used long names ("COMMERCIAL_REGISTRATION",
// "VAT_CERTIFICATE", "BALADY_LICENSE") that didn't exist in the
// database, so the find() at line ~196 always returned undefined and
// no vendor ever passed the profile-doc check (every booking ended up
// with zero eligible vendors).
const REQUIRED_VENDOR_DOC_TYPES = [
  "CR",
  "VAT",
  "CHAMBER_OF_COMMERCE",
  "BALADY",
  "NATIONAL_ADDRESS",
  "IBAN_LETTER",
];

// Subset of required vendor docs that carry an expiry date. The other
// required types (VAT, NATIONAL_ADDRESS, IBAN_LETTER) are issued once
// and stored with `expiryDate: null` by design. Mirrors the
// DOCS_WITH_EXPIRY list in vendor/profile.controller.ts — kept as a
// duplicate constant rather than imported so this lib stays free of
// inbound deps from controllers.
const VENDOR_DOCS_REQUIRING_EXPIRY = new Set([
  "CR",
  "CHAMBER_OF_COMMERCE",
  "BALADY",
]);

export interface EligibleVendor {
  id: string;
  companyName: string;
  rating: number | null;
  completedBookingsCount: number;
  vehicleCount: number;
  driverCount: number;
  createdAt: Date;
}

// Combines tripDate + tripTime ("HH:mm" string) into a single Date for
// comparison. tripTime is stored as a string per current schema.
function combineTripDateAndTime(tripDate: Date, tripTime: string | null): Date {
  if (!tripTime) return new Date(tripDate);
  const [hh, mm] = tripTime.split(":").map((s) => parseInt(s, 10));
  const result = new Date(tripDate);
  if (!isNaN(hh)) result.setHours(hh);
  if (!isNaN(mm)) result.setMinutes(mm);
  return result;
}

/**
 * Returns vendors eligible to take this booking, sorted by completed
 * booking count (desc) with createdAt (asc) tiebreaker.
 *
 * The filtering happens in two passes:
 *   (a) Prisma query with the cheap filters (status, no prior rejection,
 *       has a vehicle of the right class, has a driver). This gets the
 *       candidate pool.
 *   (b) JS pass with the expensive filter (doc expiry vs trip date) —
 *       we have to load each candidate's docs anyway to verify.
 *
 * Splitting saves us from a huge Prisma query that would otherwise
 * need 4 nested expiry-date conditions, and lets the doc-expiry rule
 * stay readable.
 */
export async function findEligibleVendors(
  bookingId: string,
): Promise<EligibleVendor[]> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, vehicleClass: true, tripDate: true, tripTime: true },
  });
  if (!booking) return [];

  const tripDateTime = combineTripDateAndTime(
    booking.tripDate,
    booking.tripTime,
  );

  // Vendors who have rejected this booking at any attempt — excluded.
  // Includes both REJECTED-for-PRICE and REJECTED-for-other; the
  // PRICE_TOO_LOW re-offer flow is a separate code path (reOfferBooking
  // controller) that bypasses eligibility for the specific vendor being
  // re-offered.
  const priorRejections = await prisma.bookingAssignmentOffer.findMany({
    where: { bookingId, status: "REJECTED" },
    select: { vendorId: true },
  });
  const rejectedVendorIds = [
    ...new Set(priorRejections.map((r) => r.vendorId)),
  ];

  // Pass (a) — coarse candidate pool from Prisma. Filters that map
  // cleanly to a query: status=APPROVED, not in rejected list, has at
  // least one active vehicle in the right class, has at least one
  // active driver.
  const candidates = await prisma.vendor.findMany({
    where: {
      status: "APPROVED",
      id:
        rejectedVendorIds.length > 0 ? { notIn: rejectedVendorIds } : undefined,
      vehicles: {
        some: {
          category: booking.vehicleClass,
          isActive: true,
          status: "APPROVED",
        },
      },
      drivers: {
        some: { isActive: true, status: "APPROVED" },
      },
    },
    include: {
      // Profile-level doc expiry — need all REQUIRED types valid.
      vendorDocuments: {
        where: { type: { in: REQUIRED_VENDOR_DOC_TYPES } },
        select: { type: true, expiryDate: true },
      },
      // Vehicle docs filtered to category-matching, active, approved
      // vehicles. We then check each vehicle's docs in pass (b).
      vehicles: {
        where: {
          category: booking.vehicleClass,
          isActive: true,
          status: "APPROVED",
        },
        include: {
          documents: { select: { expiryDate: true } },
        },
      },
      drivers: {
        where: { isActive: true, status: "APPROVED" },
        include: {
          documents: { select: { expiryDate: true } },
        },
      },
      _count: {
        select: {
          // Total completed bookings — used for sort key.
          bookings: { where: { status: "COMPLETED" } },
        },
      },
    },
  });

  // Pass (b) — apply doc-expiry rule.
  //
  // Vendor passes only if:
  //   - every REQUIRED profile doc has expiryDate > tripDateTime
  //   - at least one matching vehicle has all its docs valid
  //   - at least one driver has all their docs valid
  // (Note: vehicle and driver don't have to be the SAME pair that the
  // vendor will eventually assign — that's their internal allocation.
  // We just need to confirm the vendor has SOME working pair.)
  const eligible: EligibleVendor[] = [];

  for (const v of candidates) {
    // Profile docs — every REQUIRED type must be uploaded, and the
    // ones that carry expiry (CR / CHAMBER_OF_COMMERCE / BALADY) must
    // still be valid through the trip date. Types without expiry
    // (VAT / NATIONAL_ADDRESS / IBAN_LETTER) only need to exist —
    // their expiryDate column is `null` by design and earlier we
    // were treating that null as "fail" which excluded every vendor.
    const profileExpiryOk = REQUIRED_VENDOR_DOC_TYPES.every((type) => {
      const doc = v.vendorDocuments.find((d) => d.type === type);
      if (!doc) return false; // required and missing → fail
      if (!VENDOR_DOCS_REQUIRING_EXPIRY.has(type)) return true; // no-expiry type → present is enough
      return !!doc.expiryDate && new Date(doc.expiryDate) > tripDateTime;
    });
    if (!profileExpiryOk) continue;

    // At least one vehicle of the right category with all *expiry-bearing*
    // docs valid through trip date. Vehicle docs include photos
    // (PHOTO_FRONT, NUMBER_PLATE_BACK, etc.) and ODOMETER which carry
    // `expiryDate: null` — those docs MUST be allowed to coexist with
    // the expiry-required ones (INSURANCE, ISTIMARA). Previously the
    // .every() required EVERY doc — including photos — to have a
    // future expiryDate, which is impossible: photos have null expiry,
    // so .every() returned false for every uploaded vehicle and no
    // vendor ever surfaced as eligible.
    const validVehicleCount = v.vehicles.filter((veh) =>
      veh.documents.every(
        (d) => !d.expiryDate || new Date(d.expiryDate) > tripDateTime,
      ),
    ).length;
    if (validVehicleCount === 0) continue;

    // At least one driver with all expiry-bearing docs valid. Same
    // null-expiry treatment as vehicles — PROFILE_PHOTO has null expiry
    // and shouldn't disqualify the driver. Real expiry-bearing types
    // here are IQAMA_NATIONAL_ID and DRIVING_LICENSE.
    const validDriverCount = v.drivers.filter((d) =>
      d.documents.every(
        (doc) => !doc.expiryDate || new Date(doc.expiryDate) > tripDateTime,
      ),
    ).length;
    if (validDriverCount === 0) continue;

    eligible.push({
      id: v.id,
      companyName: v.companyName,
      rating: v.rating ? Number(v.rating) : null,
      completedBookingsCount: v._count.bookings,
      vehicleCount: validVehicleCount,
      driverCount: validDriverCount,
      createdAt: v.createdAt,
    });
  }

  // Sort: highest completed-booking count first; tie-break with older
  // vendor (createdAt asc) so the sort is stable across calls.
  eligible.sort((a, b) => {
    if (a.completedBookingsCount !== b.completedBookingsCount) {
      return b.completedBookingsCount - a.completedBookingsCount;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return eligible;
}

export interface CascadeOptions {
  // Per-booking payout amount to carry into the new offer. When
  // cascading after a non-price rejection, pass the rejected offer's
  // payoutAmount through unchanged (admin originally judged that price
  // was reasonable for the booking and only the vendor's availability
  // changed). When cascading after a PRICE_TOO_LOW exhaustion, you
  // could pass a bumped amount — but for now we keep the same number.
  payoutAmount: number;
}

/**
 * Pick the next eligible vendor and offer them the booking.
 *
 * Behavior:
 *   - Finds eligible vendors via findEligibleVendors().
 *   - Takes the first one (highest completedBookingsCount).
 *   - Creates a BookingAssignmentOffer row at attemptNumber=1 (new
 *     vendor's first offer for this booking).
 *   - Sets booking status to ASSIGNMENT_OFFERED, sets vendorId to the
 *     new vendor.
 *   - Fires notification to the vendor.
 *   - Returns the new offer row.
 *
 * If no eligible vendor remains:
 *   - Sets booking status to CANCELLED.
 *   - Sets vendorId to null.
 *   - Fires "your booking has been cancelled" notification to partner
 *     (or customer if it's a direct booking).
 *   - Returns null.
 */
export async function cascadeToNextVendor(
  bookingId: string,
  options: CascadeOptions,
): Promise<{ offerId: string; vendorId: string } | null> {
  const eligible = await findEligibleVendors(bookingId);

  if (eligible.length === 0) {
    // Pool exhausted. Cancel the booking and notify partner.
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        vendorId: null,
        vehicleId: null,
        driverId: null,
        vendorPayoutAmount: null,
        needsAttention: true,
        attentionReason:
          "All eligible vendors rejected — booking auto-cancelled",
        attentionAt: new Date(),
        isReadByAdmin: false,
      },
      include: { partner: { select: { id: true } } },
    });
    await notifyPartnerOfCancellation(updated);
    return null;
  }

  const nextVendor = eligible[0];

  // Create the new offer row + transition booking in one transaction.
  // Array form keeps the typing simple against the project's custom
  // Prisma client.
  const [offer] = await prisma.$transaction([
    prisma.bookingAssignmentOffer.create({
      data: {
        bookingId,
        vendorId: nextVendor.id,
        payoutAmount: options.payoutAmount,
        attemptNumber: 1,
        status: "PENDING",
      },
    }),
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "ASSIGNMENT_OFFERED",
        vendorId: nextVendor.id,
        vehicleId: null, // vendor picks driver+vehicle on accept
        driverId: null,
        vendorPayoutAmount: options.payoutAmount,
        needsAttention: false,
        attentionReason: null,
      },
    }),
  ]);

  await notifyVendorOfOffer(offer.id);

  return { offerId: offer.id, vendorId: nextVendor.id };
}
