// ============================================
// apps/server/src/route/vendor/profile.route.ts
// Vendor Portal — Profile Routes
// ============================================

import { Router } from "express";
import {
  getVendorProfile,
  updateCompanyInfo,
  updateBankDetails,
  uploadDocument,
  uploadMou,
  uploadLogo,
  submitProfileForReview,
  requestProfileChanges,
  getProfileChangeRequests,
  getTeamMembers,
  getAvailableRoles,
} from "../../controller/vendor/profile.controller";

const router = Router();

// Get full vendor profile
router.get("/", getVendorProfile);

// Update company info (when editable)
router.patch("/company-info", updateCompanyInfo);

// Update bank details (when editable)
router.patch("/bank-details", updateBankDetails);

// Upload business document (CR, VAT, Chamber, Balady, National Address, IBAN Letter)
router.post("/documents", uploadDocument);

// Upload MOU document
router.post("/mou", uploadMou);

// Upload company logo
router.post("/logo", uploadLogo);

// Submit profile for admin review
router.post("/submit", submitProfileForReview);

// Request profile changes (for approved vendors)
router.post("/change-request", requestProfileChanges);

// Get all change requests for this vendor (used by detail panel)
router.get("/change-requests", getProfileChangeRequests);

// Team members
router.get("/team", getTeamMembers);
router.get("/roles", getAvailableRoles);

export default router;
