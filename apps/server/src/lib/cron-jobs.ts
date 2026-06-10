// ============================================================
// src/lib/cron-jobs.ts
//
// Shared job functions used by both the in-process node-cron
// schedulers (src/lib/cron.ts) AND the HTTP-triggered cron
// endpoints (src/controller/internal/cron.controller.ts).
//
// Why both:
//   • In-process node-cron is convenient for local dev — start
//     the server, jobs fire on schedule.
//   • In production we use Render's Cron Job service to ping the
//     HTTP endpoint instead. That gives us a separate service
//     for cron concerns (its own logs, its own retries, no
//     duplicate-fires when the web service scales horizontally),
//     and survives transient web-service restarts.
//
// Keeping both paths backed by the same functions means there's
// only one source of truth — whichever trigger fires, the same
// logic runs. Don't duplicate logic between this file and the
// callers.
// ============================================================

import { prisma } from "./prisma";

type JobResult = {
  // Counts so callers (cron log line, HTTP response, monitoring)
  // can report what actually happened.
  suspended: number;
  notified: number;
};

/**
 * Partner MOU check. Two passes:
 *   1. Auto-suspend APPROVED partners whose MOU has already expired.
 *      Writes audit log (SYSTEM actor) + suspension notification to
 *      the partner + alert to all admins.
 *   2. Notify APPROVED partners whose MOU expires within 2 months
 *      but hasn't expired yet. Single-fire via mouExpiryNotified.
 *
 * Returns counts so the caller can surface them. Throws on DB
 * errors — caller decides how to log/respond.
 */
export async function runPartnerMouCheck(): Promise<JobResult> {
  const now = new Date();
  let suspended = 0;
  let notified = 0;

  // -------- Pass 1: auto-suspend on already-expired MOU --------
  const expiredPartners = await prisma.partner.findMany({
    where: {
      status: "APPROVED",
      mouExpiryDate: { lt: now },
    },
    select: {
      id: true,
      companyName: true,
      userId: true,
      mouExpiryDate: true,
    },
  });

  for (const partner of expiredPartners) {
    const daysAgo = Math.ceil(
      (Date.now() - partner.mouExpiryDate!.getTime()) / (1000 * 60 * 60 * 24),
    );
    const reason =
      daysAgo > 0
        ? `MOU expired ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago. Upload a renewed MOU to restore access.`
        : "MOU has expired. Upload a renewed MOU to restore access.";

    await prisma.partner.update({
      where: { id: partner.id },
      data: { status: "SUSPENDED" },
    });

    await prisma.auditLog.create({
      data: {
        userId: null,
        action: "PARTNER_SUSPENDED_MOU_EXPIRED",
        entity: "Partner",
        entityId: partner.id,
        changes: {
          previousStatus: "APPROVED",
          reason,
          triggeredBy: "SYSTEM_CRON",
          mouExpiryDate: partner.mouExpiryDate,
        },
      },
    });

    await prisma.notification.create({
      data: {
        userId: partner.userId,
        title: "Account Suspended — MOU Expired",
        message: `Your LuxDrive partner account has been suspended. Reason: ${reason}`,
        type: "PROFILE_SUSPENDED",
        data: {
          partnerId: partner.id,
          reason,
          cause: "MOU_EXPIRED",
        },
      },
    });

    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Partner Auto-Suspended (MOU Expired)",
          message: `${partner.companyName} has been auto-suspended — MOU expired ${daysAgo}d ago`,
          type: "PROFILE_SUSPENDED",
          data: {
            partnerId: partner.id,
            cause: "MOU_EXPIRED",
            daysAgo,
          },
        })),
      });
    }

    suspended++;
  }

  // -------- Pass 2: notify partners with MOU in expiry window --------
  const twoMonthsFromNow = new Date();
  twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

  const expiringPartners = await prisma.partner.findMany({
    where: {
      status: "APPROVED",
      mouExpiryDate: { gte: now, lte: twoMonthsFromNow },
      mouExpiryNotified: false,
    },
    select: {
      id: true,
      companyName: true,
      userId: true,
      mouExpiryDate: true,
    },
  });

  for (const partner of expiringPartners) {
    const daysLeft = Math.ceil(
      (partner.mouExpiryDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    await prisma.partner.update({
      where: { id: partner.id },
      data: { mouExpiryNotified: true },
    });

    await prisma.notification.create({
      data: {
        userId: partner.userId,
        title: "MOU Expiring Soon",
        message: `Your Memorandum of Understanding expires in ${daysLeft} days. Please submit an updated MOU to avoid service interruption.`,
        type: "MOU_EXPIRING",
        data: { partnerId: partner.id, daysLeft },
      },
    });

    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Partner MOU Expiring",
          message: `${partner.companyName}'s MOU expires in ${daysLeft} days`,
          type: "MOU_EXPIRING",
          data: { partnerId: partner.id, daysLeft },
        })),
      });
    }

    notified++;
  }

  return { suspended, notified };
}

