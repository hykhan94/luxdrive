// ============================================
// !!! DESTINATION PATH: apps/server/src/route/admin/booking-policy.route.ts
// ============================================
import { Router } from "express";
import {
  getBookingPolicy,
  updateBookingPolicy,
} from "../../controller/admin/booking-policy.controller";

const router = Router();

router.get("/", getBookingPolicy);
router.patch("/", updateBookingPolicy);

export default router;
