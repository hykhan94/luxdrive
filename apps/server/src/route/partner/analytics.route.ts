// ============================================
// apps/server/src/route/partner/analytics.route.ts
// Partner Portal — Reports & Analytics Routes
// ============================================

import { Router } from "express";
import { getAnalytics } from "../../controller/partner/analytics.controller";

const router = Router();

// GET /api/v1/partner/analytics
router.get("/", getAnalytics);

export default router;
