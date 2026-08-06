// ============================================
// apps/server/src/route/cron.route.ts
// External-scheduler triggers for daily billing. Guarded by a shared
// secret header (requireCronSecret), NOT a logged-in session.
// ============================================

import { Router } from "express";
import {
  requireCronSecret,
  runDailyInvoices,
  listJobs,
  runNamedJob,
  runDailyPayouts,
  runOverdueSweep,
  runAllDaily,
} from "../controller/cron.controller";

const router = Router();

router.use(requireCronSecret);

router.post("/daily-invoices", runDailyInvoices);
router.post("/daily-payouts", runDailyPayouts);
router.post("/overdue-sweep", runOverdueSweep);
router.post("/run-all", runAllDaily);

// Generic: run/list any registered job (MOU, doc-expiry, inline jobs).
router.get("/jobs", listJobs);
router.post("/run/:job", runNamedJob);

export default router;