/**
 * Vendor MOU check. Mirrors runPartnerMouCheck — two passes, same
 * shape, vendor-specific notification types.
 */
export async function runVendorMouCheck(): Promise<JobResult> {
  const now = new Date();
  let suspended = 0;
  let notified = 0;

  // -------- Pass 1: auto-suspend on already-expired MOU --------
  const expiredVendors = await prisma.vendor.findMany({
    where: {
      status: "APPROVED",
      mouExpiryDate: { lt: now },
    },
    select: {
      id: true,
      companyName: true,
      userId: true,
      mouExpiryDate: true,
    },
  });

  for (const vendor of expiredVendors) {
    const daysAgo = Math.ceil(
      (Date.now() - vendor.mouExpiryDate!.getTime()) / (1000 * 60 * 60 * 24),
    );
    const reason =
      daysAgo > 0
        ? `MOU expired ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago. Upload a renewed MOU to restore access.`
        : "MOU has expired. Upload a renewed MOU to restore access.";

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { status: "SUSPENDED" },
    });

    await prisma.auditLog.create({
      data: {
        userId: null,
        action: "VENDOR_SUSPENDED_MOU_EXPIRED",
        entity: "Vendor",
        entityId: vendor.id,
        changes: {
          previousStatus: "APPROVED",
          reason,
          triggeredBy: "SYSTEM_CRON",
          mouExpiryDate: vendor.mouExpiryDate,
        },
      },
    });

    await prisma.notification.create({
      data: {
        userId: vendor.userId,
        title: "Account Suspended — MOU Expired",
        message: `Your LuxDrive vendor account has been suspended. Reason: ${reason}`,
        type: "VENDOR_SUSPENDED",
        data: {
          vendorId: vendor.id,
          reason,
          cause: "MOU_EXPIRED",
        },
      },
    });

    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Vendor Auto-Suspended (MOU Expired)",
          message: `${vendor.companyName} has been auto-suspended — MOU expired ${daysAgo}d ago`,
          type: "VENDOR_SUSPENDED",
          data: {
            vendorId: vendor.id,
            cause: "MOU_EXPIRED",
            daysAgo,
          },
        })),
      });
    }

    suspended++;
  }

  // -------- Pass 2: notify vendors with MOU in expiry window --------
  const twoMonthsFromNow = new Date();
  twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

  const expiringVendors = await prisma.vendor.findMany({
    where: {
      status: "APPROVED",
      mouExpiryDate: { gte: now, lte: twoMonthsFromNow },
      mouExpiryNotified: false,
    },
    select: {
      id: true,
      companyName: true,
      userId: true,
      mouExpiryDate: true,
    },
  });

  for (const vendor of expiringVendors) {
    const daysLeft = Math.ceil(
      (vendor.mouExpiryDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { mouExpiryNotified: true },
    });

    await prisma.notification.create({
      data: {
        userId: vendor.userId,
        title: "MOU Expiring Soon",
        message: `Your Memorandum of Understanding expires in ${daysLeft} days. Please submit an updated MOU to avoid service interruption.`,
        type: "MOU_EXPIRING",
        data: { vendorId: vendor.id, daysLeft },
      },
    });

    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Vendor MOU Expiring",
          message: `${vendor.companyName}'s MOU expires in ${daysLeft} days`,
          type: "MOU_EXPIRING",
          data: { vendorId: vendor.id, daysLeft },
        })),
      });
    }

    notified++;
  }

  return { suspended, notified };
}

