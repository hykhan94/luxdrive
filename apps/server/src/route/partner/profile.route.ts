// ============================================
// apps/server/src/route/partner/profile.route.ts
// Partner Portal — Company Profile Routes
// ============================================

import { Router } from "express";
import {
  getCompanyProfile,
  updateCompanyInfo,
  updateBankDetails,
  uploadDocument,
  uploadMou,
  uploadLogo,
  submitProfileForReview,
  getTeamMembers,
  addTeamMember,
  resendTeamMemberInvite,
  updateTeamMemberRole,
  deactivateTeamMember,
  reactivateTeamMember,
  removeTeamMember,
  getAvailableRoles,
  requestProfileChanges,
  getChangeRequests,
} from "../../controller/partner/profile.controller";

const router = Router();

// ============== COMPANY PROFILE ==============
// GET  /api/v1/partner/profile
router.get("/", getCompanyProfile);

// PATCH /api/v1/partner/profile/company-info
router.patch("/company-info", updateCompanyInfo);

// PATCH /api/v1/partner/profile/bank-details
router.patch("/bank-details", updateBankDetails);

// ============== DOCUMENTS ==============
// POST /api/v1/partner/profile/documents  { type, fileUrl, fileName, expiryDate }
router.post("/documents", uploadDocument);

// ============== MOU ==============
// POST /api/v1/partner/profile/mou  { fileUrl, expiryDate }
router.post("/mou", uploadMou);

// ============== LOGO ==============
// POST /api/v1/partner/profile/logo  { logoUrl }
router.post("/logo", uploadLogo);

// ============== SUBMIT FOR REVIEW ==============
// POST /api/v1/partner/profile/submit
router.post("/submit", submitProfileForReview);

// ============== TEAM MEMBERS ==============
// GET  /api/v1/partner/profile/team
router.get("/team", getTeamMembers);

// GET  /api/v1/partner/profile/team/roles
router.get("/team/roles", getAvailableRoles);

// POST /api/v1/partner/profile/team  { name, email, phone, role }
router.post("/team", addTeamMember);

// POST /api/v1/partner/profile/team/:memberId/resend
router.post("/team/:memberId/resend", resendTeamMemberInvite);

// PATCH /api/v1/partner/profile/team/:memberId/role  { role }
router.patch("/team/:memberId/role", updateTeamMemberRole);

// PATCH /api/v1/partner/profile/team/:memberId/deactivate
router.patch("/team/:memberId/deactivate", deactivateTeamMember);

// PATCH /api/v1/partner/profile/team/:memberId/reactivate
router.patch("/team/:memberId/reactivate", reactivateTeamMember);

// DELETE /api/v1/partner/profile/team/:memberId
router.delete("/team/:memberId", removeTeamMember);

router.post("/change-request", requestProfileChanges);
router.get("/change-requests", getChangeRequests);

export default router;
