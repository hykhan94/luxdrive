// ============================================
// apps/server/src/lib/payment-notifications.ts
//
// Notification dispatch for payment-related events under the new
// direction (admin pays vendor, partner pays admin).
//
// Sibling to lib/offer-notifications.ts — same pattern of one helper
// per event so message wording sits in one place and is easy to tune.
//
// Cross-visibility rule applies (vendor never sees partner-side info,
// partner never sees vendor-side info). The two payment flows live
// on separate sides of the admin and never bridge.
//
// Event hooks:
//   - notifyAdminOfPartnerProofUpload    — partner uploaded proof
//   - notifyPartnerOfPaymentConfirmation — admin confirmed payment
//   - notifyVendorOfPayoutPaid           — admin paid vendor + uploaded receipt
//   - notifyPartnerOfSuspension          — auto-suspension fired on the 6th
//   - notifyPartnerOfUnsuspension        — admin manual unsuspend
// ============================================

import { prisma } from "./prisma";

/**
 * Admin sees a partner has uploaded payment proof.
 *
 * Fired from the partner upload-proof endpoint. Drives the
 * "Payments to Receive — Awaiting Confirmation" tab badge.
 */
export async function notifyAdminOfPartnerProofUpload(
  invoiceId: string,
): Promise<void> {
  const [invoice, admins] = await Promise.all([
    prisma.partnerInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        invoiceNumber: true,
        amount: true,
        partner: { select: { companyName: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    }),
  ]);
  if (!invoice || admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Partner Payment Proof Uploaded",
      message: `${invoice.partner?.companyName ?? "A partner"} uploaded payment proof for invoice ${invoice.invoiceNumber} (SAR ${Number(invoice.amount).toFixed(2)}). Please review and confirm.`,
      type: "PAYMENT_PROOF_SUBMITTED",
      data: {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount: Number(invoice.amount),
      },
    })),
  });
}

/**
 * Partner sees their payment has been confirmed.
 *
 * Fired when admin flips status to PAID via confirmPartnerPayment.
 * Notification type renamed from the old PAYMENT_VERIFIED (which was
 * vendor-side under the old direction) to INVOICE_PAYMENT_CONFIRMED —
 * keeps semantics aligned with the new direction and avoids confusing
 * anyone reading the notification table six months from now.
 */
export async function notifyPartnerOfPaymentConfirmation(
  invoiceId: string,
): Promise<void> {
  const invoice = await prisma.partnerInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      invoiceNumber: true,
      amount: true,
      partner: { select: { userId: true } },
    },
  });
  if (!invoice || !invoice.partner) return;

  await prisma.notification.create({
    data: {
      userId: invoice.partner.userId,
      title: "Payment Confirmed",
      message: `Your payment for invoice ${invoice.invoiceNumber} (SAR ${Number(invoice.amount).toFixed(2)}) has been confirmed. Thank you.`,
      type: "INVOICE_PAYMENT_CONFIRMED",
      data: {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount: Number(invoice.amount),
      },
    },
  });
}

/**
 * Vendor sees that their payout has landed.
 *
 * Fired when admin marks a VendorPayout as PAID and uploads the
 * bank-transfer receipt. Vendor can view the receipt for transparency.
 */
export async function notifyVendorOfPayoutPaid(
  payoutId: string,
): Promise<void> {
  const payout = await prisma.vendorPayout.findUnique({
    where: { id: payoutId },
    select: {
      receiptNumber: true,
      amount: true,
      vendor: { select: { userId: true } },
    },
  });
  if (!payout || !payout.vendor) return;

  await prisma.notification.create({
    data: {
      userId: payout.vendor.userId,
      title: "Payout Received",
      message: `Your payout ${payout.receiptNumber} of SAR ${Number(payout.amount).toFixed(2)} has been paid. The transfer receipt is now available to view.`,
      type: "VENDOR_PAYOUT_PAID",
      data: {
        payoutId,
        receiptNumber: payout.receiptNumber,
        amount: Number(payout.amount),
      },
    },
  });
}

/**
 * Partner sees they've been auto-suspended for non-payment.
 *
 * Fired from the 6th-of-month suspension cron. The message names the
 * specific overdue invoice(s) so partner knows what to act on, and
 * the data payload carries the IDs so the CTA can deep-link them.
 */
export async function notifyPartnerOfSuspension(
  partnerId: string,
  overdueInvoiceIds: string[],
  totalAmount: number,
): Promise<void> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { userId: true },
  });
  if (!partner) return;

  const count = overdueInvoiceIds.length;
  await prisma.notification.create({
    data: {
      userId: partner.userId,
      title: "Account Suspended — Payment Required",
      message: `Your account has been suspended due to ${count} overdue invoice${count > 1 ? "s" : ""} totaling SAR ${totalAmount.toFixed(2)}. Upload payment proof to request reactivation.`,
      type: "PARTNER_AUTO_SUSPENDED",
      data: {
        overdueInvoiceIds,
        totalAmount,
        reason: "NONPAYMENT",
      },
    },
  });

  // Also notify admin so they can see the auto-action on their side.
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (admins.length === 0) return;

  const partnerInfo = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { companyName: true },
  });

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      title: "Partner Auto-Suspended",
      message: `${partnerInfo?.companyName ?? "A partner"} auto-suspended for ${count} overdue invoice${count > 1 ? "s" : ""} (SAR ${totalAmount.toFixed(2)}).`,
      type: "PARTNER_AUTO_SUSPENDED_ADMIN",
      data: {
        partnerId,
        overdueInvoiceIds,
        totalAmount,
      },
    })),
  });
}

/**
 * Partner sees they've been reactivated by admin.
 *
 * Fired when admin manually unsuspends. Per spec admin can unsuspend
 * even when invoices remain unpaid; the audit log captures the
 * unpaid invoice IDs at unsuspend time for traceability.
 */
export async function notifyPartnerOfUnsuspension(
  partnerId: string,
  reason: string | null,
): Promise<void> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { userId: true },
  });
  if (!partner) return;

  await prisma.notification.create({
    data: {
      userId: partner.userId,
      title: "Account Reactivated",
      message: reason
        ? `Your account has been reactivated by admin. Reason: ${reason}.`
        : "Your account has been reactivated by admin. You can resume booking.",
      type: "PARTNER_MANUALLY_UNSUSPENDED",
      data: { reason },
    },
  });
}
