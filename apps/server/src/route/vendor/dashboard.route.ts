import { Router } from "express";
import {
  getDashboardSummary,
  getRecentBookings,
  getCalendarData,
  getTopDrivers,
  getPendingPayouts,
} from "../../controller/vendor/dashboard.controller";

const router = Router();

router.get("/summary", getDashboardSummary);
router.get("/bookings", getRecentBookings);
router.get("/calendar", getCalendarData);
router.get("/top-drivers", getTopDrivers);
router.get("/payouts", getPendingPayouts);

export default router;
