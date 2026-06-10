// ============================================
// apps/server/src/controller/vendor/notification.controller.ts
// Vendor Portal — Notifications Section
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";

// ============== NOTIFICATION CATEGORY MAPPING ==============

// Maps notification types to frontend filter categories
const NOTIFICATION_CATEGORIES: Record<string, string[]> = {
  bookings: [
    "BOOKING_ASSIGNED",
    "BOOKING_REASSIGNED",
    "BOOKING_CANCELLED",
    "BOOKING_UPDATED",
    "BOOKING_REMINDER",
    "BOOKING_COMPLETED",
    "TRIP_STARTED",
    "TRIP_COMPLETED",
  ],
  fleet: [
    // Vehicle review + lifecycle
    "VEHICLE_APPROVED",
    "VEHICLE_REJECTED",
    "VEHICLE_CHANGES_REQUESTED",
    "VEHICLE_SUBMITTED",
    "VEHICLE_DEACTIVATED",
    "VEHICLE_DOCUMENT_EXPIRING",
    "VEHICLE_DOCUMENT_EXPIRED",
    "VEHICLE_DOC_EXPIRING",
    "VEHICLE_SUSPENDED_DOCS",
    "VEHICLE_REACTIVATED",
    // Driver review + lifecycle
    "DRIVER_APPROVED",
    "DRIVER_REJECTED",
    "DRIVER_CHANGES_REQUESTED",
    "DRIVER_SUBMITTED",
    "DRIVER_DEACTIVATED",
    "DRIVER_DOCUMENT_EXPIRING",
    "DRIVER_DOCUMENT_EXPIRED",
    "DRIVER_DOC_EXPIRING",
    "DRIVER_SUSPENDED_DOCS",
    "DRIVER_REACTIVATED",
  ],
  drivers: [
    "DRIVER_APPROVED",
    "DRIVER_REJECTED",
    "DRIVER_CHANGES_REQUESTED",
    "DRIVER_SUBMITTED",
    "DRIVER_DEACTIVATED",
    "DRIVER_DOCUMENT_EXPIRING",
    "DRIVER_DOCUMENT_EXPIRED",
    "DRIVER_DOC_EXPIRING",
    "DRIVER_SUSPENDED_DOCS",
    "DRIVER_REACTIVATED",
  ],
  vehicles: [
    "VEHICLE_APPROVED",
    "VEHICLE_REJECTED",
    "VEHICLE_CHANGES_REQUESTED",
    "VEHICLE_SUBMITTED",
    "VEHICLE_DEACTIVATED",
    "VEHICLE_DOCUMENT_EXPIRING",
    "VEHICLE_DOCUMENT_EXPIRED",
    "VEHICLE_DOC_EXPIRING",
    "VEHICLE_SUSPENDED_DOCS",
    "VEHICLE_REACTIVATED",
  ],
  documents: [
    "PROFILE_CHANGES_REQUESTED",
    "PROFILE_COMMENT_ADDED",
    "PROFILE_APPROVED",
    "PROFILE_REJECTED",
    "MOU_EXPIRING",
    "MOU_EXPIRED",
    "VENDOR_PROFILE_SUBMITTED",
    "VENDOR_CHANGE_REQUEST",
    "DOCUMENT_EXPIRING",
    "DOCUMENT_EXPIRED",
    // Per-field admin actions from the profile review flow. These are
    // emitted by admin.controller's addVendorReviewComment when admin
    // rejects an individual field/doc/MOU or leaves a comment — keeping
    // them in the documents category surfaces them in the same filter
    // the vendor already opens to check on profile review activity.
    "VENDOR_PROFILE_FIELD_REJECTED",
    "VENDOR_PROFILE_REVIEW_COMMENT",
    // Profile doc (CR/VAT/Chamber/Balady/NationalAddress/IBAN)
    // expiry pings from the daily cron. Same category as the
    // other doc-related notifications so the vendor finds them
    // where they expect.
    "VENDOR_PROFILE_DOC_EXPIRING",
    "VENDOR_PROFILE_DOC_EXPIRED",
    // Whole-profile approval — fired by admin's approveVendor endpoint
    // after a successful review cycle. Counterpart to the per-field
    // rejection type above; both belong in the documents/profile
    // category so the vendor sees them together.
    "VENDOR_APPROVED",
    // Admin-initiated account state changes. Suspension is high-signal
    // (vendor needs to see it immediately + react), reactivation is
    // good news. Both surface in the documents/profile filter since
    // they describe the vendor's overall account standing, not a
    // specific operational event.
    "VENDOR_SUSPENDED",
    "VENDOR_REACTIVATED",
  ],
  payments: [
    "RECEIPT_GENERATED",
    "RECEIPT_OVERDUE",
    "RECEIPT_PAID",
    "PAYMENT_RECEIVED",
    "PAYOUT_PROCESSED",
    "VENDOR_RECEIPT_GENERATED",
    "VENDOR_RECEIPT_OVERDUE",
    // Fired by admin's markVendorReceiptPaid endpoint when admin
    // verifies the bank transfer proof and confirms the receipt.
    // Vendor's earnings sidebar badge picks this up too.
    "VENDOR_RECEIPT_PAID",
  ],
};

