// ============================================
// apps/server/src/controller/cron.controller.ts
//
// HTTP triggers for the daily billing generators, for use by an external
// scheduler (GCP Cloud Scheduler, or an OS crontab hitting these with
// curl) instead of in-process node-cron.
//
// These run the exact same functions as the node-cron jobs and the
// `yarn run-crons` script — the only difference is what pulls the
// trigger. Secured by a shared secret header, NOT a logged-in session,
// because a scheduler has no session.
// ============================================

import { Request, Response, NextFunction } from "express";
import { asyncWrapper } from "../utils/asyncWrapper";
import {
  runPartnerDailyInvoiceGeneration,
  runVendorDailyPayoutGeneration,
  runPartnerOverdueSuspension,
} from "../lib/cron-jobs";
// Registry of ALL scheduled jobs (billing + MOU + document-expiry +
// inline), populated when lib/cron loads. Lets the generic run/:job
// endpoint trigger any of them.
import { CRON_REGISTRY } from "../lib/cron";

/**
 * Shared-secret guard. FAILS CLOSED: if CRON_SECRET is not configured,
 * every request is rejected, so the endpoint can never be left wide open
 * by a missing env var.
 */
export function requireCronSecret(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const expected = process.env.CRON_SECRET;
  const provided = req.header("X-Cron-Secret");
  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

// Optional targetDay (YYYY-MM-DD) from body or query, for manual backfill.
// Absent = the generators' default (yesterday), which is what the daily
// schedule wants.
function parseTargetDay(req: Request): Date | undefined {
  const raw = (req.body?.targetDay ?? req.query?.targetDay) as
    | string
    | undefined;
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// POST /api/v1/cron/daily-invoices
export const runDailyInvoices = asyncWrapper(
  async (req: Request, res: Response) => {
    const result = await runPartnerDailyInvoiceGeneration(parseTargetDay(req));
    res.json({ success: true, job: "partner-daily-invoices", result });
  },
);

// POST /api/v1/cron/daily-payouts
export const runDailyPayouts = asyncWrapper(
  async (req: Request, res: Response) => {
    const result = await runVendorDailyPayoutGeneration(parseTargetDay(req));
    res.json({ success: true, job: "vendor-daily-payouts", result });
  },
);

// POST /api/v1/cron/overdue-sweep
export const runOverdueSweep = asyncWrapper(
  async (_req: Request, res: Response) => {
    const result = await runPartnerOverdueSuspension();
    res.json({ success: true, job: "partner-overdue-sweep", result });
  },
);

// POST /api/v1/cron/run-all — invoices, payouts, then the overdue sweep.
export const runAllDaily = asyncWrapper(async (req: Request, res: Response) => {
  const targetDay = parseTargetDay(req);
  const invoices = await runPartnerDailyInvoiceGeneration(targetDay);
  const payouts = await runVendorDailyPayoutGeneration(targetDay);
  const overdue = await runPartnerOverdueSuspension();
  res.json({ success: true, results: { invoices, payouts, overdue } });
});

// GET /api/v1/cron/jobs — list every registered job name.
export const listJobs = asyncWrapper(async (_req: Request, res: Response) => {
  res.json({ success: true, jobs: Object.keys(CRON_REGISTRY).sort() });
});

// POST /api/v1/cron/run/:job — run ANY registered job by name. Covers the
// MOU checks, profile-document checks, and the inline overdue-invoice /
// vehicle-doc / driver-doc jobs. (Billing jobs that accept a targetDay
// have dedicated endpoints above; this runs them for the default day.)
export const runNamedJob = asyncWrapper(async (req: Request, res: Response) => {
  const { job } = req.params;
  const fn = CRON_REGISTRY[job];
  if (!fn) {
    return res.status(404).json({
      success: false,
      message: `Unknown cron job "${job}".`,
      available: Object.keys(CRON_REGISTRY).sort(),
    });
  }
  const result = await fn();
  res.json({ success: true, job, result: result ?? null });
});
