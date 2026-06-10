// ============================================
// apps/server/src/route/vendor/drivers.route.ts
// Vendor Portal — Driver Management Routes
// ============================================

import { Router } from "express";
import {
  getDriversList,
  addDriver,
  getDriverDetail,
  updateDriverInfo,
  uploadDriverDocument,
  requestDriverChanges,
  getDriverChangeRequests,
  submitDriverForReview,
  assignVehicle,
  toggleDriverActive,
  deleteDriver,
  getAvailableVehicles,
} from "../../controller/vendor/drivers.controller";
import { verifyDriverPhoto } from "../../controller/vendor/driver-photo.controller";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

// Verify driver photo dress code (must be before /:driverId)
router.post("/verify-photo", upload.single("photo"), verifyDriverPhoto);

// Available vehicles for assignment (must be before /:driverId)
router.get("/available-vehicles", getAvailableVehicles);

// Driver list + add
router.get("/", getDriversList);
router.post("/", addDriver);

// Driver detail
router.get("/:driverId", getDriverDetail);

// Update driver info (when editable)
router.patch("/:driverId", updateDriverInfo);

// Upload/replace driver document
router.post("/:driverId/documents", uploadDriverDocument);

// Change request system (for approved drivers)
router.post("/:driverId/change-request", requestDriverChanges);
router.get("/:driverId/change-requests", getDriverChangeRequests);

// Submit for review after changes
router.post("/:driverId/submit", submitDriverForReview);

// Assign/unassign vehicle
router.patch("/:driverId/vehicle", assignVehicle);

// Toggle active/inactive
router.patch("/:driverId/toggle-active", toggleDriverActive);

// Soft delete driver
router.delete("/:driverId", deleteDriver);

export default router;
