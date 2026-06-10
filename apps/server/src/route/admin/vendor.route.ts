// ============================================
// apps/server/src/route/admin/vendor.route.ts
// ============================================

import { Router } from "express";
import {
  getVendorSummary,
  getVendorNotifications,
  getVendorsWithPendingFleetReviews,
  getVendors,
  getVendorDetails,
  onboardVendor,
  resendVendorInvitation,
  getVendorPendingReviews,
  getVendorProfileForReview,
  addVendorReviewComment,
  resolveVendorReviewComment,
  approveVendor,
  requestVendorChanges,
  suspendVendor,
  reactivateVendor,
  updateVendorBankDetails,
  getBankUpdateRequests,
  getBankUpdateRequestDetail,
  approveBankUpdateRequest,
  rejectBankUpdateRequest,
  getVendorDrivers,
  getVendorDriverDetail,
  approveDriver,
  requestDriverChanges,
  addDriverReviewComment,
  resolveDriverReviewComment,
  getVendorVehicles,
  getVendorVehicleDetail,
  approveVehicle,
  requestVehicleChanges,
  addVehicleReviewComment,
  resolveVehicleReviewComment,
  getVendorExpiringMous,
  getVendorBookings,
} from "../../controller/admin/vendor.controller";

const router = Router();

router.get("/summary", getVendorSummary);
router.get("/notifications", getVendorNotifications);
router.get("/pending-fleet-reviews", getVendorsWithPendingFleetReviews);
router.get("/", getVendors);
router.post("/onboard", onboardVendor);
router.get("/reviews/pending", getVendorPendingReviews);
router.get("/bank-requests", getBankUpdateRequests);
router.get("/bank-requests/:requestId", getBankUpdateRequestDetail);
router.patch("/bank-requests/:requestId/approve", approveBankUpdateRequest);
router.patch("/bank-requests/:requestId/reject", rejectBankUpdateRequest);
router.get("/mou/expiring", getVendorExpiringMous);
router.get("/:id", getVendorDetails);
router.post("/:id/resend-invitation", resendVendorInvitation);
router.get("/:id/review", getVendorProfileForReview);
router.post("/:id/review/comment", addVendorReviewComment);
router.patch(
  "/:id/review/comment/:commentId/resolve",
  resolveVendorReviewComment,
);
router.patch("/:id/approve", approveVendor);
router.patch("/:id/request-changes", requestVendorChanges);
router.patch("/:id/suspend", suspendVendor);
router.patch("/:id/reactivate", reactivateVendor);
router.patch("/:id/bank-details", updateVendorBankDetails);

// Drivers
router.get("/:id/drivers", getVendorDrivers);
router.get("/:id/drivers/:driverId", getVendorDriverDetail);
router.patch("/:id/drivers/:driverId/approve", approveDriver);
router.patch("/:id/drivers/:driverId/request-changes", requestDriverChanges);
router.post("/:id/drivers/:driverId/review/comment", addDriverReviewComment);
router.patch(
  "/:id/drivers/:driverId/review/comment/:commentId/resolve",
  resolveDriverReviewComment,
);

// Vehicles
router.get("/:id/vehicles", getVendorVehicles);
router.get("/:id/vehicles/:vehicleId", getVendorVehicleDetail);
router.patch("/:id/vehicles/:vehicleId/approve", approveVehicle);
router.patch("/:id/vehicles/:vehicleId/request-changes", requestVehicleChanges);
router.post("/:id/vehicles/:vehicleId/review/comment", addVehicleReviewComment);
router.patch(
  "/:id/vehicles/:vehicleId/review/comment/:commentId/resolve",
  resolveVehicleReviewComment,
);

router.get("/:id/bookings", getVendorBookings);

export default router;
