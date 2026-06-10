// ============================================
// apps/server/src/route/vendor/notification.route.ts
// Vendor Portal — Notification Routes
// ============================================

import { Router } from "express";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from "../../controller/vendor/notification.controller";

const router = Router();

// Get notifications with category filter, unread toggle, pagination
// GET /api/v1/vendor/notifications?category=all|bookings|drivers|vehicles|documents|payments&unreadOnly=true&page=1&limit=20
router.get("/", getNotifications);

// Mark all as read (optionally by category)
// PATCH /api/v1/vendor/notifications/mark-all-read?category=bookings
router.patch("/mark-all-read", markAllAsRead);

// Mark single notification as read
// PATCH /api/v1/vendor/notifications/:notificationId/read
router.patch("/:notificationId/read", markAsRead);

export default router;
