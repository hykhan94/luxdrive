// ============================================
// apps/server/src/lib/offer-notifications.ts
//
// Notification dispatch for booking-offer events. Kept in its own
// module so all the wording sits in one place and is easy to tune
// without touching controller logic.
//
// Event hooks:
//   - notifyVendorOfOffer         — vendor sees a new request
//   - notifyVendorOfReOffer       — vendor sees revised-price re-offer
//   - notifyPartnerOfConfirmation — partner sees "assignment confirmed"
//   - notifyPartnerOfTripStart    — partner sees "trip in progress"
//   - notifyPartnerOfCompletion   — partner sees "trip completed"
//   - notifyPartnerOfCancellation — partner sees "your booking was cancelled"
//   - notifyAdminOfAcceptance     — admin sees vendor accepted
//   - notifyAdminOfRejection      — admin sees vendor rejected (with reason)
//
// Cross-visibility rule: vendor never sees partner-side info in the
// notification body and partner never sees vendor-side info. Notification
// `data` payloads carry only IDs and amounts that the recipient is
// entitled to see.
// ============================================

import { prisma } from "./prisma";

/**
 * Vendor sees a new booking offer.
 *
 * Pass the offer row's id. We re-load it with the booking and vendor
 * data to construct a readable message and route the notification to
 * the right user.
 */
export async function notifyVendorOfOffer(offerId: string): Promise<void> {
  const offer = await prisma.bookingAssignmentOffer.findUnique({
    where: { id: offerId },
    include: {
      booking: {
        select: {
          bookingRef: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripDate: true,
          tripTime: true,
          vehicleClass: true,
        },
      },
      vendor: { select: { userId: true, companyName: true } },
    },
  });
  if (!offer) return;

  const tripDateStr = offer.booking.tripDate.toISOString().split("T")[0];
  await prisma.notification.create({
    data: {
      userId: offer.vendor.userId,
      title: "New Booking Request",
      message: `Booking ${offer.booking.bookingRef} — ${offer.booking.pickupAddress} → ${offer.booking.dropoffAddress} on ${tripDateStr} ${offer.booking.tripTime || ""}. Offered payout: SAR ${Number(offer.payoutAmount).toFixed(2)}.`,
      type: "BOOKING_OFFER_RECEIVED",
      data: {
        offerId: offer.id,
        bookingId: offer.bookingId,
        bookingRef: offer.booking.bookingRef,
        payoutAmount: Number(offer.payoutAmount),
        attemptNumber: offer.attemptNumber,
      },
    },
  });
}

/**
 * Vendor sees a revised-price re-offer.
 *
 * Triggered only by the PRICE_TOO_LOW second-chance flow: vendor
 * rejected once for price, admin came back with a new number. We
 * differentiate from notifyVendorOfOffer so the in-app UI can
 * surface "Updated price" prominently rather than treating it as a
 * brand-new request.
 */
export async function notifyVendorOfReOffer(offerId: string): Promise<void> {
  const offer = await prisma.bookingAssignmentOffer.findUnique({
    where: { id: offerId },
    include: {
      booking: {
        select: {
          bookingRef: true,
          pickupAddress: true,
          dropoffAddress: true,
          tripDate: true,
        },
      },
      vendor: { select: { userId: true } },
    },
  });
  if (!offer) return;

  const tripDateStr = offer.booking.tripDate.toISOString().split("T")[0];
  await prisma.notification.create({
    data: {
      userId: offer.vendor.userId,
      title: "Updated Price — Booking Re-offered",
      message: `Booking ${offer.booking.bookingRef} (${offer.booking.pickupAddress} → ${offer.booking.dropoffAddress} on ${tripDateStr}) re-offered at revised payout SAR ${Number(offer.payoutAmount).toFixed(2)}.`,
      type: "BOOKING_OFFER_REOFFERED",
      data: {
        offerId: offer.id,
        bookingId: offer.bookingId,
        bookingRef: offer.booking.bookingRef,
        payoutAmount: Number(offer.payoutAmount),
        attemptNumber: offer.attemptNumber,
      },
    },
  });
}

/**
 * Partner sees "your booking is confirmed".
 *
 * Fires when a vendor accepts the offer. Per the cross-visibility
 * rule, the message names NO vendor — partner just sees the booking
 * is confirmed and a driver/vehicle have been assigned.
 */
export async function notifyPartnerOfConfirmation(booking: {
  id: string;
  bookingRef: string;
  partnerId: string | null;
  partner?: { id: string; userId: string } | null;
}): Promise<void> {
  if (!booking.partnerId) return; // direct booking, no partner to notify
  const partner = booking.partner
    ? { id: booking.partner.id, userId: booking.partner.userId }
    : await prisma.partner.findUnique({
        where: { id: booking.partnerId },
        select: { id: true, userId: true },
      });
  if (!partner) return;

  await prisma.notification.create({
    data: {
      userId: partner.userId,
      title: "Booking Confirmed",
      message: `Booking ${booking.bookingRef} is confirmed. Driver and vehicle have been assigned.`,
      type: "BOOKING_CONFIRMED",
      data: { bookingId: booking.id, bookingRef: booking.bookingRef },
    },
  });
}

