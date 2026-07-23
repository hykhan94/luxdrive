// ============================================
// apps/server/src/route/partner/book-ride.route.ts
// Partner Portal — Book a Ride
//
// Post partner-priced-bookings refactor:
//   Removed: /routes, /vehicle-options, /price-breakdown
//     (all tariff-driven; partner now enters price directly)
//   Available cities + per-city vehicle-class availability come
//     from /api/v1/partner/cities.
// ============================================

import { Router } from "express";
import {
  createBooking,
  getBookingDetail,
  cancelBooking,
} from "../../controller/partner/book-ride.controller";

const router = Router();

// ============== BOOKING CRUD ==============
router.post("/", createBooking);
router.get("/:bookingId", getBookingDetail);
router.patch("/:bookingId/cancel", cancelBooking);

export default router;
