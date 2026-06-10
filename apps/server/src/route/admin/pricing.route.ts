// ============================================
// apps/server/src/route/admin/pricing.route.ts
// UPDATED: Added GET /audit-logs endpoint
// ============================================

import { Router } from "express";
import {
  getPricingConfig,
  updateDistancePricing,
  updatePeakPricing,
  updateAdditionalServices,
  updateMarginConfig,
  saveAllPricing,
  resetToDefaults,
  calculatePricePreview,
  getPeakPreview,
  getPricingAuditLogs,
} from "../../controller/admin/pricing.controller";

const router = Router();

// Get all pricing config
router.get("/", getPricingConfig);

// Individual updates
router.put("/distance", updateDistancePricing);
router.put("/peak", updatePeakPricing);
router.put("/services", updateAdditionalServices);
router.put("/margin", updateMarginConfig);

// Save all at once
router.post("/save", saveAllPricing);

// Reset to defaults
router.post("/reset", resetToDefaults);

// Previews
router.get("/preview", calculatePricePreview);
router.get("/peak-preview", getPeakPreview);

// Audit logs (pricing-specific)
router.get("/audit-logs", getPricingAuditLogs);

export default router;