// ============================================================
// Partner overdue suspension
//
// Auto-suspends APPROVED partners with any OVERDUE invoices past
// their dueDate by 1+ days. Fires once on the 6th of each month at
// 09:00 KSA (scheduled in lib/cron.ts) — 5-day grace from the 1st-of-
// month invoice generation. Implementation extracted here so the
// admin can also trigger it manually for testing.
//
// Behavior:
//   - Find all PartnerInvoice rows with status OVERDUE AND
//     dueDate < (today - 1 day).
//   - Group by partner; for each APPROVED partner in the result,
//     set status to SUSPENDED and audit-log with the unpaid invoice
//     IDs at suspension time (so admin can trace later).
//   - Notify partner + admin via payment-notifications helper.
//   - Skip partners already in SUSPENDED status (don't re-suspend
//     redundantly — the audit log already has the prior entry).
//
// Spec confirmations folded in:
//   - PROOF_UPLOADED invoices do NOT count. Partner did their part;
//     they shouldn't be penalized for admin's confirmation delay.
//   - Each cron run is independent — if admin manually unsuspended
//     a partner and invoices remain unpaid, the next month's run
//     will re-suspend. No grace flag.
// ============================================================
export async function runPartnerOverdueSuspension(): Promise<{
  suspended: number;
  skipped: number;
}> {
  const now = new Date();
  // "Past dueDate by 1+ days" — partner has had their grace, the
  // suspension cron is firing the day after their deadline.
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1);

  // PROOF_UPLOADED is explicitly excluded — partner already acted,
  // status reflects "waiting on admin", not "waiting on partner".
  const overdue = await prisma.partnerInvoice.findMany({
    where: {
      status: { in: ["PENDING", "OVERDUE"] },
      dueDate: { lt: cutoff },
    },
    select: {
      id: true,
      invoiceNumber: true,
      amount: true,
      dueDate: true,
      partnerId: true,
      partner: { select: { id: true, status: true, companyName: true } },
    },
  });

  // Group by partner so we suspend each partner once and surface all
  // their unpaid invoices in the audit log together.
  const byPartner = new Map<
    string,
    {
      partnerStatus: string;
      partnerName: string;
      invoices: typeof overdue;
    }
  >();
  for (const inv of overdue) {
    if (!inv.partner) continue;
    if (!byPartner.has(inv.partnerId)) {
      byPartner.set(inv.partnerId, {
        partnerStatus: inv.partner.status,
        partnerName: inv.partner.companyName,
        invoices: [],
      });
    }
    byPartner.get(inv.partnerId)!.invoices.push(inv);
  }

  // Bulk-flip status to OVERDUE on any PENDING invoices that have
  // tipped past their dueDate. This is a side-benefit of running this
  // job — partner & admin views see the OVERDUE status reflected even
  // before the suspension itself happens. Cheap, idempotent.
  await prisma.partnerInvoice.updateMany({
    where: {
      status: "PENDING",
      dueDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  });

  let suspended = 0;
  let skipped = 0;

  for (const [partnerId, ctx] of byPartner.entries()) {
    if (ctx.partnerStatus !== "APPROVED") {
      // Already suspended (or not yet approved) — don't re-suspend.
      // The audit log already captures the prior suspension event.
      skipped++;
      continue;
    }

    await prisma.partner.update({
      where: { id: partnerId },
      data: { status: "SUSPENDED" },
    });

    const totalAmount = ctx.invoices.reduce(
      (sum, i) => sum + Number(i.amount),
      0,
    );

    await prisma.auditLog.create({
      data: {
        // System-driven action; attribute to a synthetic admin ID is
        // pointless. Use the partner's userId (we don't have it in
        // this query but we'd need to fetch — for now use null which
        // Prisma allows on this field, OR fall back to partnerId as
        // the entity reference. Audit logs MUST have userId — looking
        // it up.
        userId: (await prisma.partner.findUnique({
          where: { id: partnerId },
          select: { userId: true },
        }))!.userId,
        action: "PARTNER_AUTO_SUSPENDED_NONPAYMENT",
        entity: "Partner",
        entityId: partnerId,
        changes: {
          previousStatus: "APPROVED",
          newStatus: "SUSPENDED",
          partner: ctx.partnerName,
          overdueInvoiceIds: ctx.invoices.map((i) => i.id),
          overdueInvoiceNumbers: ctx.invoices.map((i) => i.invoiceNumber),
          totalAmount,
        },
      },
    });

    const { notifyPartnerOfSuspension } =
      await import("./payment-notifications");
    await notifyPartnerOfSuspension(
      partnerId,
      ctx.invoices.map((i) => i.id),
      totalAmount,
    );

    suspended++;
    console.log(
      `[PartnerSuspension] ${ctx.partnerName} auto-suspended for ${ctx.invoices.length} overdue invoice(s) totaling SAR ${totalAmount.toFixed(2)}`,
    );
  }

  return { suspended, skipped };
}

