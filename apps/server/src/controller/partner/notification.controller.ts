// ============================================
// apps/server/src/controller/partner/notification.controller.ts
// Partner Portal — Notifications
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError } from "../../utils/AppError";
import { requireOperational } from "./_shared";

// ============== HELPERS ==============

async function getPartnerForUser(userId: string) {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: { id: true, status: true, companyName: true },
  });
  if (!partner) throw new NotFoundError("Partner profile");
  return partner;
}

// Group notification types into categories for UI tabs/filtering
const CATEGORY_MAP: Record<string, string> = {
  // Profile-related
  PROFILE_CHANGES_REQUESTED: "PROFILE",
  PROFILE_APPROVED: "PROFILE",
  PROFILE_SUSPENDED: "PROFILE",
  PROFILE_REACTIVATED: "PROFILE",
  PROFILE_COMMENT_ADDED: "PROFILE",
  // Per-field admin actions from the profile review flow — keep them
  // grouped with the profile category so the partner finds them
  // alongside other profile review activity.
  PARTNER_PROFILE_FIELD_REJECTED: "PROFILE",
  PARTNER_PROFILE_REVIEW_COMMENT: "PROFILE",

  // Booking-related
  BOOKING_VENDOR_ASSIGNED: "BOOKING",
  BOOKING_CONFIRMED: "BOOKING",
  BOOKING_VENDOR_REJECTED: "BOOKING",
  BOOKING_NO_VENDOR_AVAILABLE: "BOOKING",
  BOOKING_DRIVER_ASSIGNED: "BOOKING",
  BOOKING_IN_PROGRESS: "BOOKING",
  BOOKING_COMPLETED: "BOOKING",
  BOOKING_CANCELLED: "BOOKING",

  // Invoice-related
  INVOICE_GENERATED: "INVOICE",
  INVOICE_DUE_SOON: "INVOICE",
  INVOICE_OVERDUE: "INVOICE",
  INVOICE_PAID: "INVOICE",
  CUSTOM_INVOICE_CONFIRMED: "INVOICE",
  // Stage 3B-2 — new direction. Partner uploaded proof, admin
  // confirmed → INVOICE_PAYMENT_CONFIRMED. Replaces the old
  // PAYMENT_VERIFIED (which was vendor-side under old direction).
  INVOICE_PAYMENT_CONFIRMED: "INVOICE",

  // Suspension lifecycle (partner-side). Auto-suspension fires when
  // the 6th-of-month cron finds OVERDUE invoices past dueDate. Manual
  // unsuspend fires when admin reactivates an unpaid partner.
  PARTNER_AUTO_SUSPENDED: "PROFILE",
  PARTNER_MANUALLY_UNSUSPENDED: "PROFILE",

  // MOU
  MOU_EXPIRING_SOON: "MOU",
  MOU_EXPIRED: "MOU",

  // Profile doc (CR/VAT/Chamber/Balady/NationalAddress/IBAN)
  // expiry pings from the daily cron. Grouped under PROFILE so
  // the partner finds them alongside other profile activity —
  // they belong to the same Company Profile workflow as the
  // per-field admin actions above.
  PARTNER_PROFILE_DOC_EXPIRING: "PROFILE",
  PARTNER_PROFILE_DOC_EXPIRED: "PROFILE",

  // Team
  TEAM_MEMBER_JOINED: "TEAM",
  TEAM_MEMBER_INVITATION_EXPIRED: "TEAM",

  // System
  WELCOME: "SYSTEM",
  GENERAL: "SYSTEM",
};

// Icon hints for the frontend
const ICON_MAP: Record<string, string> = {
  PROFILE_CHANGES_REQUESTED: "alert-triangle",
  PROFILE_APPROVED: "check-circle",
  PROFILE_SUSPENDED: "x-circle",
  PROFILE_REACTIVATED: "check-circle",
  PROFILE_COMMENT_ADDED: "message-square",
  PARTNER_PROFILE_FIELD_REJECTED: "x-circle",
  PARTNER_PROFILE_REVIEW_COMMENT: "message-square",
  BOOKING_VENDOR_ASSIGNED: "user-check",
  BOOKING_CONFIRMED: "check-circle-2",
  BOOKING_VENDOR_REJECTED: "alert-triangle",
  BOOKING_NO_VENDOR_AVAILABLE: "x-circle",
  BOOKING_DRIVER_ASSIGNED: "id-card",
  BOOKING_IN_PROGRESS: "navigation",
  BOOKING_COMPLETED: "flag",
  BOOKING_CANCELLED: "x-circle",
  INVOICE_GENERATED: "receipt",
  INVOICE_DUE_SOON: "clock",
  INVOICE_OVERDUE: "alert-triangle",
  INVOICE_PAID: "check-circle-2",
  CUSTOM_INVOICE_CONFIRMED: "check-circle",
  INVOICE_PAYMENT_CONFIRMED: "check-circle-2",
  PARTNER_AUTO_SUSPENDED: "x-circle",
  PARTNER_MANUALLY_UNSUSPENDED: "check-circle",
  MOU_EXPIRING_SOON: "calendar-clock",
  MOU_EXPIRED: "calendar-x",
  PARTNER_PROFILE_DOC_EXPIRING: "calendar-clock",
  PARTNER_PROFILE_DOC_EXPIRED: "calendar-x",
  TEAM_MEMBER_JOINED: "user-plus",
  TEAM_MEMBER_INVITATION_EXPIRED: "user-x",
  WELCOME: "sparkles",
  GENERAL: "bell",
};

