import cron from "node-cron";
import { prisma } from "./prisma";
import {
  runPartnerMouCheck,
  runVendorMouCheck,
  runPartnerOverdueSuspension,
  runPartnerMonthlyInvoiceGeneration,
  runVendorMonthlyPayoutGeneration,
  runVendorProfileDocCheck,
  runPartnerProfileDocCheck,
} from "./cron-jobs";

const KSA_TZ = "Asia/Riyadh";

// ============== MONTHLY INVOICE GENERATION ==============
// Runs on the 1st of every month at 2:00 AM KSA
cron.schedule(
  "0 2 1 * *",
  async () => {
    console.log("[CRON] Starting monthly invoice generation...");
    try {
      const result = await runPartnerMonthlyInvoiceGeneration();
      console.log(
        `[CRON] Monthly invoices done: ${result.created} created, ${result.skipped} skipped out of ${result.totalPartners} partners`,
      );
    } catch (error) {
      console.error("[CRON] Monthly invoice generation failed:", error);
    }
  },
  { timezone: KSA_TZ },
);

// ============== OVERDUE INVOICE CHECK ==============
// Runs daily at 8:00 AM KSA
cron.schedule(
  "0 8 * * *",
  async () => {
    console.log("[CRON] Checking for overdue invoices...");

    try {
      const now = new Date();

      const overdueInvoices = await prisma.partnerInvoice.findMany({
        where: {
          status: "PENDING",
          dueDate: { lt: now },
        },
        include: {
          partner: { select: { id: true, companyName: true, userId: true } },
        },
      });

      if (overdueInvoices.length === 0) {
        console.log("[CRON] No overdue invoices found");
        return;
      }

      for (const invoice of overdueInvoices) {
        await prisma.partnerInvoice.update({
          where: { id: invoice.id },
          data: { status: "OVERDUE" },
        });

        await prisma.notification.create({
          data: {
            userId: invoice.partner.userId,
            title: "Invoice Overdue",
            message: `Invoice ${invoice.invoiceNumber} of SAR ${Number(invoice.amount).toFixed(2)} is now overdue. Please arrange payment immediately.`,
            type: "INVOICE_OVERDUE",
            data: {
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
            },
          },
        });
      }

      console.log(
        `[CRON] Marked ${overdueInvoices.length} invoice(s) as overdue`,
      );
    } catch (error) {
      console.error("[CRON] Overdue check failed:", error);
    }
  },
  { timezone: KSA_TZ },
);

// ============== MOU EXPIRY CHECK ==============
// Runs daily at 9:00 AM KSA
//
// Two passes:
//   1. AUTO-SUSPEND any APPROVED partner whose MOU has already expired.
//      The MOU is the formal agreement underpinning the partnership;
//      letting it lapse breaks the legal basis for service, so the
//      partner is moved to SUSPENDED with a clear reason. They can be
//      reactivated by admin after they upload a renewed MOU.
//      (Other docs — CR, VAT, etc. — only generate notifications,
//      never auto-suspend. That's a deliberate scope choice: only the
//      MOU is mission-critical at this level.)
//   2. NOTIFY APPROVED partners whose MOU expires within 2 months but
//      hasn't expired yet. Single-fire per MOU via mouExpiryNotified.
cron.schedule(
  "0 9 * * *",
  async () => {
    console.log("[CRON] Checking partner MOUs...");
    try {
      const result = await runPartnerMouCheck();
      console.log(
        `[CRON] Partner MOU: ${result.suspended} auto-suspended, ${result.notified} notified`,
      );
    } catch (error) {
      console.error("[CRON] Partner MOU check failed:", error);
    }
  },
  { timezone: KSA_TZ },
);

