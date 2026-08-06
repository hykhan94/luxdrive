// ============================================
// !!! DESTINATION PATH: apps/server/src/route/admin/temporary-assets.route.ts
// ============================================
// Admin Portal — approval queue for vendor temporary vehicles & drivers.

import { Router } from "express";
import {
  listTemporaryAssets,
  approveTemporaryVehicle,
  rejectTemporaryVehicle,
  approveTemporaryDriver,
  rejectTemporaryDriver,
} from "../../controller/admin/temporary-asset.controller";

const router = Router();

// Approval queue (default: PENDING_APPROVAL) — ?status=ACTIVE|ARCHIVED|REJECTED
router.get("/", listTemporaryAssets);

// Vehicle review
router.patch("/vehicles/:id/approve", approveTemporaryVehicle);
router.patch("/vehicles/:id/reject", rejectTemporaryVehicle);

// Driver review
router.patch("/drivers/:id/approve", approveTemporaryDriver);
router.patch("/drivers/:id/reject", rejectTemporaryDriver);

export default router;
