// ============================================
// apps/server/src/route/partner/invoice.route.ts
// Partner Portal — Invoice Routes
// ============================================

import { Router } from "express";
import {
  getMonthlyInvoices,
  getCustomInvoices,
  getInvoiceDetail,
  generateCustomInvoice,
  exportInvoiceCsv,
  downloadInvoicePdf,
  generateMonthlyInvoices,
  uploadPaymentProof,
} from "../../controller/partner/invoice.controller";

const router = Router();

// ============== MONTHLY INVOICES (auto-generated) ==============
// GET /api/v1/partner/invoices/monthly?page=1&limit=10&status=PENDING
router.get("/monthly", getMonthlyInvoices);

// ============== CUSTOM INVOICES (partner-generated) ==============
// GET /api/v1/partner/invoices/custom?page=1&limit=10
router.get("/custom", getCustomInvoices);

// ============== GENERATE CUSTOM INVOICE ==============
// POST /api/v1/partner/invoices/custom  { startDate, endDate }
router.post("/custom", generateCustomInvoice);

// ============== AUTO-GENERATE MONTHLY INVOICES (cron / admin trigger) ==============
// POST /api/v1/partner/invoices/generate-monthly
router.post("/generate-monthly", generateMonthlyInvoices);

// ============== SINGLE INVOICE DETAIL ==============
// GET /api/v1/partner/invoices/:invoiceId
router.get("/:invoiceId", getInvoiceDetail);

// ============== UPLOAD PAYMENT PROOF ==============
// POST /api/v1/partner/invoices/:id/upload-proof  { proofUrl, proofFileName? }
// Partner uploads bank-transfer proof. SUSPENDED partners can use this
// as the recovery path after the 6th-of-month auto-suspension.
router.post("/:id/upload-proof", uploadPaymentProof);

// ============== EXPORT CSV ==============
// GET /api/v1/partner/invoices/:invoiceId/csv
router.get("/:invoiceId/csv", exportInvoiceCsv);

// ============== DOWNLOAD PDF (HTML) ==============
// GET /api/v1/partner/invoices/:invoiceId/pdf
router.get("/:invoiceId/pdf", downloadInvoicePdf);

export default router;