// Severity for color hint on the frontend
const SEVERITY_MAP: Record<string, "info" | "success" | "warning" | "danger"> =
  {
    PROFILE_CHANGES_REQUESTED: "warning",
    PROFILE_APPROVED: "success",
    PROFILE_SUSPENDED: "danger",
    PROFILE_REACTIVATED: "success",
    PROFILE_COMMENT_ADDED: "info",
    BOOKING_VENDOR_ASSIGNED: "info",
    BOOKING_CONFIRMED: "success",
    BOOKING_VENDOR_REJECTED: "warning",
    BOOKING_NO_VENDOR_AVAILABLE: "danger",
    BOOKING_DRIVER_ASSIGNED: "info",
    BOOKING_IN_PROGRESS: "info",
    BOOKING_COMPLETED: "success",
    BOOKING_CANCELLED: "danger",
    INVOICE_GENERATED: "info",
    INVOICE_DUE_SOON: "warning",
    INVOICE_OVERDUE: "danger",
    INVOICE_PAID: "success",
    CUSTOM_INVOICE_CONFIRMED: "success",
    INVOICE_PAYMENT_CONFIRMED: "success",
    PARTNER_AUTO_SUSPENDED: "danger",
    PARTNER_MANUALLY_UNSUSPENDED: "success",
    MOU_EXPIRING_SOON: "warning",
    MOU_EXPIRED: "danger",
    PARTNER_PROFILE_DOC_EXPIRING: "warning",
    PARTNER_PROFILE_DOC_EXPIRED: "danger",
    TEAM_MEMBER_JOINED: "success",
    TEAM_MEMBER_INVITATION_EXPIRED: "warning",
    WELCOME: "info",
    GENERAL: "info",
  };

// CTA hints — frontend uses these to render action buttons
function getCtaForType(
  type: string,
  data: any,
): { label: string; route: string } | null {
  switch (type) {
    case "PROFILE_CHANGES_REQUESTED":
    case "PROFILE_COMMENT_ADDED":
      return { label: "View Profile", route: "/partner/profile" };
    case "PROFILE_APPROVED":
      return { label: "Open Dashboard", route: "/partner/dashboard" };
    case "BOOKING_VENDOR_ASSIGNED":
    case "BOOKING_CONFIRMED":
    case "BOOKING_DRIVER_ASSIGNED":
    case "BOOKING_IN_PROGRESS":
    case "BOOKING_COMPLETED":
    case "BOOKING_VENDOR_REJECTED":
    case "BOOKING_NO_VENDOR_AVAILABLE":
    case "BOOKING_CANCELLED":
      return data?.bookingId
        ? {
            label: "View Booking",
            route: `/partner/bookings/${data.bookingId}`,
          }
        : { label: "View Bookings", route: "/partner/bookings" };
    case "INVOICE_GENERATED":
    case "INVOICE_DUE_SOON":
    case "INVOICE_OVERDUE":
    case "INVOICE_PAID":
    case "CUSTOM_INVOICE_CONFIRMED":
    case "INVOICE_PAYMENT_CONFIRMED":
      return data?.invoiceId
        ? {
            label: "View Invoice",
            route: `/partner/invoices/${data.invoiceId}`,
          }
        : { label: "View Invoices", route: "/partner/invoices" };
    case "PARTNER_AUTO_SUSPENDED":
      // Suspended partner needs to upload payment proof on overdue
      // invoices to recover; route them straight to invoices.
      return { label: "Pay Outstanding", route: "/partner/invoices" };
    case "PARTNER_MANUALLY_UNSUSPENDED":
      return { label: "Open Dashboard", route: "/partner/dashboard" };
    case "MOU_EXPIRING_SOON":
    case "MOU_EXPIRED":
      return { label: "Update MOU", route: "/partner/profile" };
    case "TEAM_MEMBER_JOINED":
    case "TEAM_MEMBER_INVITATION_EXPIRED":
      return { label: "Manage Team", route: "/partner/profile" };
    default:
      return null;
  }
}

// ============== GET NOTIFICATIONS LIST ==============

/**
 * Get partner notifications — paginated, filterable, grouped
 * Query params:
 *   - page (default 1)
 *   - limit (default 20, max 50)
 *   - category: PROFILE | BOOKING | INVOICE | MOU | TEAM | SYSTEM | all
 *   - status: read | unread | all
 */
