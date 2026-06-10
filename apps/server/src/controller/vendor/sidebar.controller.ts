import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { getExpiredRequiredDocs } from "./_shared";

export const getSidebarBadges = asyncWrapper(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    const vendor = await prisma.vendor.findUnique({
      where: { userId },
      select: { id: true, status: true, logoUrl: true },
    });

    if (!vendor) {
      res.json({
        success: true,
        data: {
          notifications: 0,
          bookings: 0,
          fleet: 0,
          drivers: 0,
          earnings: 0,
          profile: 0,
          isApproved: false,
          vendorStatus: null,
          logoUrl: null,
          expiredRequiredDocs: [],
        },
      });
      return;
    }

    const isApproved = vendor.status === "APPROVED";

    // Compute expired required docs in parallel with the rest of the badge
    // queries. This is the same lookup the write-action gate uses, so the
    // sidebar always reflects exactly what the backend will enforce.
    const [
      totalUnreadNotifications,
      newBookingRequests,
      unreadBookingNotifications,
      // Drivers section
      pendingDriverReviews,
      driversChangesRequested,
      unreadDriverNotifications,
      // Fleet (vehicles) section
      pendingVehicleReviews,
      vehiclesChangesRequested,
      unreadVehicleNotifications,
      // Profile
      unresolvedProfileComments,
      // Earnings
      pendingReceipts,
      // Unread "payment verified" notifications — sums into the
      // earnings badge so the vendor sees a ping after admin confirms
      // their payment. Cleared when they open the earnings section.
      unreadPaymentConfirmedNotifications,
      // Required profile docs that have expired (drives the doc-lock UX)
      expiredRequiredDocs,
    ] = await Promise.all([
      prisma.notification.count({ where: { userId, isRead: false } }),
      prisma.bookingAssignmentOffer.count({
        where: { vendorId: vendor.id, status: "PENDING" },
      }),
      prisma.notification.count({
        where: {
          userId,
          isRead: false,
          type: {
            in: ["BOOKING_ASSIGNED", "BOOKING_REASSIGNED", "BOOKING_CANCELLED"],
          },
        },
      }),
      // Drivers pending admin review
      prisma.driver.count({
        where: {
          vendorId: vendor.id,
          status: "PENDING_REVIEW",
          isActive: true,
        },
      }),
      // Drivers with changes requested by admin
      prisma.driver.count({
        where: {
          vendorId: vendor.id,
          status: "CHANGES_REQUESTED",
          isActive: true,
        },
      }),
      // Unread driver-related notifications — reset when vendor opens Drivers section
      prisma.notification.count({
        where: {
          userId,
          isRead: false,
          type: {
            in: [
              "DRIVER_DOC_EXPIRING",
              "DRIVER_SUSPENDED_DOCS",
              "DRIVER_REACTIVATED",
              "DRIVER_APPROVED",
              "DRIVER_REJECTED",
              "DRIVER_CHANGES_REQUESTED",
            ],
          },
        },
      }),
      // Vehicles pending admin review
      prisma.vehicle.count({
        where: { vendorId: vendor.id, status: "PENDING_REVIEW" },
      }),
      // Vehicles with changes requested by admin
      prisma.vehicle.count({
        where: { vendorId: vendor.id, status: "CHANGES_REQUESTED" },
      }),
      // Unread vehicle-related notifications — reset when vendor opens Fleet section
      prisma.notification.count({
        where: {
          userId,
          isRead: false,
          type: {
            in: [
              "VEHICLE_DOC_EXPIRING",
              "VEHICLE_SUSPENDED_DOCS",
              "VEHICLE_REACTIVATED",
              "VEHICLE_APPROVED",
              "VEHICLE_REJECTED",
              "VEHICLE_CHANGES_REQUESTED",
            ],
          },
        },
      }),
      // Vendor profile unresolved comments
      prisma.vendorReviewComment.count({
        where: { vendorId: vendor.id, isResolved: false },
      }),
      // Vendor-side payments badge. Under the new direction (admin
      // pays vendor) this counts PENDING VendorPayout rows — payouts
      // admin has set up but not yet paid out. The old query counted
      // unpaid VendorReceipts the vendor still owed admin; that table
      // and that direction no longer exist. Stage 3B may refine this
      // when the vendor earnings UI is rebuilt for the new flow.
      prisma.vendorPayout.count({
        where: { vendorId: vendor.id, status: "PENDING" },
      }),
      // Unread payment-confirmed notifications — keeps the earnings
      // badge lit briefly after admin marks a receipt paid, so the
      // vendor doesn't miss the verification. Clears when they open
      // the earnings section (which marks notifications as read).
      prisma.notification.count({
        where: {
          userId,
          isRead: false,
          type: { in: ["VENDOR_RECEIPT_PAID"] },
        },
      }),
      // Required profile docs that are expired (computed live, no flag column)
      getExpiredRequiredDocs(vendor.id),
    ]);

    // Fleet badge (vehicles only) — actionable items the vendor needs to address
    const fleetBadge = vehiclesChangesRequested + unreadVehicleNotifications;

    // Drivers badge — same shape, drivers only
    const driversBadge = driversChangesRequested + unreadDriverNotifications;

    // Profile badge
    let profileBadge = 0;
    if (!isApproved) {
      profileBadge = 1;
    } else {
      const unreadProfileNotifications = await prisma.notification.count({
        where: {
          userId,
          isRead: false,
          type: {
            in: [
              "PROFILE_CHANGES_REQUESTED",
              "PROFILE_COMMENT_ADDED",
              "MOU_EXPIRING",
              // Per-field admin actions from the profile review flow.
              // Keeps the profile sidebar badge in sync with the documents
              // notification category.
              "VENDOR_PROFILE_FIELD_REJECTED",
              "VENDOR_PROFILE_REVIEW_COMMENT",
              // Whole-profile approval — fires when admin approves the
              // vendor after a review cycle. Lights up the profile badge
              // briefly so vendor notices the status change rather than
              // happening to discover it on their next login.
              "VENDOR_APPROVED",
              // Profile doc expiry — fired by the daily cron at 9:45 KSA
              // for CR / VAT / Chamber / Balady / National Address /
              // IBAN Letter. Both warning (within 30 days) and expired
              // notifications bump the profile badge so the vendor sees
              // the ping next to Company Profile in the sidebar.
              "VENDOR_PROFILE_DOC_EXPIRING",
              "VENDOR_PROFILE_DOC_EXPIRED",
            ],
          },
        },
      });
      profileBadge = unresolvedProfileComments + unreadProfileNotifications;
    }
    // Each expired required doc adds to the profile badge so the vendor sees
    // a red ping even if they're nominally APPROVED. The status pill in the
    // header tells them WHY they're being directed there.
    profileBadge += expiredRequiredDocs.length;

    const logoReadUrl = await getReadUrl((vendor as any).logoUrl);

    res.json({
      success: true,
      data: {
        notifications: totalUnreadNotifications,
        bookings: Math.max(newBookingRequests, unreadBookingNotifications),
        fleet: fleetBadge,
        drivers: driversBadge,
        earnings: pendingReceipts + unreadPaymentConfirmedNotifications,
        profile: profileBadge,
        isApproved,
        vendorStatus: vendor.status,
        logoUrl: logoReadUrl || null,

        // Expired required profile documents — populated only when a
        // CR/VAT/Chamber/Balady/National-Address/IBAN-Letter has passed its
        // expiryDate. Frontend uses this to drive the "Document Expired" lock
        // UX (red pill in header, banner in panels, button gating). Always
        // an array; empty when everything is in good standing.
        expiredRequiredDocs: expiredRequiredDocs.map((d: any) => ({
          type: d.type,
          label: d.label,
          expiryDate: d.expiryDate,
        })),

        breakdown: {
          bookings: {
            newRequests: newBookingRequests,
            unreadNotifications: unreadBookingNotifications,
          },
          fleet: {
            pendingVehicleReviews,
            vehiclesChangesRequested,
            unreadVehicleNotifications,
          },
          drivers: {
            pendingDriverReviews,
            driversChangesRequested,
            unreadDriverNotifications,
          },
          earnings: {
            pendingReceipts,
            unreadPaymentConfirmedNotifications,
          },
        },
      },
    });
  },
);
