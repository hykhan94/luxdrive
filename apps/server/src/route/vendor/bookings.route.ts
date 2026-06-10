// ============================================
// apps/server/src/route/vendor/bookings.route.ts
// Vendor Portal — Bookings Routes
// ============================================

import { Router } from "express";
import {
  getBookingsList,
  getBookingDetail,
  getAssignmentOptions,
  acceptBooking,
  rejectBooking,
  startTrip,
  completeTrip,
  exportBookingsCsv,
} from "../../controller/vendor/bookings.controller";

const router = Router();

// CSV export — must be before /:bookingId to avoid route conflict
router.get("/export/csv", exportBookingsCsv);

// Bookings list with tab filtering
router.get("/", getBookingsList);

// Booking detail
router.get("/:bookingId", getBookingDetail);

// Assignment options (available drivers & vehicles for a booking)
router.get("/:bookingId/assignment-options", getAssignmentOptions);

// Accept booking (assign driver + vehicle)
router.post("/:bookingId/accept", acceptBooking);

// Reject/decline booking
router.post("/:bookingId/reject", rejectBooking);

// Start trip (CONFIRMED → IN_PROGRESS)
router.patch("/:bookingId/start", startTrip);

// Complete trip (IN_PROGRESS → COMPLETED)
router.patch("/:bookingId/complete", completeTrip);

export default router;
