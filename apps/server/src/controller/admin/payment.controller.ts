// ============================================
// apps/server/src/controller/admin/payment.controller.ts
// FIXED: Correct field names for Vendor and Partner
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { runVendorMonthlyPayoutGeneration } from "../../lib/cron-jobs";
// Same pattern as vendor/earnings.controller.ts. Admin needs signed
// URLs for vendor-uploaded payment proofs so the document viewer can
// render them in-page.
// Lifecycle status the admin sees in the table. Mirrors the vendor's
// view of the same receipt so both sides share vocabulary. Status is
// derived from `(status, isPaid, dueDate)` rather than the raw enum so
// "Overdue" can surface dynamically without a DB update.
// Lifecycle status the admin sees in the table. Under the new payment
// direction VendorPayoutStatus is just PENDING | PAID. We still derive
// the OVERDUE pseudo-state at read-time from `(status, periodEnd)`
// rather than storing it. PROOF_UPLOADED is gone — vendor doesn't
// upload anything anymore.
function deriveReceiptLifecycle(
  status: string,
  periodEnd: Date,
): { code: string; label: string } {
  if (status === "PAID") return { code: "PAID", label: "Paid" };
  const dueDate = new Date(
    periodEnd.getFullYear(),
    periodEnd.getMonth() + 1,
    5,
    23,
    59,
    59,
  );
  if (new Date() > dueDate) return { code: "OVERDUE", label: "Overdue" };
  return { code: "PENDING", label: "Pending Payment" };
}

// ============== PAYMENT SUMMARY ==============

/**
 * Get payment summary cards data
 */
export const getPaymentSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    const [
      onlineReceived,
      toReceiveFromVendors,
      newVendorReceipts,
      proofUploadedReceipts,
      toReceiveFromPartners,
      unconfirmedPartnerPayments,
    ] = await Promise.all([
      prisma.onlinePayment.aggregate({
        where: {
          status: "COMPLETED",
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
      }),
      // Total amount admin owes vendors — sum of unpaid payouts.
      // Under the new direction VendorPayout has just PENDING and PAID;
      // pending is the equivalent of "still on admin's plate".
      prisma.vendorPayout.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
      }),
      // Pending payouts admin hasn't sent yet — drives the
      // "Payments to Send" tab badge. Under new direction this is the
      // single actionable bucket (no separate review step).
      prisma.vendorPayout.count({
        where: { status: "PENDING" },
      }),
      // The old "REVIEWED" sub-bucket (vendor uploaded proof, admin
      // verifying) doesn't exist under new direction. Counter set to
      // 0 to preserve the existing response shape until Stage 3B
      // restructures the admin payments UI.
      Promise.resolve(0),
      prisma.partnerInvoice.aggregate({
        where: {
          status: { in: ["PENDING", "OVERDUE"] },
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
      }),
      prisma.partnerInvoice.count({
        where: { status: "PROOF_UPLOADED" },
      }),
    ]);

    // Badge total = pending payouts + admin-action-needed PROOF_UPLOADED.
    // Under the new direction the "vendor side" badge is admin-owed
    // money out (payouts admin needs to send); the "partner side" badge
    // is admin-receivable money in (proofs waiting confirmation).
    const vendorReceiptsBadgeTotal = newVendorReceipts + proofUploadedReceipts;

    res.json({
      success: true,
      data: {
        onlineReceived: {
          amount: onlineReceived._sum.amount || 0,
          label: "Online Received",
        },
        // Direction inverted under Stage 3B. Admin PAYS vendor now,
        // RECEIVES from partner. Tile keys preserved (existing frontend
        // reads `toReceiveFromVendors` / `toReceiveFromPartners`) but
        // semantics flipped — the vendor-side tile is now money OUT,
        // labelled "Payments to Send". Stage 4 will rename the keys
        // properly across both sides; for now label changes track the
        // shift so the admin UI is correct.
        toReceiveFromVendors: {
          amount: toReceiveFromVendors._sum.amount || 0,
          newReceipts: newVendorReceipts,
          proofUploaded: proofUploadedReceipts,
          badgeTotal: vendorReceiptsBadgeTotal,
          label: "Payments to Send",
        },
        toReceiveFromPartners: {
          amount: toReceiveFromPartners._sum.amount || 0,
          label: "Payments to Receive",
        },
        notifications: {
          // Labels now align with the flipped direction. "Payments to
          // Send" = vendor side (admin pays vendor). "Payments to
          // Receive" = partner side (admin gets paid by partner).
          paymentsToSend: vendorReceiptsBadgeTotal,
          paymentsToReceive: unconfirmedPartnerPayments,
          total: vendorReceiptsBadgeTotal + unconfirmedPartnerPayments,
        },
      },
    });
  },
);

