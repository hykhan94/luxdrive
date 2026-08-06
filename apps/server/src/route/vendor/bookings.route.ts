// ============================================
// !!! DESTINATION PATH: apps/server/src/route/vendor/bookings.route.ts
// ============================================
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
  reassignBooking,
  acceptBookingModification,
  rejectBookingModification,
  cancelBooking,
  startTrip,
  completeTrip,
  exportBookingsCsv,
  downloadBookingPO,
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

// Reassign driver/vehicle on a confirmed booking
router.post("/:bookingId/reassign", reassignBooking);

// Accept / reject a change on a confirmed booking
router.post("/:bookingId/modification/accept", acceptBookingModification);
router.post("/:bookingId/modification/reject", rejectBookingModification);

// Vendor cancels a confirmed booking (returns it to admin as PENDING)
router.post("/:bookingId/cancel", cancelBooking);

// Start trip (CONFIRMED → IN_PROGRESS)
router.patch("/:bookingId/start", startTrip);

// Complete trip (IN_PROGRESS → COMPLETED)
router.patch("/:bookingId/complete", completeTrip);

// PO download — vendor perspective (partner section hidden, source
// tag suppressed). Scoped to bookings belonging to this vendor.
router.get("/:bookingId/po", downloadBookingPO);

export default router;
