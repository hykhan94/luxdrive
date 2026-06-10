// ============================================
// apps/server/src/route/admin/user.route.ts
// ============================================

import { Router } from "express";
import {
  getUserSummary,
  getUsers,
  getUserDetails,
  deactivateUser,
  reactivateUser,
  getUserBookings,
} from "../../controller/admin/user.controller";

const router = Router();

// ============== SUMMARY ==============
router.get("/summary", getUserSummary);

// ============== LIST ==============
router.get("/", getUsers);

// ============== USER-SPECIFIC ROUTES (with :id) ==============
router.get("/:id", getUserDetails);
router.patch("/:id/deactivate", deactivateUser);
router.patch("/:id/reactivate", reactivateUser);
router.get("/:id/bookings", getUserBookings);

export default router;
