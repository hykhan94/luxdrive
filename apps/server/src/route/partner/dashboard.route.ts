// ============================================
// apps/server/src/route/partner/dashboard.route.ts
// Partner Portal — Dashboard Routes
// ============================================

import { Router } from "express";
import {
  getProfileStatus,
  getDashboardSummary,
  getPartnerBookings,
  exportBookingsCsv,
  getCalendarData,
  getContractAndVehicleStats,
} from "../../controller/partner/dashboard.controller";

const router = Router();

// ============== PROFILE STATUS (ungated — always accessible) ==============
router.get("/profile-status", getProfileStatus);

// ============== DASHBOARD SUMMARY TILES ==============
router.get("/summary", getDashboardSummary);

// ============== BOOKINGS LIST (paginated, searchable) ==============
router.get("/bookings", getPartnerBookings);

// ============== EXPORT BOOKINGS AS CSV ==============
router.get("/bookings/export", exportBookingsCsv);

// ============== CALENDAR DATA ==============
router.get("/calendar", getCalendarData);

// ============== CONTRACT STATUS & VEHICLE USAGE ==============
router.get("/contract-stats", getContractAndVehicleStats);

export default router;