// ============================================================
// Partner monthly invoice generation
//
// Generates the previous month's invoice for every APPROVED partner
// who has any non-custom-invoiced COMPLETED bookings in that period.
// Scheduled on the 1st of every month at 02:00 KSA (registered in
// lib/cron.ts). Extracted here so the admin "Run Now" endpoint and
// any future test/backfill harness can call the exact same logic.
//
// Idempotent: skips partners who already have an invoice covering
// the period. The `existingCount` lookup for invoice number sequence
// is also idempotent — it can run twice on the same day without
// producing duplicate invoices.
//
// Returns { created, skipped, totalPartners } for the caller to log.
// ============================================================
export async function runPartnerMonthlyInvoiceGeneration(): Promise<{
  created: number;
  skipped: number;
  totalPartners: number;
}> {
  const now = new Date();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59,
  );
  const dueDate = new Date(now.getFullYear(), now.getMonth(), 5);

  const partners = await prisma.partner.findMany({
    where: { status: "APPROVED" },
    select: { id: true, companyName: true, userId: true },
  });

  let created = 0;
  let skipped = 0;

  for (const partner of partners) {
    // Idempotency check: did we already invoice this partner for this
    // period? `isCustom: false` filters out partner-self-generated
    // custom-range invoices.
    const existing = await prisma.partnerInvoice.findFirst({
      where: {
        partnerId: partner.id,
        periodStart: prevMonthStart,
        periodEnd: prevMonthEnd,
        isCustom: false,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Bookings to include in this invoice — partner-side, completed in
    // the period, not already covered by a custom-range invoice the
    // partner generated themselves.
    const bookings = await prisma.booking.findMany({
      where: {
        partnerId: partner.id,
        status: "COMPLETED",
        tripDate: { gte: prevMonthStart, lte: prevMonthEnd },
        isCustomInvoiced: false,
      },
      select: { id: true, totalPrice: true },
    });

    if (bookings.length === 0) {
      skipped++;
      continue;
    }

    const totalAmount = bookings.reduce(
      (sum, b) => sum + Number(b.totalPrice),
      0,
    );

    // Invoice number: PREFIX-INV-YYYYMM-SEQ. PREFIX is first 3 alpha
    // chars of partner's companyName, padded with X if shorter (so
    // edge-case "Al" → "ALX", "" → "XXX"). Sequence counts only this
    // partner's invoices in this month, so per-partner numbers stay
    // small + stable. Same pattern as the vendor payout generator.
    const prefix = (
      partner.companyName
        .replace(/[^a-zA-Z]/g, "")
        .substring(0, 3)
        .toUpperCase() + "XXX"
    ).substring(0, 3);
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const existingCount = await prisma.partnerInvoice.count({
      where: {
        partnerId: partner.id,
        invoiceNumber: { startsWith: `${prefix}-INV-${yearMonth}-` },
      },
    });
    const invoiceNumber = `${prefix}-INV-${yearMonth}-${String(existingCount + 1).padStart(3, "0")}`;

    const invoice = await prisma.partnerInvoice.create({
      data: {
        invoiceNumber,
        partnerId: partner.id,
        amount: totalAmount,
        bookingCount: bookings.length,
        periodStart: prevMonthStart,
        periodEnd: prevMonthEnd,
        generationType: "MONTHLY",
        dueDate,
        status: "PENDING",
        isCustom: false,
      } as any,
    });

    // Link the bookings to the invoice so the line-item lookup on
    // the partner invoice detail page is a single relation read.
    await prisma.booking.updateMany({
      where: { id: { in: bookings.map((b) => b.id) } },
      data: { partnerInvoiceId: invoice.id } as any,
    });

    // Notify partner — their monthly invoice is ready, payment due on
    // the 5th. The "(line items + summary)" view on the invoice page
    // lets them see which bookings make up the total.
    await prisma.notification.create({
      data: {
        userId: partner.userId,
        title: "Monthly Invoice Generated",
        message: `Your invoice ${invoiceNumber} for ${prevMonthStart.toLocaleString("default", { month: "long", year: "numeric" })} is ready. ${bookings.length} rides totaling SAR ${totalAmount.toFixed(2)}. Due by ${dueDate.toLocaleDateString()}.`,
        type: "INVOICE_GENERATED",
        data: { invoiceId: invoice.id, invoiceNumber },
      },
    });

    // Notify admin — they need to track the receivable.
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Monthly Invoice Generated",
          message: `${partner.companyName} — ${invoiceNumber}: ${bookings.length} rides, SAR ${totalAmount.toFixed(2)}`,
          type: "PARTNER_MONTHLY_INVOICE",
          data: {
            invoiceId: invoice.id,
            invoiceNumber,
            partnerId: partner.id,
          },
        })),
      });
    }

    created++;
    console.log(
      `[PartnerInvoices] ${invoiceNumber} created for ${partner.companyName}`,
    );
  }

  return { created, skipped, totalPartners: partners.length };
}

