// ============================================
// apps/server/src/scripts/run-crons.ts
//
// Manually run the daily billing generators — the same functions the
// cron scheduler fires at 02:00 (partner invoices) and 03:00 (vendor
// payouts), plus the overdue-suspension sweep — without waiting for the
// schedule. Handy for testing generation end-to-end.
//
// Usage (from apps/server):
//   npx tsx src/scripts/run-crons.ts              # invoices YESTERDAY (like cron)
//   npx tsx src/scripts/run-crons.ts 2026-08-05   # invoices that exact day
//
// A partner/vendor is invoiced for a day only if they have COMPLETED,
// vendor-assigned rides on that day that aren't already invoiced. If you
// just created and completed test bookings TODAY, pass today's date.
// ============================================

import { prisma } from "../lib/prisma";
import {
  runPartnerDailyInvoiceGeneration,
  runVendorDailyPayoutGeneration,
  runPartnerOverdueSuspension,
} from "../lib/cron-jobs";

async function main() {
  const arg = process.argv[2];
  let targetDay: Date | undefined;
  if (arg) {
    const d = new Date(arg);
    if (Number.isNaN(d.getTime())) {
      console.error(
        `✗ Invalid date "${arg}". Use YYYY-MM-DD (e.g. 2026-08-05).`,
      );
      process.exit(1);
    }
    targetDay = d;
  }

  const label = targetDay ? arg : "yesterday (cron default)";
  console.log(`\n========================================`);
  console.log(`Running daily generators for: ${label}`);
  console.log(`========================================\n`);

  // 1. Partner invoices
  console.log("→ Partner invoices");
  const partner = await runPartnerDailyInvoiceGeneration(targetDay);
  console.log(
    `  created=${partner.created}  skipped=${partner.skipped}  partnersChecked=${partner.totalPartners}\n`,
  );

  // 2. Vendor payouts
  console.log("→ Vendor payouts");
  const vendor = await runVendorDailyPayoutGeneration(targetDay);
  console.log(
    `  created=${vendor.created}  skipped=${vendor.skipped}  vendorsChecked=${vendor.totalVendors}`,
  );
  if (vendor.receipts.length) {
    for (const r of vendor.receipts) {
      console.log(
        `    • ${(r as any).receiptNumber ?? "(receipt)"}  SAR ${(r as any).amount ?? "?"}`,
      );
    }
  }
  console.log("");

  // 3. Overdue-suspension sweep (partners past their due date)
  console.log("→ Partner overdue-suspension sweep");
  const overdue = await runPartnerOverdueSuspension();
  console.log(`  suspended=${overdue.suspended}  skipped=${overdue.skipped}\n`);

  console.log(`========================================`);
  console.log("Done.");
  console.log(`========================================\n`);
}

main()
  .catch((err) => {
    console.error("\n✗ Cron run failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
