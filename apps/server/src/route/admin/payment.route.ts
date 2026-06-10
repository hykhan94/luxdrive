// ============================================
// apps/server/src/route/admin/payment.route.ts
// ============================================

import { Router } from "express";
import {
  // Summary
  getPaymentSummary,
  getPaymentNotifications,
  // Online Payments
  getOnlinePayments,
  // Vendor Receipts
  getVendorReceipts,
  getVendorReceiptDetails,
  reviewVendorReceipt,
  markVendorReceiptPaid,
  generateVendorReceipt,
  runVendorMonthlyReceiptsNow,
  // Partner Invoices
  getPartnerInvoices,
  getPartnerInvoiceDetails,
  sendPartnerReminder,
  confirmPartnerPayment,
  markPartnerPaymentReceived,
  generatePartnerInvoice,
  manualUnsuspendPartner,
} from "../../controller/admin/payment.controller";

const router = Router();

// ============== SUMMARY ==============
router.get("/summary", getPaymentSummary);
router.get("/notifications", getPaymentNotifications);

// ============== ONLINE PAYMENTS (Tab 1) ==============
router.get("/online", getOnlinePayments);

// ============== VENDOR PAYOUTS / PAYMENTS TO SEND (Tab 2) ==============
// Under the new payment direction these are payouts admin needs to
// SEND to vendors. Route paths kept as `vendor-receipts` for backward
// compat with the existing frontend; Stage 4 will rename.
router.get("/vendor-receipts", getVendorReceipts);
router.get("/vendor-receipts/:id", getVendorReceiptDetails);
router.patch("/vendor-receipts/:id/review", reviewVendorReceipt);
router.patch("/vendor-receipts/:id/mark-paid", markVendorReceiptPaid);
router.post("/vendor-receipts/generate", generateVendorReceipt);
router.post("/vendor-receipts/run-monthly", runVendorMonthlyReceiptsNow);

// ============== PARTNER INVOICES / PAYMENTS TO RECEIVE (Tab 3) ==============
router.get("/partner-invoices", getPartnerInvoices);
router.get("/partner-invoices/:id", getPartnerInvoiceDetails);
router.post("/partner-invoices/:id/send-reminder", sendPartnerReminder);
router.patch("/partner-invoices/:id/confirm", confirmPartnerPayment);
router.patch("/partner-invoices/:id/mark-received", markPartnerPaymentReceived);
router.post("/partner-invoices/generate", generatePartnerInvoice);

// ============== PARTNER SUSPENSION ==============
// Manual unsuspend for a partner that was auto-suspended (or
// previously manually suspended). Audit log captures the unpaid
// invoice IDs at time of unsuspend per spec — see payment.controller
// for the audit shape.
router.post("/partners/:id/unsuspend", manualUnsuspendPartner);

export default router;