// ============================================================
// Vendor monthly payout generation
//
// Generates a VendorPayout row covering the previous month's
// COMPLETED bookings for every APPROVED vendor with rides in
// that period. Scheduled on the 1st of every month at 03:00 KSA
// (after partner invoice generation at 02:00 KSA so any race for
// admin attention sees partner invoices listed first).
//
// Renamed from runVendorMonthlyReceiptGeneration in Batch 3B-3c
// to reflect new direction semantics — admin generates a PAYOUT
// to vendor, not a receipt FROM vendor. The function shape and
// return type are otherwise unchanged so the admin "Run Now"
// endpoint that already calls it keeps working.
//
// `targetMonth`, when provided, can be any date inside the period
// to generate for — the function derives month boundaries itself.
// Pass `new Date(2026, 4, 15)` to generate payouts for May 2026,
// regardless of what day inside May you pick. Used by the admin
// backfill endpoint.
//
// Idempotent: skips vendors who already have a payout covering
// the period, so running twice on the same day is safe.
//
// Returns a summary so the caller can log results.
// ============================================================
export async function runVendorMonthlyPayoutGeneration(
  targetMonth?: Date,
): Promise<{
  created: number;
  skipped: number;
  totalVendors: number;
  receipts: Array<{
    receiptId: string;
    receiptNumber: string;
    vendorId: string;
    companyName: string;
    amount: number;
    tripCount: number;
  }>;
}> {
  // Default to previous month — matches the cron's once-per-month
  // 1st-of-month firing (generates for the month just ended).
  const referenceDate = targetMonth || new Date();
  const targetMonthStart = targetMonth
    ? new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1)
    : new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const targetMonthEnd = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
    23,
    59,
    59,
  );

  const vendors = await prisma.vendor.findMany({
    where: { status: "APPROVED" },
    select: { id: true, companyName: true, userId: true },
  });

  let created = 0;
  let skipped = 0;
  const receipts: Array<{
    receiptId: string;
    receiptNumber: string;
    vendorId: string;
    companyName: string;
    amount: number;
    tripCount: number;
  }> = [];

  for (const vendor of vendors) {
    const existing = await prisma.vendorPayout.findFirst({
      where: {
        vendorId: vendor.id,
        periodStart: targetMonthStart,
        periodEnd: targetMonthEnd,
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Sum vendorPayoutAmount (admin's per-booking offered rate), NOT
    // totalPrice (partner-facing price). Under the new direction the
    // vendor sees the amount admin agreed to pay them, never the
    // partner price. This was the substantive semantic change in
    // Stage 3A.1 — kept here for the extracted version.
    const bookingsAgg = await prisma.booking.aggregate({
      where: {
        vendorId: vendor.id,
        status: "COMPLETED",
        tripDate: { gte: targetMonthStart, lte: targetMonthEnd },
      },
      _sum: { vendorPayoutAmount: true },
      _count: { id: true },
    });

    if (bookingsAgg._count.id === 0) {
      skipped++;
      continue;
    }

    const totalAmount = Number(bookingsAgg._sum.vendorPayoutAmount || 0);

    // Receipt number: PREFIX-RCP-YYYYMM-SEQ. Same format as before.
    const prefix = (
      vendor.companyName
        .replace(/[^a-zA-Z]/g, "")
        .substring(0, 3)
        .toUpperCase() + "XXX"
    ).substring(0, 3);
    const yearMonth = `${targetMonthStart.getFullYear()}${String(targetMonthStart.getMonth() + 1).padStart(2, "0")}`;
    const existingCount = await prisma.vendorPayout.count({
      where: {
        vendorId: vendor.id,
        receiptNumber: { startsWith: `${prefix}-RCP-${yearMonth}-` },
      },
    });
    const receiptNumber = `${prefix}-RCP-${yearMonth}-${String(existingCount + 1).padStart(3, "0")}`;

    const receipt = await prisma.vendorPayout.create({
      data: {
        receiptNumber,
        vendorId: vendor.id,
        amount: totalAmount,
        bookingCount: bookingsAgg._count.id,
        periodStart: targetMonthStart,
        periodEnd: targetMonthEnd,
        generationType: "MONTHLY",
        status: "PENDING",
      },
    });

    // Notify vendor — they're receiving money. No "due by 5th" since
    // that's admin's deadline, not the vendor's.
    await prisma.notification.create({
      data: {
        userId: vendor.userId,
        title: "Monthly Payout Generated",
        message: `Your payout ${receiptNumber} for ${targetMonthStart.toLocaleString("default", { month: "long", year: "numeric" })} is being processed. ${bookingsAgg._count.id} completed rides, SAR ${totalAmount.toFixed(2)}. You'll be notified when payment lands.`,
        type: "VENDOR_RECEIPT_GENERATED",
        data: { receiptId: receipt.id, receiptNumber, amount: totalAmount },
      },
    });

    // Notify admin — they owe this payout.
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Vendor Payout Pending",
          message: `${vendor.companyName} — ${receiptNumber}: ${bookingsAgg._count.id} rides, SAR ${totalAmount.toFixed(2)} owed`,
          type: "VENDOR_RECEIPT_GENERATED",
          data: {
            receiptId: receipt.id,
            receiptNumber,
            vendorId: vendor.id,
          },
        })),
      });
    }

    created++;
    receipts.push({
      receiptId: receipt.id,
      receiptNumber,
      vendorId: vendor.id,
      companyName: vendor.companyName,
      amount: totalAmount,
      tripCount: bookingsAgg._count.id,
    });
    console.log(
      `[VendorPayouts] ${receiptNumber} created for ${vendor.companyName}`,
    );
  }

  return { created, skipped, totalVendors: vendors.length, receipts };
}