// ============== VEHICLE DOCUMENT EXPIRY CHECK ==============
// Runs daily at 9:30 AM KSA
// Cadence:
//   - 30 days before expiry: first warning notification
//   - Every 7 days thereafter until expiry: weekly reminder
//   - On/past expiry: suspend the vehicle (isActive=false, suspendedForDocs=true)
//   - Per-doc tracking via lastExpiryNotifiedAt prevents duplicate notifications.
cron.schedule(
  "30 9 * * *",
  async () => {
    console.log("[CRON] Checking vehicle document expiry...");

    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      );

      // ---- 1. Send 30-day-then-weekly notifications for docs in the warning window ----
      const expiringDocs = await prisma.vehicleDocument.findMany({
        where: {
          expiryDate: { lte: thirtyDaysFromNow, gt: now },
          vehicle: { status: "APPROVED", isActive: true },
        },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              plateNumber: true,
              vendorId: true,
              vendor: { select: { userId: true, companyName: true } },
            },
          },
        },
      });

      let notifiedCount = 0;
      for (const doc of expiringDocs) {
        const lastNotified = doc.lastExpiryNotifiedAt;
        const daysLeft = Math.ceil(
          (doc.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        // Send if: never notified yet, OR last notified at least 7 days ago
        const shouldNotify =
          !lastNotified ||
          now.getTime() - lastNotified.getTime() >= 7 * 24 * 60 * 60 * 1000;

        if (!shouldNotify) continue;

        const isFirst = !lastNotified;
        const vehicleLabel = `${doc.vehicle.make} ${doc.vehicle.model} (${doc.vehicle.plateNumber})`;
        const title = isFirst
          ? `Vehicle document expiring in ${daysLeft} days`
          : `Reminder: ${doc.type} expires in ${daysLeft} days`;
        const message = isFirst
          ? `Your ${vehicleLabel}'s ${doc.type} document expires in ${daysLeft} days. Please upload a renewed document. If not updated, this vehicle will be suspended on the expiry date.`
          : `${vehicleLabel}'s ${doc.type} expires in ${daysLeft} days. The vehicle will be suspended automatically once expired unless renewed.`;

        await prisma.notification.create({
          data: {
            userId: doc.vehicle.vendor.userId,
            title,
            message,
            type: "VEHICLE_DOC_EXPIRING",
            data: {
              vehicleId: doc.vehicle.id,
              docId: doc.id,
              docType: doc.type,
              daysLeft,
              expiryDate: doc.expiryDate,
            },
          },
        });

        await prisma.vehicleDocument.update({
          where: { id: doc.id },
          data: { lastExpiryNotifiedAt: now },
        });

        notifiedCount++;
      }

      // ---- 2. Suspend vehicles with any already-expired required document ----
      const expiredDocs = await prisma.vehicleDocument.findMany({
        where: {
          expiryDate: { lte: now },
          vehicle: {
            status: "APPROVED",
            isActive: true,
            suspendedForDocs: false,
          },
        },
        include: {
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              plateNumber: true,
              vendor: { select: { userId: true, companyName: true } },
            },
          },
        },
      });

      const vehiclesToSuspend = new Map<string, (typeof expiredDocs)[0]>();
      for (const d of expiredDocs) {
        if (!vehiclesToSuspend.has(d.vehicle.id)) {
          vehiclesToSuspend.set(d.vehicle.id, d);
        }
      }

      for (const [vehicleId, doc] of vehiclesToSuspend) {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { isActive: false, suspendedForDocs: true },
        });

        const vehicleLabel = `${doc.vehicle.make} ${doc.vehicle.model} (${doc.vehicle.plateNumber})`;
        await prisma.notification.create({
          data: {
            userId: doc.vehicle.vendor.userId,
            title: "Vehicle suspended: document expired",
            message: `${vehicleLabel} has been suspended because ${doc.type} has expired. Upload a renewed document to reactivate the vehicle.`,
            type: "VEHICLE_SUSPENDED_DOCS",
            data: { vehicleId, docType: doc.type, expiredOn: doc.expiryDate },
          },
        });
      }

      console.log(
        `[CRON] Vehicle doc expiry: ${notifiedCount} notifications sent, ${vehiclesToSuspend.size} vehicle(s) suspended`,
      );
    } catch (error) {
      console.error("[CRON] Vehicle document expiry check failed:", error);
    }
  },
  { timezone: KSA_TZ },
);
// ============== DRIVER DOCUMENT EXPIRY CHECK ==============
// Runs daily at 10:00 AM KSA. Same cadence as vehicle docs.
cron.schedule(
  "0 10 * * *",
  async () => {
    console.log("[CRON] Checking driver document expiry...");

    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      );

      // ---- 1. Warning + weekly reminders ----
      const expiringDocs = await prisma.driverDocument.findMany({
        where: {
          expiryDate: { lte: thirtyDaysFromNow, gt: now },
          driver: { status: "APPROVED", isActive: true },
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              vendor: { select: { userId: true, companyName: true } },
            },
          },
        },
      });

      let notifiedCount = 0;
      for (const doc of expiringDocs) {
        const lastNotified = doc.lastExpiryNotifiedAt;
        const daysLeft = Math.ceil(
          (doc.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const shouldNotify =
          !lastNotified ||
          now.getTime() - lastNotified.getTime() >= 7 * 24 * 60 * 60 * 1000;
        if (!shouldNotify) continue;

        const isFirst = !lastNotified;
        const driverLabel = `${doc.driver.firstName} ${doc.driver.lastName}`;
        const title = isFirst
          ? `Driver document expiring in ${daysLeft} days`
          : `Reminder: ${doc.type} expires in ${daysLeft} days`;
        const message = isFirst
          ? `${driverLabel}'s ${doc.type} document expires in ${daysLeft} days. Please upload a renewed document. If not updated, this driver will be suspended on the expiry date.`
          : `${driverLabel}'s ${doc.type} expires in ${daysLeft} days. The driver will be suspended automatically once expired unless renewed.`;

        await prisma.notification.create({
          data: {
            userId: doc.driver.vendor.userId,
            title,
            message,
            type: "DRIVER_DOC_EXPIRING",
            data: {
              driverId: doc.driver.id,
              docId: doc.id,
              docType: doc.type,
              daysLeft,
              expiryDate: doc.expiryDate,
            },
          },
        });

        await prisma.driverDocument.update({
          where: { id: doc.id },
          data: { lastExpiryNotifiedAt: now },
        });

        notifiedCount++;
      }

      // ---- 2. Suspend drivers with expired docs ----
      const expiredDocs = await prisma.driverDocument.findMany({
        where: {
          expiryDate: { lte: now },
          driver: {
            status: "APPROVED",
            isActive: true,
            suspendedForDocs: false,
          },
        },
        include: {
          driver: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              vendor: { select: { userId: true } },
            },
          },
        },
      });

      const driversToSuspend = new Map<string, (typeof expiredDocs)[0]>();
      for (const d of expiredDocs) {
        if (!driversToSuspend.has(d.driver.id)) {
          driversToSuspend.set(d.driver.id, d);
        }
      }

      for (const [driverId, doc] of driversToSuspend) {
        await prisma.driver.update({
          where: { id: driverId },
          data: { isActive: false, suspendedForDocs: true },
        });

        const driverLabel = `${doc.driver.firstName} ${doc.driver.lastName}`;
        await prisma.notification.create({
          data: {
            userId: doc.driver.vendor.userId,
            title: "Driver suspended: document expired",
            message: `${driverLabel} has been suspended because ${doc.type} has expired. Upload a renewed document to reactivate the driver.`,
            type: "DRIVER_SUSPENDED_DOCS",
            data: { driverId, docType: doc.type, expiredOn: doc.expiryDate },
          },
        });
      }

      console.log(
        `[CRON] Driver doc expiry: ${notifiedCount} notifications sent, ${driversToSuspend.size} driver(s) suspended`,
      );
    } catch (error) {
      console.error("[CRON] Driver document expiry check failed:", error);
    }
  },
  { timezone: KSA_TZ },
);

