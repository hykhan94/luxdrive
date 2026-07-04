// ============================================
// apps/server/src/controller/partner/sidebar.controller.ts
// Partner Portal — Sidebar Badge Counts
// ============================================
//
// Mirrors the admin portal's getSidebarBadges pattern. Returns the
// numeric badge count to display next to each sidebar menu item.
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { getExpiredRequiredDocs } from "./_shared";

// Notification types that count as "Invoice" badge updates
// (auto-generated monthly invoice + overdue/due-soon alerts)
const INVOICE_NOTIFICATION_TYPES = [
  "INVOICE_GENERATED",
  "INVOICE_DUE_SOON",
  "INVOICE_OVERDUE",
  "INVOICE_PAID",
  "CUSTOM_INVOICE_CONFIRMED",
];

/**
 * GET /api/v1/partner/sidebar-badges
 *
 * Returns the badge count for each sidebar menu item:
 *   - notifications: total unread notifications
 *   - invoices: unread invoice-related notifications + unpaid invoices count
 *   - bookings: bookings that need partner attention (e.g. status changed since last view)
 *   - profile: 1 if there are unresolved admin comments, otherwise 0
 *
 * The frontend polls this endpoint (or refetches on key actions) and
 * displays the number as a small badge next to each menu item — exactly
 * the same pattern used in the admin portal.
 */

export const getSidebarBadges = asyncWrapper(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;

    // Get the partner record to check status & for partnerId
    const partner = await prisma.partner.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        logoUrl: true,
      },
    });

    // If user has no partner record yet, return zeros
    if (!partner) {
      res.json({
        success: true,
        data: {
          notifications: 0,
          invoices: 0,
          bookings: 0,
          profile: 0,
          isApproved: false,
          partnerStatus: null,
          logoUrl: null,
          hasActiveRejections: false,
          expiredRequiredDocs: [],
        },
      });
      return;
    }

    const isApproved = partner.status === "APPROVED";

    // ---- 1. Notifications badge — total unread notifications ----
    const totalUnreadNotifications = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    // ---- 2. Invoices badge — unread notifications + unviewed invoices ----
    const [unreadInvoiceNotifications, unviewedInvoices] = await Promise.all([
      prisma.notification.count({
        where: {
          userId,
          isRead: false,
          type: { in: INVOICE_NOTIFICATION_TYPES },
        },
      }),
      prisma.partnerInvoice.count({
        where: {
          partnerId: partner.id,
          isViewedByPartner: false,
        },
      }),
    ]);

    // ---- 3. Bookings badge — unread booking-related notifications ----
    // (Vendor confirmed, vendor rejected, driver assigned, completed, etc.)
    const unreadBookingNotifications = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
        type: {
          in: [
            "BOOKING_VENDOR_ASSIGNED",
            "BOOKING_CONFIRMED",
            "BOOKING_VENDOR_REJECTED",
            "BOOKING_NO_VENDOR_AVAILABLE",
            "BOOKING_DRIVER_ASSIGNED",
            "BOOKING_IN_PROGRESS",
            "BOOKING_COMPLETED",
            "BOOKING_CANCELLED",
          ],
        },
      },
    });

    // ---- 4. Profile badge — unresolved admin comments + status alerts ----
    let profileBadge = 0;
    if (!isApproved) {
      // Not yet approved — show 1 to draw attention to profile section
      profileBadge = 1;
    } else {
      // Approved — show count of unresolved review comments
      const unresolvedComments = await prisma.partnerReviewComment.count({
        where: { partnerId: partner.id, isResolved: false },
      });
      // Also count profile-related unread notifications
      const unreadProfileNotifications = await prisma.notification.count({
        where: {
          userId,
          isRead: false,
          type: {
            in: [
              "PROFILE_CHANGES_REQUESTED",
              "PROFILE_COMMENT_ADDED",
              "PROFILE_SUSPENDED",
              "MOU_EXPIRING_SOON",
              "MOU_EXPIRED",
              // Per-field admin actions from profile review — keep the
              // partner sidebar profile badge in sync with the
              // notifications CATEGORY_MAP grouping.
              "PARTNER_PROFILE_FIELD_REJECTED",
              "PARTNER_PROFILE_REVIEW_COMMENT",
              // Profile doc expiry — fired by the daily cron at 9:50 KSA
              // for CR / VAT / Chamber / Balady / National Address /
              // IBAN Letter. Mirrors the vendor side.
              "PARTNER_PROFILE_DOC_EXPIRING",
              "PARTNER_PROFILE_DOC_EXPIRED",
            ],
          },
        },
      });
      profileBadge = unresolvedComments + unreadProfileNotifications;
    }

    // Expired required documents — computed live, drives the doc-lock UX. Each
    // expired doc bumps the profile badge so the partner sees a red ping on
    // the Profile tab even when nominally APPROVED; the header pill in the
    // frontend tells them WHY they're being directed there.
    const expiredRequiredDocs = await getExpiredRequiredDocs(partner.id);
    profileBadge += expiredRequiredDocs.length;

    // Any unresolved ADMIN_REJECTION comment means the partner has a real
    // pending correction. Used by the frontend to distinguish
    // "Changes Requested" (has rejections) from "Editing your profile"
    // (partner_request-only) in the top-right status pill.
    const hasActiveRejections =
      (await prisma.partnerReviewComment.count({
        where: {
          partnerId: partner.id,
          isResolved: false,
          type: "ADMIN_REJECTION",
        },
      })) > 0;

    const logoReadUrl = await getReadUrl(partner.logoUrl);

    res.json({
      success: true,
      data: {
        notifications: totalUnreadNotifications,
        invoices: Math.max(unreadInvoiceNotifications, unviewedInvoices),
        bookings: unreadBookingNotifications,
        profile: profileBadge,
        isApproved,
        logoUrl: logoReadUrl || null,
        partnerStatus: partner.status,
        hasActiveRejections,
        // Required profile documents whose expiryDate has passed. Empty array
        // when everything is in good standing. Used by frontend to drive the
        // doc-lock banner UX (red pill in header, locked book-ride form,
        // locked Generate Custom Invoice button).
        expiredRequiredDocs: expiredRequiredDocs.map((d) => ({
          type: d.type,
          label: d.label,
          expiryDate: d.expiryDate,
        })),
      },
    });
  },
);