/**
 * Get notification count for sidebar badge
 */
export const getPaymentNotifications = asyncWrapper(
  async (req: Request, res: Response) => {
    const [newVendorReceipts, unconfirmedPartnerPayments] = await Promise.all([
      prisma.vendorPayout.count({ where: { status: "PENDING" } }),
      prisma.partnerInvoice.count({
        where: { status: "PROOF_UPLOADED" },
      }),
    ]);

    res.json({
      success: true,
      data: {
        paymentsToSend: newVendorReceipts,
        paymentsToReceive: unconfirmedPartnerPayments,
        total: newVendorReceipts + unconfirmedPartnerPayments,
      },
    });
  },
);

// ============== ONLINE PAYMENTS (TAB 1) ==============

/**
 * Get online payments list
 */
export const getOnlinePayments = asyncWrapper(
  async (req: Request, res: Response) => {
    const {
      startDate,
      endDate,
      status,
      search,
      page = "1",
      limit = "10",
    } = req.query;

    const where: any = {};

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      const searchStr = search as string;
      where.OR = [
        { transactionId: { contains: searchStr, mode: "insensitive" } },
        { customerName: { contains: searchStr, mode: "insensitive" } },
        { customerEmail: { contains: searchStr, mode: "insensitive" } },
        {
          booking: { bookingRef: { contains: searchStr, mode: "insensitive" } },
        },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [payments, total] = await Promise.all([
      prisma.onlinePayment.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        include: {
          booking: { select: { id: true, bookingRef: true } },
        },
      }),
      prisma.onlinePayment.count({ where }),
    ]);

    const formattedPayments = payments.map((payment) => ({
      id: payment.id,
      transactionId: payment.transactionId,
      bookingRef: payment.booking?.bookingRef || null,
      bookingId: payment.bookingId,
      customer: {
        name: payment.customerName,
        email: payment.customerEmail,
      },
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      cardLast4: payment.cardLast4 ? `****${payment.cardLast4}` : null,
      methodDisplay: `${payment.method}${payment.cardLast4 ? ` ****${payment.cardLast4}` : ""}`,
      response: payment.gatewayResponse,
      responseDisplay:
        payment.gatewayResponse === "AUTHORISED"
          ? "[A] Authorised"
          : "[D] Declined",
      status: payment.status.toLowerCase(),
      createdAt: payment.createdAt,
    }));

    res.json({
      success: true,
      data: {
        payments: formattedPayments,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

// ============== PAYMENTS TO SEND / VENDOR RECEIPTS (TAB 2) ==============

/**
 * Get vendor receipts list
 */
export const getVendorReceipts = asyncWrapper(
  async (req: Request, res: Response) => {
    const {
      startDate,
      endDate,
      status,
      search,
      page = "1",
      limit = "10",
    } = req.query;

    const where: any = {};

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      const searchStr = search as string;
      where.OR = [
        { receiptNumber: { contains: searchStr, mode: "insensitive" } },
        {
          vendor: { companyName: { contains: searchStr, mode: "insensitive" } },
        },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [receipts, total, newCount] = await Promise.all([
      prisma.vendorPayout.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        include: {
          vendor: { select: { id: true, companyName: true } },
        },
      }),
      prisma.vendorPayout.count({ where }),
      prisma.vendorPayout.count({ where: { status: "PENDING" } }),
    ]);

    const formattedReceipts = await Promise.all(
      receipts.map(async (receipt: any) => {
        const lifecycle = deriveReceiptLifecycle(
          receipt.status,
          receipt.periodEnd,
        );
        // Sign the admin-uploaded receipt URL only when one exists.
        // Field name in response stays `paymentProofUrl` for frontend
        // backwards-compat; source is now receiptUrl (admin's transfer
        // receipt) instead of the vendor's payment proof.
        const paymentProofSignedUrl = receipt.receiptUrl
          ? await getReadUrl(receipt.receiptUrl)
          : null;
        const isPaid = receipt.status === "PAID";
        return {
          id: receipt.id,
          receiptNumber: receipt.receiptNumber,
          vendor: {
            id: receipt.vendor.id,
            companyName: receipt.vendor.companyName,
          },
          tripCount: receipt.bookingCount,
          amount: receipt.amount,
          // Bank details lived on the old VendorReceipt schema. Under
          // new direction we'd pull them from the Vendor row directly;
          // wiring that in is a Stage 3B task. Placeholder for now.
          bankDetails: {
            bankName: null,
            iban: null,
          },
          status: receipt.status,
          lifecycle, // { code, label } — PENDING / PAID / OVERDUE
          isNew: receipt.status === "PENDING",
          isReviewed: false, // no review step under new direction
          isPaid,
          paidAt: receipt.paidAt,
          paymentProofUrl: paymentProofSignedUrl,
          paymentProofFileName: receipt.receiptFileName,
          createdAt: receipt.createdAt,
          periodStart: receipt.periodStart,
          periodEnd: receipt.periodEnd,
        };
      }),
    );

    res.json({
      success: true,
      data: {
        receipts: formattedReceipts,
        newCount,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

/**
 * Mark vendor receipt as reviewed
 */
export const reviewVendorReceipt = asyncWrapper(
  async (_req: Request, res: Response) => {
    // DEPRECATED under the new payment direction.
    // There's no separate "review" step for vendor payouts — admin
    // generates the payout, pays the vendor, and uploads the receipt
    // in a single action (see markVendorReceiptPaid below). The route
    // export is preserved so existing route registration resolves;
    // Stage 3B will remove this endpoint and Stage 4 will remove the
    // frontend's "Review" button.
    res.status(410).json({
      success: false,
      error: "ENDPOINT_DEPRECATED",
      message:
        "There is no review step for vendor payouts under the new payment direction. " +
        "Admin marks the payout PAID and uploads a transfer receipt in one action.",
    });
  },
);

/**
 * Mark vendor payout as paid + record transfer receipt
 *
 * Single-step terminal action under the new payment direction: admin
 * has actually paid the vendor (bank transfer done) and clicks Mark
 * Paid + uploads the transfer receipt. No review/intermediate state.
 */
export const markVendorReceiptPaid = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    // receiptUrl + receiptFileName come from the upload widget on the
    // admin's "Payments to Send" panel. Optional today (frontend may
    // not yet send them — Stage 4 wires that up) but should be required
    // for go-live.
    const { receiptUrl, receiptFileName } = req.body as {
      receiptUrl?: string;
      receiptFileName?: string;
    };

    const receipt = await prisma.vendorPayout.findUnique({
      where: { id },
      include: {
        vendor: {
          select: { id: true, userId: true, status: true, companyName: true },
        },
      },
    });
    if (!receipt) {
      throw new NotFoundError("Vendor payout");
    }

    if (receipt.status === "PAID") {
      throw new BadRequestError("Payout already marked as paid");
    }

    const updated = await prisma.vendorPayout.update({
      where: { id },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paidBy: req.user!.id,
        receiptUrl: receiptUrl ?? receipt.receiptUrl,
        receiptFileName: receiptFileName ?? receipt.receiptFileName,
        receiptUploadedAt: receiptUrl ? new Date() : receipt.receiptUploadedAt,
      },
    });

    // Notify vendor that the payout has landed. Replaces the inline
    // VENDOR_RECEIPT_PAID notification (old direction wording) with
    // the new VENDOR_PAYOUT_PAID type, dispatched through the
    // payment-notifications helper so wording lives in one place.
    const { notifyVendorOfPayoutPaid } =
      await import("../../lib/payment-notifications");
    await notifyVendorOfPayoutPaid(id);

    // Under the OLD direction this endpoint also probed whether the
    // vendor had been auto-suspended for non-payment of THIS receipt
    // and surfaced a "Reactivate now?" prompt to admin. Vendor non-
    // payment-suspension is gone under the new direction (admin pays
    // vendor — vendors don't get suspended for unpaid receipts), so
    // that probe is dropped. The frontend shouldn't render the prompt
    // anymore; Stage 3B-3 / Stage 4 cleans the matching UI.
    const suspensionContext = {
      isSuspended: receipt.vendor.status === "SUSPENDED",
      suspendedForThisReceipt: false,
    };

    res.json({
      success: true,
      message: "Receipt marked as paid",
      data: {
        id: updated.id,
        status: updated.status,
        paidAt: updated.paidAt,
        vendor: {
          id: receipt.vendor.id,
          companyName: receipt.vendor.companyName,
          status: receipt.vendor.status,
          isSuspended: suspensionContext.isSuspended,
          suspendedForThisReceipt: suspensionContext.suspendedForThisReceipt,
        },
      },
    });
  },
);

/**
 * Get single vendor receipt details
 */
export const getVendorReceiptDetails = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const receipt = await prisma.vendorPayout.findUnique({
      where: { id },
      include: {
        vendor: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundError("Vendor payout");
    }

    // Surface signed URL for the admin-uploaded receipt so the frontend
    // can render it in the DocumentViewer. Field name preserved as
    // `paymentProofUrl` in the response shape for frontend
    // backwards-compat; source switched from the old
    // `vendorReceipt.paymentProofUrl` (vendor's proof of paying admin)
    // to `vendorPayout.receiptUrl` (admin's proof of paying vendor).
    const paymentProofSignedUrl = receipt.receiptUrl
      ? await getReadUrl(receipt.receiptUrl)
      : null;
    // deriveReceiptLifecycle's signature changed in Stage 3A.1 — it
    // now takes (status, periodEnd) since the old isPaid boolean
    // collapsed into VendorPayoutStatus.
    const lifecycle = deriveReceiptLifecycle(receipt.status, receipt.periodEnd);

    res.json({
      success: true,
      data: {
        ...receipt,
        paymentProofUrl: paymentProofSignedUrl,
        // Spread above also leaks `receiptUrl` (raw GCS path) — overwrite
        // it with the signed URL so the frontend doesn't accidentally try
        // to load the unsigned path.
        receiptUrl: paymentProofSignedUrl,
        lifecycle,
      },
    });
  },
);

// ============== PAYMENTS TO RECEIVE / PARTNER INVOICES (TAB 3) ==============

/**
 * Get partner invoices list
 */
export const getPartnerInvoices = asyncWrapper(
  async (req: Request, res: Response) => {
    const {
      startDate,
      endDate,
      status,
      search,
      page = "1",
      limit = "10",
    } = req.query;

    // Update overdue invoices
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    await prisma.partnerInvoice.updateMany({
      where: {
        status: "PENDING",
        dueDate: { lt: threeDaysAgo },
      },
      data: { status: "OVERDUE" },
    });

    const where: any = {};

    if (startDate && endDate) {
      where.dueDate = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      const searchStr = search as string;
      where.OR = [
        { invoiceNumber: { contains: searchStr, mode: "insensitive" } },
        {
          partner: {
            companyName: { contains: searchStr, mode: "insensitive" },
          },
        },
        { partner: { crNumber: { contains: searchStr, mode: "insensitive" } } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [invoices, total, unconfirmedCount] = await Promise.all([
      prisma.partnerInvoice.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        include: {
          partner: { select: { id: true, companyName: true, crNumber: true } },
        },
      }),
      prisma.partnerInvoice.count({ where }),
      prisma.partnerInvoice.count({
        where: { status: "PROOF_UPLOADED" },
      }),
    ]);

    // Stage 7: sign the partner-uploaded proof URL inline so the
    // admin panel can open it from the row without the prior
    // 3-call dance (getDetails → getSignedReadUrl → open viewer).
    // Most invoices won't have a proof yet (PENDING/OVERDUE rows
    // have null), so the await loop is cheap — we only call GCS
    // for rows that actually have something to sign.
    const formattedInvoices = await Promise.all(
      invoices.map(async (invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        partner: {
          id: invoice.partner.id,
          companyName: invoice.partner.companyName,
          crNumber: invoice.partner.crNumber,
        },
        bookingCount: invoice.bookingCount,
        amount: invoice.amount,
        dueDate: invoice.dueDate,
        status: invoice.status,
        isOverdue: invoice.status === "OVERDUE",
        isPaid: invoice.status === "PAID",
        isPaymentReceived:
          invoice.status === "PROOF_UPLOADED" || invoice.status === "PAID",
        isConfirmed: invoice.status === "PAID",
        needsConfirmation: invoice.status === "PROOF_UPLOADED",
        paidAt: invoice.confirmedAt,
        // Partner-uploaded payment proof, signed for direct render.
        // Null when no proof has been uploaded (PENDING/OVERDUE rows
        // and PROOF_UPLOADED rows that were marked by admin out-of-
        // band without an actual proof file).
        paymentProofUrl: invoice.paymentProofUrl
          ? await getReadUrl(invoice.paymentProofUrl)
          : null,
        paymentProofFileName: invoice.paymentProofFileName ?? null,
        paymentProofUploadedAt: invoice.paymentProofUploadedAt ?? null,
        createdAt: invoice.createdAt,
      })),
    );

    res.json({
      success: true,
      data: {
        invoices: formattedInvoices,
        unconfirmedCount,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

/**
 * Send reminder to partner
 */
export const sendPartnerReminder = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const invoice = await prisma.partnerInvoice.findUnique({
      where: { id },
      include: {
        partner: { select: { id: true, companyName: true } },
      },
    });

    if (!invoice) {
      throw new NotFoundError("Partner invoice");
    }

    if (invoice.status === "PAID") {
      throw new BadRequestError("Invoice is already paid");
    }

    const updated = await prisma.partnerInvoice.update({
      where: { id },
      data: {
        reminderSentAt: new Date(),
        reminderCount: { increment: 1 },
      },
    });

    // TODO: Send actual notification/email to partner

    res.json({
      success: true,
      message: `Reminder sent to ${invoice.partner.companyName}`,
      data: {
        id: updated.id,
        reminderCount: updated.reminderCount,
        reminderSentAt: updated.reminderSentAt,
      },
    });
  },
);

/**
 * Confirm partner payment received
 */
export const confirmPartnerPayment = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const invoice = await prisma.partnerInvoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundError("Partner invoice");
    }

    if (invoice.status === "PAID") {
      throw new BadRequestError("Payment already confirmed");
    }

    // Single state transition: → PAID. The Stage 2 schema collapse
    // dropped isPaymentReceived/paymentReceivedAt/isConfirmed booleans;
    // status enum is now the only source of truth.
    const updated = await prisma.partnerInvoice.update({
      where: { id },
      data: {
        status: "PAID",
        confirmedAt: new Date(),
        confirmedBy: req.user!.id,
      },
    });

    // Notify the partner — their payment is confirmed. Notification
    // type renamed from old PAYMENT_VERIFIED (vendor-side under old
    // direction) to INVOICE_PAYMENT_CONFIRMED for clarity.
    const { notifyPartnerOfPaymentConfirmation } =
      await import("../../lib/payment-notifications");
    await notifyPartnerOfPaymentConfirmation(id);

    res.json({
      success: true,
      message: "Payment confirmed",
      data: {
        id: updated.id,
        status: updated.status,
        confirmedAt: updated.confirmedAt,
      },
    });
  },
);

/**
 * Mark partner payment as received (before confirmation)
 *
 * Under the new direction this is an admin "I see they uploaded
 * proof — moving it to the next state" action. We move status from
 * PENDING/OVERDUE to PROOF_UPLOADED (admin has seen the proof; final
 * confirm happens via confirmPartnerPayment above).
 */
export const markPartnerPaymentReceived = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const invoice = await prisma.partnerInvoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new NotFoundError("Partner invoice");
    }

    if (invoice.status === "PROOF_UPLOADED" || invoice.status === "PAID") {
      throw new BadRequestError("Payment already marked as received");
    }

    const updated = await prisma.partnerInvoice.update({
      where: { id },
      data: {
        status: "PROOF_UPLOADED",
        paymentProofUploadedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: "Payment marked as received. Please confirm to complete.",
      data: {
        id: updated.id,
        // Derived for frontend backwards-compat — Stage 4 will read
        // `status` directly.
        isPaymentReceived: true,
      },
    });
  },
);

/**
 * Get single partner invoice details
 */
export const getPartnerInvoiceDetails = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const invoice = await prisma.partnerInvoice.findUnique({
      where: { id },
      include: {
        partner: {
          select: {
            id: true,
            companyName: true,
            crNumber: true,
            // Use correct field names from your schema
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundError("Partner invoice");
    }

    res.json({
      success: true,
      data: invoice,
    });
  },
);

// ============== INVOICE GENERATION ==============

/**
 * Generate vendor payout manually (admin trigger for ad-hoc periods,
 * outside the monthly cron). Same shape as the cron — sums
 * vendorPayoutAmount across completed bookings in the period and
 * creates a VendorPayout in PENDING state for admin to pay out later.
 */
export const generateVendorReceipt = asyncWrapper(
  async (req: Request, res: Response) => {
    const { vendorId, periodStart, periodEnd, generationType } = req.body;

    if (!vendorId || !periodStart || !periodEnd) {
      throw new BadRequestError(
        "vendorId, periodStart, and periodEnd are required",
      );
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, companyName: true },
    });

    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    // Sum vendorPayoutAmount (admin's per-booking offered rate) across
    // completed bookings in the period. Under the new direction the
    // vendor's payout total is NOT the partner-facing totalPrice — it's
    // the amount admin agreed to pay them. Bookings without an
    // accepted-offer payout are skipped (shouldn't happen for COMPLETED
    // bookings; offer-flow gating prevents it).
    const bookings = await prisma.booking.findMany({
      where: {
        vendorId,
        status: "COMPLETED",
        completedAt: {
          gte: new Date(periodStart),
          lte: new Date(periodEnd),
        },
      },
      select: { vendorPayoutAmount: true },
    });

    const totalAmount = bookings.reduce(
      (sum, b) => sum + Number(b.vendorPayoutAmount ?? 0),
      0,
    );
    const bookingCount = bookings.length;

    // Receipt number: PREFIX-RCP-YYYYMM-SEQ — same format as the
    // monthly cron so admin-generated and system-generated receipts
    // share the same structure.
    const prefix = (
      vendor.companyName
        .replace(/[^a-zA-Z]/g, "")
        .substring(0, 3)
        .toUpperCase() + "XXX"
    ).substring(0, 3);
    const periodStartDate = new Date(periodStart);
    const yearMonth = `${periodStartDate.getFullYear()}${String(periodStartDate.getMonth() + 1).padStart(2, "0")}`;
    const existingCount = await prisma.vendorPayout.count({
      where: {
        vendorId,
        receiptNumber: { startsWith: `${prefix}-RCP-${yearMonth}-` },
      },
    });
    const receiptNumber = `${prefix}-RCP-${yearMonth}-${String(existingCount + 1).padStart(3, "0")}`;

    const receipt = await prisma.vendorPayout.create({
      data: {
        receiptNumber,
        vendorId,
        amount: totalAmount,
        bookingCount,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        generationType: generationType || "MONTHLY",
        status: "PENDING",
      },
    });

    res.json({
      success: true,
      message: "Vendor payout generated",
      data: receipt,
    });
  },
);

/**
 * Trigger the monthly vendor-receipt generation cron on demand.
 *
 * Calls the same logic the 1st-of-month cron uses, so this is the
 * easiest way to verify receipt generation is working without waiting
 * for the next 1st of the month. Useful in two scenarios:
 *
 *   1. Initial setup / smoke testing — confirm receipts get created for
 *      APPROVED vendors who had completed bookings in the chosen period.
 *   2. Backfill — if the cron failed (server down on the 1st) or a new
 *      vendor was approved late and missed the cron, admin can re-run
 *      for a past month. The receipt-exists check inside the helper
 *      makes it idempotent: vendors who already have a receipt for that
 *      period are skipped.
 *
 * Body:
 *   - targetMonth (optional, "YYYY-MM" e.g. "2026-04") — month to
 *     generate receipts for. Defaults to last completed month, same as
 *     the cron.
 *
 * Returns:
 *   { created, skipped, totalVendors, receipts: [...] } so the operator
 *   can see exactly what was generated.
 */
export const runVendorMonthlyReceiptsNow = asyncWrapper(
  async (req: Request, res: Response) => {
    const { targetMonth } = req.body || {};

    // Parse the optional month. Accepts "YYYY-MM" (most readable for
    // operators) or any Date-parseable string. If absent, the helper
    // falls back to "last completed month".
    let targetDate: Date | undefined;
    if (targetMonth) {
      const parsed = new Date(targetMonth);
      if (isNaN(parsed.getTime())) {
        throw new BadRequestError(
          "targetMonth must be a valid date like '2026-04' or '2026-04-01'",
        );
      }
      targetDate = parsed;
    }

    const result = await runVendorMonthlyPayoutGeneration(targetDate);

    res.json({
      success: true,
      message: `Receipt generation complete: ${result.created} created, ${result.skipped} skipped of ${result.totalVendors} approved vendors`,
      data: result,
    });
  },
);

/**
 * Generate partner invoice manually
 */
export const generatePartnerInvoice = asyncWrapper(
  async (req: Request, res: Response) => {
    const { partnerId, periodStart, periodEnd, generationType } = req.body;

    if (!partnerId || !periodStart || !periodEnd) {
      throw new BadRequestError(
        "partnerId, periodStart, and periodEnd are required",
      );
    }

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true, companyName: true },
    });

    if (!partner) {
      throw new NotFoundError("Partner");
    }

    // Calculate total from completed bookings
    const bookings = await prisma.booking.findMany({
      where: {
        partnerId,
        status: "COMPLETED",
        completedAt: {
          gte: new Date(periodStart),
          lte: new Date(periodEnd),
        },
      },
      select: { totalPrice: true },
    });

    const totalAmount = bookings.reduce(
      (sum, b) => sum + Number(b.totalPrice),
      0,
    );
    const bookingCount = bookings.length;

    // Generate invoice number
    const year = new Date().getFullYear();
    const lastInvoice = await prisma.partnerInvoice.findFirst({
      orderBy: { createdAt: "desc" },
      select: { invoiceNumber: true },
    });

    let nextNumber = 1;
    if (lastInvoice?.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/INV-\d+-(\d+)/);
      if (match) nextNumber = parseInt(match[1]) + 1;
    }

    const invoiceNumber = `INV-${year}-${String(nextNumber).padStart(4, "0")}`;

    // Due date is 3 days from now
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const invoice = await prisma.partnerInvoice.create({
      data: {
        invoiceNumber,
        partnerId,
        amount: totalAmount,
        bookingCount,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        generationType: generationType || "MONTHLY",
        dueDate,
      },
    });

    res.json({
      success: true,
      message: "Partner invoice generated",
      data: invoice,
    });
  },
);

