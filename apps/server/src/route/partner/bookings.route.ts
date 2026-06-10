// ============================================
// apps/server/src/route/partner/bookings-repo.route.ts
// Partner Portal — Bookings Repository Routes
// ============================================

import { Router } from "express";
import {
  getBookingsList,
  getBookingDetail,
  exportBookingsCsv,
  downloadBookingPO,
} from "../../controller/partner/bookings.controller";

const router = Router();

// ============== BOOKINGS LIST (with tab filtering) ==============
// GET /api/v1/partner/bookings-repo?tab=upcoming&page=1&limit=10
// GET /api/v1/partner/bookings-repo?tab=pending&search=Ahmed
// GET /api/v1/partner/bookings-repo?tab=all&startDate=2026-05-01&endDate=2026-05-31
router.get("/", getBookingsList);

// ============== EXPORT CSV (respects active tab/filter) ==============
// GET /api/v1/partner/bookings-repo/export?tab=completed
// GET /api/v1/partner/bookings-repo/export?tab=today
router.get("/export", exportBookingsCsv);

// ============== SINGLE BOOKING DETAIL (with status timeline) ==============
// GET /api/v1/partner/bookings-repo/:bookingId
router.get("/:bookingId", getBookingDetail);

// ============== DOWNLOAD PURCHASE ORDER PDF ==============
// GET /api/v1/partner/bookings-repo/:bookingId/po
router.get("/:bookingId/po", downloadBookingPO);

export default router;