// ============== HELPER: Create Vendor Notification ==============

/**
 * Reusable helper — call from any controller to create a notification
 * for the vendor's user account.
 */
export async function createVendorNotification(
  userId: string,
  data: { type: string; title: string; message: string; data?: any },
) {
  return prisma.notification.create({
    data: {
      userId,
      title: data.title,
      message: data.message,
      type: data.type,
      data: data.data || {},
    },
  });
}

// ============== GET NOTIFICATIONS ==============

/**
 * GET /api/v1/vendor/notifications
 *
 * Query params:
 *   - category: "all" | "bookings" | "drivers" | "vehicles" | "documents" | "payments" (default: "all")
 *   - unreadOnly: "true" | "false" (default: "false")
 *   - page: number (default: 1)
 *   - limit: number (default: 20)
 *
 * Returns notifications grouped by date (Today, Yesterday, This Week, Earlier)
 */
export const getNotifications = asyncWrapper(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const {
      category = "all",
      unreadOnly = "false",
      page = "1",
      limit = "20",
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    const isUnreadOnly = (unreadOnly as string) === "true";

    // Build where clause
    const where: any = { userId };

    // Category filter
    const validCategories = ["all", ...Object.keys(NOTIFICATION_CATEGORIES)];
    const selectedCategory = (category as string).toLowerCase();

    if (!validCategories.includes(selectedCategory)) {
      // Don't throw, just default to all
    } else if (selectedCategory !== "all") {
      const types = NOTIFICATION_CATEGORIES[selectedCategory];
      if (types && types.length > 0) {
        where.type = { in: types };
      }
    }

    // Unread only filter
    if (isUnreadOnly) {
      where.isRead = false;
    }

    // Fetch notifications + counts
    const [notifications, total, unreadCount, categoryCounts] =
      await Promise.all([
        prisma.notification.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: "desc" },
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId, isRead: false } }),
        // Count unread per category for badge numbers on filter buttons
        Promise.all(
          Object.entries(NOTIFICATION_CATEGORIES).map(async ([cat, types]) => {
            const count = await prisma.notification.count({
              where: { userId, isRead: false, type: { in: types } },
            });
            return { category: cat, unreadCount: count };
          }),
        ),
      ]);

    // Group notifications by date
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const grouped: Record<string, any[]> = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      Earlier: [],
    };

    notifications.forEach((n) => {
      const createdAt = new Date(n.createdAt);
      if (createdAt >= todayStart) {
        grouped["Today"].push(n);
      } else if (createdAt >= yesterdayStart) {
        grouped["Yesterday"].push(n);
      } else if (createdAt >= weekStart) {
        grouped["This Week"].push(n);
      } else {
        grouped["Earlier"].push(n);
      }
    });

    // Remove empty groups
    const dateGroups = Object.entries(grouped)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => ({ label, notifications: items }));

    // Build category counts map
    const categoryCountMap: Record<string, number> = { all: unreadCount };
    categoryCounts.forEach((c) => {
      categoryCountMap[c.category] = c.unreadCount;
    });

    res.json({
      success: true,
      data: {
        notifications,
        dateGroups,
        unreadCount,
        categoryCounts: categoryCountMap,
        selectedCategory,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  },
);

// ============== MARK SINGLE NOTIFICATION AS READ ==============

/**
 * PATCH /api/v1/vendor/notifications/:notificationId/read
 */
export const markAsRead = asyncWrapper(async (req: Request, res: Response) => {
  const { notificationId } = req.params;
  const userId = req.user!.id;

  // Verify ownership
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) {
    res.status(404).json({ success: false, message: "Notification not found" });
    return;
  }

  if (!notification.isRead) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  res.json({ success: true, message: "Marked as read" });
});

// ============== MARK ALL NOTIFICATIONS AS READ ==============

/**
 * PATCH /api/v1/vendor/notifications/mark-all-read
 *
 * Optionally accepts ?category=bookings to mark only a specific category
 */
// Notification types that should NEVER be auto-cleared by panel
// mount-time bulk-clears. Admin-initiated account standing changes —
// the vendor needs to consciously read them, not have them disappear
// because they opened a related tab. Cleared only via per-notification
// mark-as-read or explicit "Mark all read" with no category filter.
// Mirrors the partner side's PROTECTED_TYPES.
const PROTECTED_TYPES = new Set(["VENDOR_SUSPENDED", "VENDOR_REACTIVATED"]);

export const markAllAsRead = asyncWrapper(
  async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { category } = req.query;

    const where: any = { userId, isRead: false };

    // If category specified, only mark that category — minus protected
    // types, which stay unread until the vendor sees them explicitly.
    const selectedCategory = (category as string)?.toLowerCase();
    if (
      selectedCategory &&
      selectedCategory !== "all" &&
      NOTIFICATION_CATEGORIES[selectedCategory]
    ) {
      const types = NOTIFICATION_CATEGORIES[selectedCategory].filter(
        (t) => !PROTECTED_TYPES.has(t),
      );
      where.type = { in: types };
    }

    const result = await prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    res.json({
      success: true,
      message: `${result.count} notification(s) marked as read`,
      data: { count: result.count },
    });
  },
);