// ============== VENDOR MONTHLY PAYOUT GENERATION ==============
// Runs on the 1st of every month at 3:00 AM KSA (after partner
// invoices at 2 AM, per the cron-order decision). The actual work
// lives in lib/cron-jobs.ts so admin's "Run Now" endpoint and any
// test/backfill harness can call the exact same logic.
cron.schedule(
  "0 3 1 * *",
  async () => {
    console.log("[CRON] Starting vendor monthly payout generation...");
    try {
      const result = await runVendorMonthlyPayoutGeneration();
      console.log(
        `[CRON] Vendor payouts done: ${result.created} created, ${result.skipped} skipped out of ${result.totalVendors} vendors`,
      );
    } catch (error) {
      console.error("[CRON] Vendor payout generation failed:", error);
    }
  },
  { timezone: KSA_TZ },
);

// ============== PARTNER OVERDUE SUSPENSION ==============
// Runs on the 6th of every month at 09:00 AM KSA.
//
// Schedule rationale:
//   - 1st of month: partner invoices generated (existing job earlier
//     in this file).
//   - 1st–5th: partner has 5 calendar days to upload payment proof
//     for the new invoice (and any prior unpaid ones).
//   - 6th 09:00 KSA: this job runs. Any APPROVED partner with an
//     OVERDUE invoice past dueDate is auto-suspended. They can
//     recover by uploading proof via the partner upload-proof
//     endpoint (allowed even while SUSPENDED), then admin confirms.
//
// Implementation lives in lib/cron-jobs.ts as
// `runPartnerOverdueSuspension` so admin can also trigger it
// manually for testing. This cron registration is the time-based
// wrapper that delegates to it.
//
// Stage 3B replaces what was previously the vendor-receipt-overdue
// no-op stub at this position — same time slot, opposite side of the
// payment direction.
cron.schedule(
  "0 9 6 * *",
  async () => {
    console.log("[CRON] Running partner overdue suspension check...");
    try {
      const result = await runPartnerOverdueSuspension();
      console.log(
        `[CRON] Partner suspension: ${result.suspended} suspended, ${result.skipped} skipped`,
      );
    } catch (error) {
      console.error("[CRON] Partner suspension check failed:", error);
    }
  },
  { timezone: KSA_TZ },
);

