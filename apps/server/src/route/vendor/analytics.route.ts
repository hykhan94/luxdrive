// ============================================
// apps/server/src/route/vendor/analytics.route.ts
// Vendor Portal — Reports & Analytics Routes
// ============================================

import { Router } from "express";
import {
  getAnalytics,
  exportAnalyticsReport,
} from "../../controller/vendor/analytics.controller";

const router = Router();

// Get full analytics data
// GET /api/v1/vendor/analytics?period=weekly|monthly|quarterly|yearly&vehiclePage=1&vehicleLimit=10
router.get("/", getAnalytics);

// Export analytics report as CSV
// GET /api/v1/vendor/analytics/export?period=weekly|monthly|quarterly|yearly
router.get("/export", exportAnalyticsReport);

export default router;
