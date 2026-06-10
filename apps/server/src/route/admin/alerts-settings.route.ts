// ============================================
// apps/server/src/route/admin/alerts-settings.route.ts
// ============================================

import { Router } from "express";
import {
  // Unactioned Bookings Alert
  getAlertsSummary,
  getUnactionedBookings,
  getAvailableVendorsForAlert,
  assignVendorFromAlert,
  // Loyalty Program Settings
  getLoyaltyConfig,
  updatePointsPerSar,
  updateBirthdayDiscount,
  updateTierThresholds,
  updateFreeRideRedemption,
  saveLoyaltyConfig,
  // WhatsApp Template
  getWhatsAppTemplate,
  updateWhatsAppTemplate,
  toggleWhatsAppTemplate,
  previewWhatsAppTemplate,
} from "../../controller/admin/alerts-settings.controller";

const router = Router();

// ============== UNACTIONED BOOKINGS ALERT ==============
router.get("/unactioned-bookings/summary", getAlertsSummary);
router.get("/unactioned-bookings", getUnactionedBookings);
router.get(
  "/unactioned-bookings/:bookingId/available-vendors",
  getAvailableVendorsForAlert,
);
router.patch(
  "/unactioned-bookings/:bookingId/assign-vendor",
  assignVendorFromAlert,
);

// ============== LOYALTY PROGRAM SETTINGS ==============
router.get("/loyalty", getLoyaltyConfig);
router.put("/loyalty/points-per-sar", updatePointsPerSar);
router.put("/loyalty/birthday-discount", updateBirthdayDiscount);
router.put("/loyalty/tier-thresholds", updateTierThresholds);
router.put("/loyalty/free-ride-redemption", updateFreeRideRedemption);
router.post("/loyalty/save", saveLoyaltyConfig);

// ============== WHATSAPP TEMPLATE ==============
router.get("/whatsapp", getWhatsAppTemplate);
router.put("/whatsapp/template", updateWhatsAppTemplate);
router.patch("/whatsapp/toggle", toggleWhatsAppTemplate);
router.get("/whatsapp/preview", previewWhatsAppTemplate);

export default router;
