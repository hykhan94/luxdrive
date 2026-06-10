// ============================================
// apps/server/src/route/admin/overview.route.ts
// ============================================

import { Router } from "express";
import {
  getOverviewStats,
  getRecentBookings,
  getPaymentOverview,
  getOverviewAlertsSummary,
} from "../../controller/admin/overview.controller";

const router = Router();

router.get("/stats", getOverviewStats);
router.get("/recent-bookings", getRecentBookings);
router.get("/payment-summary", getPaymentOverview);
router.get("/alerts-summary", getOverviewAlertsSummary);

export default router;
