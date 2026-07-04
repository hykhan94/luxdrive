// ============================================
// apps/server/src/route/admin/partner.route.ts
// ============================================

import { Router } from "express";
import {
  // Summary & Stats
  getPartnerSummary,
  getPartnerNotifications,
  // List & Details
  getPartners,
  getPartnerDetails,
  // Invitation
  invitePartner,
  resendInvitation,
  // Profile Review
  getPendingReviews,
  getPartnerProfileForReview,
  addReviewComment,
  approvePartner,
  requestChanges,
  // Status Management
  suspendPartner,
  reactivatePartner,
  // MOU
  checkExpiringMous,
  getExpiringMous,
  // Update
  updatePartner,
  // Bookings
  getPartnerBookings,
  resolveReviewComment,
} from "../../controller/admin/partner.controller";

const router = Router();

// ============== SUMMARY & STATS ==============
router.get("/summary", getPartnerSummary);
router.get("/notifications", getPartnerNotifications);

// ============== LIST & DETAILS ==============
router.get("/", getPartners);
router.get("/:id", getPartnerDetails);

// ============== INVITATION ==============
router.post("/invite", invitePartner);
router.post("/:id/resend-invitation", resendInvitation);

// ============== PROFILE REVIEW ==============
router.get("/reviews/pending", getPendingReviews);
router.get("/:id/review", getPartnerProfileForReview);
router.post("/:id/review/comment", addReviewComment);
router.patch("/:id/approve", approvePartner);
router.patch("/:id/request-changes", requestChanges);

// ============== STATUS MANAGEMENT ==============
router.patch("/:id/suspend", suspendPartner);
router.patch("/:id/reactivate", reactivatePartner);

// ============== MOU ==============
router.get("/mou/expiring", getExpiringMous);
router.post("/mou/check-expiring", checkExpiringMous); // For scheduled job

// ============== UPDATE ==============
router.patch("/:id", updatePartner);

// ============== PARTNER BOOKINGS ==============
router.get("/:id/bookings", getPartnerBookings);

// ============== PARTNER REVIEW COMMENTS ==============
router.patch("/:id/review/comment/:commentId/resolve", resolveReviewComment);

export default router;
