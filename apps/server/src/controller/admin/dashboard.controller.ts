// ============================================
// apps/server/src/controller/admin/dashboard.controller.ts
// UPDATED: Only sidebar badges remain here.
// Dashboard stats moved to overview.controller.ts
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";

/**
 * Get sidebar badge counts for admin navigation
 * Includes: bookings, vendors (cumulative), partners, payments (with overdue/due-soon)
 */
export const getSidebarBadges = asyncWrapper(
  async (req: Request, res: Response) => {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(
      now.getTime() + 24 * 60 * 60 * 1000,
    );
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const [
      // Bookings
      unreadBookings,
      needsAttentionBookings,
      // Vendors — cumulative badge
      vendorPendingReviews,
      pendingBankRequests,
      pendingDriverReviews,
      pendingVehicleReviews,
      // Partners
      pendingPartnerReviews,
      pendingPartnerChangeRequests,
      // Payments — vendor side (admin OWES vendor)
      pendingVendorPayouts,
      // Payments — partner side (partner OWES admin)
      unconfirmedPartnerPayments,
      overduePartnerInvoices,
      dueSoonPartnerInvoices,
      // Alerts & Settings
      unactionedBookings,
    ] = await Promise.all([
      prisma.booking.count({ where: { isReadByAdmin: false } }),
      prisma.booking.count({ where: { needsAttention: true } }),
      // Vendor: profiles awaiting review
      prisma.vendor.count({ where: { status: "PENDING_REVIEW" } }),
      // Vendor: bank update requests from vendors
      prisma.vendorBankUpdateRequest.count({ where: { status: "PENDING" } }),
      // Vendor: drivers awaiting review
      prisma.driver.count({ where: { status: "PENDING_REVIEW" } }),
      // Vendor: vehicles awaiting review
      prisma.vehicle.count({ where: { status: "PENDING_REVIEW" } }),
      // Partner pending profile reviews
      prisma.partner.count({ where: { status: "PENDING_REVIEW" } }),
      // Partner pending change requests
      prisma.partnerChangeRequest.count({ where: { status: "PENDING" } }),
      // Payment direction inverted: admin pays vendor now. Counter is
      // "vendor payouts admin needs to send" — VendorPayout rows in
      // PENDING state (created but admin hasn't paid + uploaded the
      // receipt yet). Replaces the old "new vendor receipts to review"
      // counter, which was the inverse direction.
      prisma.vendorPayout.count({ where: { status: "PENDING" } }),
      // Payment: partner uploaded proof, admin needs to confirm. Single
      // status PROOF_UPLOADED replaces the old isPaymentReceived=true +
      // isConfirmed=false combo (those booleans were consolidated into
      // the status enum in Stage 2).
      prisma.partnerInvoice.count({
        where: { status: "PROOF_UPLOADED" },
      }),
      // Payment: partner overdue invoices
      prisma.partnerInvoice.count({ where: { status: "OVERDUE" } }),
      // Payment: partner invoices due within 3 days
      prisma.partnerInvoice.count({
        where: {
          status: "PENDING",
          dueDate: { lte: threeDaysFromNow, gte: now },
        },
      }),
      // Unactioned bookings: <24hrs left, no vendor accepted, not cancelled/completed.
      // Status filter now covers the offer lifecycle (PENDING — never
      // offered; ASSIGNMENT_OFFERED — outstanding first offer;
      // ASSIGNMENT_RE_OFFERED — outstanding price-bumped re-offer).
      prisma.booking.count({
        where: {
          vendorId: null,
          tripDate: { lte: twentyFourHoursFromNow },
          status: {
            in: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
          },
        },
      }),
    ]);

    const totalVendorBadge =
      vendorPendingReviews +
      pendingBankRequests +
      pendingDriverReviews +
      pendingVehicleReviews;

    const totalPaymentsBadge =
      pendingVendorPayouts +
      overduePartnerInvoices +
      dueSoonPartnerInvoices +
      unconfirmedPartnerPayments;

    res.json({
      success: true,
      data: {
        // Main sidebar badges
        bookings: unreadBookings + needsAttentionBookings,
        vendors: totalVendorBadge,
        partners: pendingPartnerReviews + pendingPartnerChangeRequests,
        payments: totalPaymentsBadge,
        alertsSettings: unactionedBookings,

        // Detailed breakdown
        breakdown: {
          bookings: {
            unread: unreadBookings,
            needsAttention: needsAttentionBookings,
          },
          vendors: {
            pendingReview: vendorPendingReviews,
            bankRequests: pendingBankRequests,
            driverReviews: pendingDriverReviews,
            vehicleReviews: pendingVehicleReviews,
          },
          partners: {
            pendingReview: pendingPartnerReviews,
            changeRequests: pendingPartnerChangeRequests,
          },
          payments: {
            toSend: pendingVendorPayouts,
            overdue: overduePartnerInvoices,
            dueSoon: dueSoonPartnerInvoices,
            awaitingConfirmation: unconfirmedPartnerPayments,
            toReceive:
              overduePartnerInvoices +
              dueSoonPartnerInvoices +
              unconfirmedPartnerPayments,
          },
          alertsSettings: {
            unactionedBookings,
          },
        },
      },
    });
  },
);
