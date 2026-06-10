// apps/server/src/route/partner/notification.route.ts

import { Router } from "express";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllRead,
} from "../../controller/partner/notification.controller";

const router = Router();

// GET /api/v1/partner/notifications?category=all&status=all&page=1
router.get("/", getNotifications);

// GET /api/v1/partner/notifications/unread-count
router.get("/unread-count", getUnreadCount);

// PATCH /api/v1/partner/notifications/read-all
router.patch("/read-all", markAllAsRead);

// DELETE /api/v1/partner/notifications/clear-read
router.delete("/clear-read", clearAllRead);

// PATCH /api/v1/partner/notifications/:id/read
router.patch("/:id/read", markAsRead);

// DELETE /api/v1/partner/notifications/:id
router.delete("/:id", deleteNotification);

export default router;
