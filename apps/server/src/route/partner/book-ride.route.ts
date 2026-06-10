// ============================================
// apps/server/src/route/partner/booking.route.ts
// Partner Portal — Booking Routes
// ============================================

import { Router } from "express";
import {
  getAvailableRoutes,
  getVehicleOptions,
  getPriceBreakdown,
  createBooking,
  getBookingDetail,
  cancelBooking,
} from "../../controller/partner/book-ride.controller";

const router = Router();

// ============== ROUTE & VEHICLE LOOKUP (for booking form) ==============
router.get("/routes", getAvailableRoutes); // ?city=RIYADH&tripType=ONE_WAY
router.get("/vehicle-options", getVehicleOptions); // ?routeId=xxx&isElectric=false
router.post("/price-breakdown", getPriceBreakdown); // { routeId, vehicleClass, isElectric }

// ============== BOOKING CRUD ==============
router.post("/", createBooking); // Create new booking
router.get("/:bookingId", getBookingDetail); // Get single booking detail
router.patch("/:bookingId/cancel", cancelBooking); // Cancel a booking

export default router;