// ============================================================
// PROFILE DOCUMENT EXPIRY CHECKS (Vendor + Partner)
// ============================================================
//
// Vendor & partner profile docs (CR, VAT, Chamber of Commerce,
// Balady, National Address, IBAN Letter) carry expiry dates but
// the original cron suite only covered MOU + fleet docs. So a
// vendor's Commercial Registration could lapse with no
// notification surfaced — they'd discover it only by checking
// the sidebar badge, or worse, by hitting the doc-locked write
// gate when they tried to do something.
//
// These jobs mirror the vehicle-doc cron's cadence — 30-day
// warning + weekly reminders, single fire on the day of
// expiry — but DO NOT auto-suspend. The MOU is the only profile
// doc whose lapse triggers suspension; the rest are
// notification-only by design.
//
// Throttling uses lastExpiryNotifiedAt on each doc row, identical
// to VehicleDocument/DriverDocument. Without it the daily cron
// would spam the same notification every day for 30 days, then
// daily after expiry.
// ============================================================

const PROFILE_DOC_LABELS: Record<string, string> = {
  CR: "Commercial Registration",
  VAT: "VAT Certificate",
  CHAMBER_OF_COMMERCE: "Chamber of Commerce",
  BALADY: "Balady License",
  NATIONAL_ADDRESS: "National Address",
  IBAN_LETTER: "IBAN Letter",
};