// ============== MANUAL UNSUSPEND PARTNER ==============

/**
 * POST /api/v1/admin/payments/partners/:id/unsuspend
 *
 * Manually reactivate a suspended partner.
 *
 * Per spec: admin can unsuspend even when invoices remain unpaid.
 * The audit log captures the unpaid invoice IDs at the time of
 * unsuspend so the team can trace later (and the cron will simply
 * re-suspend on the next cycle if invoices remain unpaid — that's
 * intentional, no grace flag).
 *
 * Body: { reason?: string }
 */
export const manualUnsuspendPartner = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = (req.body ?? {}) as { reason?: string };

    const partner = await prisma.partner.findUnique({
      where: { id },
      select: { id: true, status: true, companyName: true, userId: true },
    });
    if (!partner) throw new NotFoundError("Partner");

    if (partner.status !== "SUSPENDED") {
      throw new BadRequestError(
        `Partner is not suspended (current status: ${partner.status}).`,
      );
    }

    // Capture which invoices are unpaid at the time of unsuspend.
    // PENDING + OVERDUE + PROOF_UPLOADED all count as "not yet PAID".
    // We include PROOF_UPLOADED here too — admin is reactivating the
    // partner before confirming their proof, which is a valid scenario
    // (partner uploaded, admin trusts it, wants to unsuspend immediately
    // and confirm later).
    const unpaidInvoices = await prisma.partnerInvoice.findMany({
      where: {
        partnerId: id,
        status: { in: ["PENDING", "OVERDUE", "PROOF_UPLOADED"] },
      },
      select: { id: true, invoiceNumber: true, status: true, amount: true },
    });

    const updated = await prisma.partner.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    // Audit log — captures the unpaid invoice context for traceability.
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_MANUALLY_UNSUSPENDED",
        entity: "Partner",
        entityId: id,
        changes: {
          previousStatus: "SUSPENDED",
          newStatus: "APPROVED",
          partner: partner.companyName,
          reason: reason ?? null,
          unpaidInvoiceIds: unpaidInvoices.map((i) => i.id),
          unpaidInvoiceNumbers: unpaidInvoices.map((i) => i.invoiceNumber),
          unpaidInvoiceTotal: unpaidInvoices.reduce(
            (sum, i) => sum + Number(i.amount),
            0,
          ),
        },
      },
    });

    const { notifyPartnerOfUnsuspension } =
      await import("../../lib/payment-notifications");
    await notifyPartnerOfUnsuspension(id, reason ?? null);

    res.json({
      success: true,
      message: `${partner.companyName} reactivated.`,
      data: {
        id: updated.id,
        status: updated.status,
        unpaidInvoicesAtUnsuspend: unpaidInvoices.length,
      },
    });
  },
);
