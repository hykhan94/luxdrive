// ============================================
// !!! DESTINATION PATH: apps/server/src/route/admin/booking.route.ts
// ============================================
// ============================================
// apps/server/src/route/admin/booking.route.ts
// ============================================

import { Router } from "express";
import {
  getBookings,
  getBooking,
  getAvailableVendors,
  assignVendor,
  setBookingPrice,
  reOfferBooking,
  updateBookingStatus,
  cancelBooking,
  recordVendorRejection,
  getBookingStats,
  resolveAttention,
  markAsRead,
  markAllAsRead,
  downloadBookingPO,
  modifyBooking,
  authorizeCategoryUpgrade,
} from "../../controller/admin/booking.controller";

const router = Router();

// List & Stats
router.get("/", getBookings);
router.get("/stats", getBookingStats);

// Notification Management
router.post("/mark-read", markAsRead);
router.post("/mark-all-read", markAllAsRead);

// Single Booking (also marks as read)
router.get("/:id", getBooking);
router.patch("/:id/resolve-attention", resolveAttention);

// Admin-driven pricing: set the partner price on an unpriced booking.
router.patch("/:id/set-price", setBookingPrice);

// Vendor Assignment
router.get("/:bookingId/available-vendors", getAvailableVendors);
router.patch("/:id/assign-vendor", assignVendor);
// Re-offer at a revised payout (only valid after PRICE_TOO_LOW
// rejection at attempt 1). Body: { payoutAmount }.
router.post("/:id/re-offer", reOfferBooking);
router.post("/:id/vendor-rejection", recordVendorRejection);

// Status Management
router.patch("/:id/status", updateBookingStatus);
router.patch("/:id/cancel", cancelBooking);

// Modify booking details (unrestricted — no lead-time / status gate).
router.patch("/:id/modify", modifyBooking);
router.patch("/:id/authorize-upgrade", authorizeCategoryUpgrade);

// Download Purchase Order PDF (HTML for browser print-to-PDF)
router.get("/:id/po", downloadBookingPO);

export default router;
