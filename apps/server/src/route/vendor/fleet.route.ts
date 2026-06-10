// ============================================
// apps/server/src/route/vendor/fleet.route.ts
// Vendor Portal — Fleet Management Routes
// ============================================

import { Router } from "express";
import {
  getVehiclesList,
  addVehicle,
  getVehicleDetail,
  updateVehicleInfo,
  uploadVehicleDocument,
  requestVehicleChanges,
  submitVehicleForReview,
  assignDriver,
  deleteVehicle,
  toggleVehicleStatus,
  getAvailableDrivers,
  getVehicleChangeRequests,
  getVehicleCatalog,
} from "../../controller/vendor/fleet.controller";

const router = Router();

// Catalog of makes + models (must be before /:vehicleId)
router.get("/catalog", getVehicleCatalog);

// Available drivers (must be before /:vehicleId to avoid route conflict)
router.get("/available-drivers", getAvailableDrivers);

// Vehicle list + add
router.get("/", getVehiclesList);
router.post("/", addVehicle);

// Vehicle detail
router.get("/:vehicleId", getVehicleDetail);

// Update vehicle info (when editable)
router.patch("/:vehicleId", updateVehicleInfo);

// Upload/replace vehicle document
router.post("/:vehicleId/documents", uploadVehicleDocument);

// Change request system (for approved vehicles)
router.post("/:vehicleId/change-request", requestVehicleChanges);
router.get("/:vehicleId/change-requests", getVehicleChangeRequests);

// Submit for review after changes
router.post("/:vehicleId/submit", submitVehicleForReview);

// Assign/unassign driver
router.patch("/:vehicleId/driver", assignDriver);

// Toggle status (activate/deactivate/maintenance)
router.patch("/:vehicleId/status", toggleVehicleStatus);

// Delete vehicle
router.delete("/:vehicleId", deleteVehicle);

export default router;
