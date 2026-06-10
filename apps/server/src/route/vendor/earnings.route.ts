// ============================================
// apps/server/src/route/vendor/earnings.route.ts
// Vendor Portal — Earnings & Payouts Routes
// ============================================

import { Router } from "express";
import {
  getEarningsSummary,
  getReceiptsList,
  getReceiptDetail,
  uploadPaymentProof,
  downloadReceiptPdf,
} from "../../controller/vendor/earnings.controller";

const router = Router();

// Summary tiles
router.get("/summary", getEarningsSummary);

// Receipts list with pagination
router.get("/receipts", getReceiptsList);

// Receipt detail
router.get("/receipts/:receiptId", getReceiptDetail);

// Upload payment proof
router.post("/receipts/:receiptId/upload-payment", uploadPaymentProof);

// Download receipt PDF
router.get("/receipts/:receiptId/pdf", downloadReceiptPdf);

export default router;