/**
 * Partner sees "your booking was cancelled".
 *
 * Fires when the auto-cascade exhausts the eligible-vendor pool and
 * the booking is auto-cancelled. Per the spec the message is plain
 * and offers the contact-admin escape hatch — partner doesn't see any
 * internal detail about why (no vendor names, no rejection reasons).
 */
export async function notifyPartnerOfCancellation(booking: {
  id: string;
  bookingRef: string;
  partnerId: string | null;
}): Promise<void> {
  if (!booking.partnerId) return;
  const partner = await prisma.partner.findUnique({
    where: { id: booking.partnerId },
    select: { userId: true },
  });
  if (!partner) return;

  await prisma.notification.create({
    data: {
      userId: partner.userId,
      title: "Booking Cancelled",
      message: `Booking ${booking.bookingRef} has been cancelled. If this was unexpected, please contact admin.`,
      type: "BOOKING_CANCELLED",
      data: { bookingId: booking.id, bookingRef: booking.bookingRef },
    },
  });
}

/**
 * Partner sees "trip in progress".
 *
 * Fires when the vendor's driver starts the trip. No vendor / driver /
 * vehicle attribution in the message — partner only needs to know the
 * journey is underway. Mirror of notifyPartnerOfConfirmation in shape
 * (lazy partner.userId fetch so the caller doesn't need to include
 * partner relations in its booking query).
 */
export async function notifyPartnerOfTripStart(booking: {
  id: string;
  bookingRef: string;
  partnerId: string | null;
}): Promise<void> {
  if (!booking.partnerId) return;
  const partner = await prisma.partner.findUnique({
    where: { id: booking.partnerId },
    select: { userId: true },
  });
  if (!partner) return;

  await prisma.notification.create({
    data: {
      userId: partner.userId,
      title: "Trip In Progress",
      message: `Booking ${booking.bookingRef} — the driver has started the trip.`,
      type: "BOOKING_IN_PROGRESS",
      data: { bookingId: booking.id, bookingRef: booking.bookingRef },
    },
  });
}

/**
 * Partner sees "trip completed".
 *
 * Fires when the vendor's driver completes the trip. Same minimal copy
 * as the other partner notifications — no vendor-side attribution.
 */
export async function notifyPartnerOfCompletion(booking: {
  id: string;
  bookingRef: string;
  partnerId: string | null;
}): Promise<void> {
  if (!booking.partnerId) return;
  const partner = await prisma.partner.findUnique({
    where: { id: booking.partnerId },
    select: { userId: true },
  });
  if (!partner) return;

  await prisma.notification.create({
    data: {
      userId: partner.userId,
      title: "Trip Completed",
      message: `Booking ${booking.bookingRef} has been completed successfully.`,
      type: "BOOKING_COMPLETED",
      data: { bookingId: booking.id, bookingRef: booking.bookingRef },
    },
  });
}

/**
 * Admin sees vendor accepted an offer.
 */
export async function notifyAdminOfAcceptance(
  bookingId: string,
  vendorId: string,
): Promise<void> {
  const [booking, vendor, admins] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      select: { bookingRef: true, vendorPayoutAmount: true },
    }),
    prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { companyName: true },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    }),
  ]);
  if (!booking || !vendor || admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Vendor Accepted Booking",
      message: `${vendor.companyName} accepted booking ${booking.bookingRef} at payout SAR ${Number(booking.vendorPayoutAmount ?? 0).toFixed(2)}.`,
      type: "VENDOR_ACCEPTED_BOOKING",
      data: { bookingId, vendorId, bookingRef: booking.bookingRef },
    })),
  });
}

/**
 * Admin sees vendor rejected an offer.
 *
 * The reason is the OfferRejectionReason enum value — useful because
 * PRICE_TOO_LOW on attempt 1 lets admin re-offer with a revised price,
 * while CAR_DRIVER_UNAVAILABLE / UNSUITABLE_ROUTE auto-cascade to the
 * next vendor (admin is notified but doesn't need to act).
 */
export async function notifyAdminOfRejection(
  bookingId: string,
  vendorId: string,
  reason: string,
  attemptNumber: number,
): Promise<void> {
  const [booking, vendor, admins] = await Promise.all([
    prisma.booking.findUnique({
      where: { id: bookingId },
      select: { bookingRef: true },
    }),
    prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { companyName: true },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    }),
  ]);
  if (!booking || !vendor || admins.length === 0) return;

  // Tailor the message slightly for the price-rejection case so admin
  // knows there's an action item (re-offer with revised price) vs.
  // a non-actionable cascade.
  const isPriceRejection = reason === "PRICE_TOO_LOW" && attemptNumber === 1;
  const message = isPriceRejection
    ? `${vendor.companyName} rejected booking ${booking.bookingRef}: price too low. You can re-offer at a revised price.`
    : `${vendor.companyName} rejected booking ${booking.bookingRef}: ${reason}. Auto-cascading to next eligible vendor.`;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: isPriceRejection
        ? "Vendor Rejected — Re-offer Available"
        : "Vendor Rejected — Auto-cascading",
      message,
      type: "VENDOR_REJECTED_BOOKING",
      data: {
        bookingId,
        vendorId,
        bookingRef: booking.bookingRef,
        rejectionReason: reason,
        attemptNumber,
        canReoffer: isPriceRejection,
      },
    })),
  });
}