// ============== VENDOR MOU EXPIRY CHECK ==============
// Runs daily at 9:15 AM KSA
//
// Two passes mirroring the partner job:
//   1. AUTO-SUSPEND vendors whose MOU has already expired.
//   2. NOTIFY vendors whose MOU expires within 2 months but not yet.
// Other vendor docs (CR, VAT, etc.) only generate notifications, never
// auto-suspend. The MOU is the only doc that triggers suspension here.
cron.schedule(
  "15 9 * * *",
  async () => {
    console.log("[CRON] Checking vendor MOUs...");
    try {
      const result = await runVendorMouCheck();
      console.log(
        `[CRON] Vendor MOU: ${result.suspended} auto-suspended, ${result.notified} notified`,
      );
    } catch (error) {
      console.error("[CRON] Vendor MOU check failed:", error);
    }
  },
  { timezone: KSA_TZ },
);
// ============== VENDOR PROFILE DOCUMENT EXPIRY ==============
// Runs daily at 9:45 AM KSA
//
// Notifies vendors when their CR / VAT / Chamber of Commerce /
// Balady / National Address / IBAN Letter is approaching expiry
// (30 days out, then weekly reminders) and again when it crosses
// the expiry line. No auto-suspension — that's reserved for the
// MOU (handled by runVendorMouCheck above). The profile sidebar
// badge and the doc-locked write gate together carry the
// "renew this" signal for these docs.
cron.schedule(
  "45 9 * * *",
  async () => {
    console.log("[CRON] Checking vendor profile documents...");
    try {
      const result = await runVendorProfileDocCheck();
      console.log(
        `[CRON] Vendor profile docs: ${result.notified} notification(s) sent`,
      );
    } catch (error) {
      console.error("[CRON] Vendor profile doc check failed:", error);
    }
  },
  { timezone: KSA_TZ },
);

// ============== PARTNER PROFILE DOCUMENT EXPIRY ==============
// Runs daily at 9:50 AM KSA — same cadence as the vendor job,
// staggered five minutes after to avoid both jobs hammering the
// notifications table at the same instant.
cron.schedule(
  "50 9 * * *",
  async () => {
    console.log("[CRON] Checking partner profile documents...");
    try {
      const result = await runPartnerProfileDocCheck();
      console.log(
        `[CRON] Partner profile docs: ${result.notified} notification(s) sent`,
      );
    } catch (error) {
      console.error("[CRON] Partner profile doc check failed:", error);
    }
  },
  { timezone: KSA_TZ },
);

console.log(
  "[CRON] Scheduled jobs (Asia/Riyadh): monthly invoices (1st 2AM), vendor receipts (1st 3AM), overdue invoices (daily 8AM), overdue receipts (daily 8:30AM), partner MOU (daily 9AM), vendor MOU (daily 9:15AM), vehicle docs (daily 9:30AM), vendor profile docs (daily 9:45AM), partner profile docs (daily 9:50AM), driver docs (daily 10AM)",
);