export const getNotifications = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);

    const {
      page = "1",
      limit = "20",
      category = "all",
      status = "all",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));

    const where: any = { userId: req.user!.id };

    // Status filter
    if (status === "read") where.isRead = true;
    if (status === "unread") where.isRead = false;

    // Category filter (filter by all types in that category)
    if (category && category !== "all") {
      const typesInCategory = Object.entries(CATEGORY_MAP)
        .filter(([, cat]) => cat === category)
        .map(([type]) => type);
      where.type = { in: typesInCategory };
    }

    const skip = (pageNum - 1) * limitNum;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: req.user!.id, isRead: false },
      }),
    ]);

    // Format with category, icon, severity, CTA
    const formatted = notifications.map((n) => {
      const data = (n.data as any) || {};
      const cta = getCtaForType(n.type, data);
      return {
        id: n.id,
        type: n.type,
        category: CATEGORY_MAP[n.type] || "SYSTEM",
        icon: ICON_MAP[n.type] || "bell",
        severity: SEVERITY_MAP[n.type] || "info",
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt,
        data,
        cta,
      };
    });

    // Category counts (for tab badges)
    const categoryCounts = await getCategoryCounts(req.user!.id);

    res.json({
      success: true,
      data: {
        notifications: formatted,
        unreadCount,
        categoryCounts,
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

// Internal helper: count notifications per category
async function getCategoryCounts(userId: string) {
  const all = await prisma.notification.groupBy({
    by: ["type"],
    where: { userId, isRead: false },
    _count: { id: true },
  });

  const counts: Record<string, number> = {
    PROFILE: 0,
    BOOKING: 0,
    INVOICE: 0,
    MOU: 0,
    TEAM: 0,
    SYSTEM: 0,
    all: 0,
  };

  all.forEach((row) => {
    const cat = CATEGORY_MAP[row.type] || "SYSTEM";
    counts[cat] = (counts[cat] || 0) + row._count.id;
    counts.all += row._count.id;
  });

  return counts;
}

// ============== UNREAD COUNT (for sidebar badge) ==============

export const getUnreadCount = asyncWrapper(
  async (req: Request, res: Response) => {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    });
    const categoryCounts = await getCategoryCounts(req.user!.id);
    res.json({
      success: true,
      data: { unreadCount: count, categoryCounts },
    });
  },
);

// ============== MARK SINGLE AS READ ==============

export const markAsRead = asyncWrapper(async (req: Request, res: Response) => {
  const { id } = req.params;

  const notification = await prisma.notification.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!notification) throw new NotFoundError("Notification");

  if (!notification.isRead) {
    await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  res.json({ success: true, message: "Notification marked as read" });
});

// ============== MARK ALL AS READ ==============

// Notification types that should NEVER be auto-cleared by panel
// mount-time bulk-clears. These represent admin-initiated account
// standing changes — the partner needs to consciously read them, not
// have them disappear because they opened the Profile tab. Cleared
// only via the dedicated per-notification mark-as-read flow or by
// explicit "Mark all read" from the Notifications panel (which sends
// no category filter).
const PROTECTED_TYPES = new Set(["PROFILE_SUSPENDED", "PROFILE_REACTIVATED"]);

export const markAllAsRead = asyncWrapper(
  async (req: Request, res: Response) => {
    const { category } = req.body;

    const where: any = { userId: req.user!.id, isRead: false };

    if (category && category !== "all") {
      const typesInCategory = Object.entries(CATEGORY_MAP)
        .filter(([, cat]) => cat === category)
        // Skip account-standing types so they don't get cleared as a
        // side-effect of the partner navigating to the Profile tab.
        // When category is "PROFILE" this filters PROFILE_SUSPENDED
        // and PROFILE_REACTIVATED out of the bulk update. Explicit
        // mark-all (no category) still clears them.
        .filter(([type]) => !PROTECTED_TYPES.has(type))
        .map(([type]) => type);
      where.type = { in: typesInCategory };
    }

    const result = await prisma.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });

    res.json({
      success: true,
      message: `${result.count} notification(s) marked as read`,
      data: { updated: result.count },
    });
  },
);

// ============== DELETE / DISMISS A NOTIFICATION ==============

export const deleteNotification = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId: req.user!.id },
    });
    if (!notification) throw new NotFoundError("Notification");

    await prisma.notification.delete({ where: { id } });

    res.json({ success: true, message: "Notification dismissed" });
  },
);

// ============== CLEAR ALL READ NOTIFICATIONS ==============

export const clearAllRead = asyncWrapper(
  async (req: Request, res: Response) => {
    const result = await prisma.notification.deleteMany({
      where: { userId: req.user!.id, isRead: true },
    });

    res.json({
      success: true,
      message: `${result.count} read notification(s) cleared`,
      data: { deleted: result.count },
    });
  },
);

// ============== HELPER FOR ADMIN CONTROLLERS TO CALL ==============

/**
 * Helper to create a partner notification.
 * Use this in admin controllers when admin actions affect a partner.
 *
 * Example:
 *   await createPartnerNotification(partnerUserId, {
 *     type: "PROFILE_APPROVED",
 *     title: "Profile Approved!",
 *     message: "Your profile has been approved. You can now use all features.",
 *   });
 */
export async function createPartnerNotification(
  userId: string,
  payload: { type: string; title: string; message: string; data?: any },
) {
  return prisma.notification.create({
    data: {
      userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      data: payload.data || {},
      isRead: false,
    },
  });
}
