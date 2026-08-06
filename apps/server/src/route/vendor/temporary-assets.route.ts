// ============================================
// !!! DESTINATION PATH: apps/server/src/route/vendor/temporary-assets.route.ts
// ============================================
// Vendor Portal — Temporary (ad-hoc) vehicles & drivers.

import { Router } from "express";
import {
  createTemporaryVehicle,
  createTemporaryDriver,
  listTemporaryVehicles,
  listTemporaryDrivers,
  reactivateTemporaryAsset,
} from "../../controller/vendor/temporary-asset.controller";

const router = Router();

// Vehicles
router.get("/vehicles", listTemporaryVehicles);
router.post("/vehicles", createTemporaryVehicle);

// Drivers
router.get("/drivers", listTemporaryDrivers);
router.post("/drivers", createTemporaryDriver);

// Reactivate an archived single-use asset — body: { type, id }
router.post("/reactivate", reactivateTemporaryAsset);

export default router;