const PROFILE_DOC_TYPES = [
  "CR",
  "VAT",
  "CHAMBER_OF_COMMERCE",
  "BALADY",
  "NATIONAL_ADDRESS",
  "IBAN_LETTER",
] as const;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function runVendorProfileDocCheck(): Promise<JobResult> {
  const now = new Date();
  const horizon = new Date(now.getTime() + THIRTY_DAYS_MS);
  let notified = 0;

  // 1. Docs in the 30-day warning window (not yet expired)
  const expiringDocs = await prisma.vendorDocument.findMany({
    where: {
      type: { in: [...PROFILE_DOC_TYPES] },
      expiryDate: { lte: horizon, gt: now },
      // Only notify approved vendors. Pending / changes-requested
      // vendors are already in a review cycle — adding doc-expiry
      // pings on top would be noise.
      vendor: { status: "APPROVED" },
    },
    include: {
      vendor: { select: { userId: true, companyName: true } },
    },
  });

  for (const doc of expiringDocs) {
    const lastNotified = doc.lastExpiryNotifiedAt;
    const shouldNotify =
      !lastNotified || now.getTime() - lastNotified.getTime() >= SEVEN_DAYS_MS;
    if (!shouldNotify) continue;

    const daysLeft = Math.ceil(
      (doc.expiryDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    const label = PROFILE_DOC_LABELS[doc.type] || doc.type;
    const isFirst = !lastNotified;

    await prisma.notification.create({
      data: {
        userId: doc.vendor.userId,
        title: isFirst
          ? `${label} expiring in ${daysLeft} days`
          : `Reminder: ${label} expires in ${daysLeft} days`,
        message: `Your ${label} document expires in ${daysLeft} days. Submit a profile change request to renew it before the expiry date — once it lapses, you won't be able to perform write actions until it's renewed.`,
        type: "VENDOR_PROFILE_DOC_EXPIRING",
        data: {
          docId: doc.id,
          docType: doc.type,
          daysLeft,
          expiryDate: doc.expiryDate,
        },
      },
    });

    await prisma.vendorDocument.update({
      where: { id: doc.id },
      data: { lastExpiryNotifiedAt: now },
    });

    notified++;
  }

  // 2. Docs that have just crossed the expiry line — single
  // notification per doc to flag it expired. We don't auto-suspend
  // on profile docs (MOU is the only doc that does that). The
  // sidebar badge and the doc-locked write gate together push the
  // vendor toward the change-request flow to renew.
  const expiredDocs = await prisma.vendorDocument.findMany({
    where: {
      type: { in: [...PROFILE_DOC_TYPES] },
      expiryDate: { lte: now },
      vendor: { status: "APPROVED" },
    },
    include: {
      vendor: { select: { userId: true, companyName: true } },
    },
  });

  for (const doc of expiredDocs) {
    const lastNotified = doc.lastExpiryNotifiedAt;
    // Throttle the EXPIRED follow-ups too — without this, every
    // daily cron run would re-fire the "X has expired" notification
    // until the vendor renewed.
    if (
      lastNotified &&
      now.getTime() - lastNotified.getTime() < SEVEN_DAYS_MS
    ) {
      continue;
    }

    const label = PROFILE_DOC_LABELS[doc.type] || doc.type;
    await prisma.notification.create({
      data: {
        userId: doc.vendor.userId,
        title: `${label} has expired`,
        message: `Your ${label} document has expired. Write actions on the portal are now blocked until you renew it. Open Company Profile → Documents and submit a profile change request to upload a new copy.`,
        type: "VENDOR_PROFILE_DOC_EXPIRED",
        data: {
          docId: doc.id,
          docType: doc.type,
          expiryDate: doc.expiryDate,
        },
      },
    });

    await prisma.vendorDocument.update({
      where: { id: doc.id },
      data: { lastExpiryNotifiedAt: now },
    });

    notified++;
  }

  // No suspensions on this path — MOU is the only profile doc that
  // triggers auto-suspension, and that's covered by runVendorMouCheck.
  return { suspended: 0, notified };
}

export async function runPartnerProfileDocCheck(): Promise<JobResult> {
  // Mirrors runVendorProfileDocCheck — same cadence, same throttle,
  // same notification-only policy. Only the entity table and the
  // notification type strings differ.
  const now = new Date();
  const horizon = new Date(now.getTime() + THIRTY_DAYS_MS);
  let notified = 0;

  const expiringDocs = await prisma.partnerDocument.findMany({
    where: {
      type: { in: [...PROFILE_DOC_TYPES] },
      expiryDate: { lte: horizon, gt: now },
      partner: { status: "APPROVED" },
    },
    include: {
      partner: { select: { userId: true, companyName: true } },
    },
  });

  for (const doc of expiringDocs) {
    const lastNotified = doc.lastExpiryNotifiedAt;
    const shouldNotify =
      !lastNotified || now.getTime() - lastNotified.getTime() >= SEVEN_DAYS_MS;
    if (!shouldNotify) continue;

    const daysLeft = Math.ceil(
      (doc.expiryDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    const label = PROFILE_DOC_LABELS[doc.type] || doc.type;
    const isFirst = !lastNotified;

    await prisma.notification.create({
      data: {
        userId: doc.partner.userId,
        title: isFirst
          ? `${label} expiring in ${daysLeft} days`
          : `Reminder: ${label} expires in ${daysLeft} days`,
        message: `Your ${label} document expires in ${daysLeft} days. Submit a profile change request to renew it before the expiry date.`,
        type: "PARTNER_PROFILE_DOC_EXPIRING",
        data: {
          docId: doc.id,
          docType: doc.type,
          daysLeft,
          expiryDate: doc.expiryDate,
        },
      },
    });

    await prisma.partnerDocument.update({
      where: { id: doc.id },
      data: { lastExpiryNotifiedAt: now },
    });

    notified++;
  }

  const expiredDocs = await prisma.partnerDocument.findMany({
    where: {
      type: { in: [...PROFILE_DOC_TYPES] },
      expiryDate: { lte: now },
      partner: { status: "APPROVED" },
    },
    include: {
      partner: { select: { userId: true, companyName: true } },
    },
  });

  for (const doc of expiredDocs) {
    const lastNotified = doc.lastExpiryNotifiedAt;
    if (
      lastNotified &&
      now.getTime() - lastNotified.getTime() < SEVEN_DAYS_MS
    ) {
      continue;
    }

    const label = PROFILE_DOC_LABELS[doc.type] || doc.type;
    await prisma.notification.create({
      data: {
        userId: doc.partner.userId,
        title: `${label} has expired`,
        message: `Your ${label} document has expired. Open Company Profile → Documents and submit a profile change request to upload a new copy.`,
        type: "PARTNER_PROFILE_DOC_EXPIRED",
        data: {
          docId: doc.id,
          docType: doc.type,
          expiryDate: doc.expiryDate,
        },
      },
    });

    await prisma.partnerDocument.update({
      where: { id: doc.id },
      data: { lastExpiryNotifiedAt: now },
    });

    notified++;
  }

  return { suspended: 0, notified };
}
