// ============================================
// apps/server/src/controller/vendor/earnings.controller.ts
// Vendor Portal — Earnings & Payouts
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { getReadUrl } from "../../lib/gcs";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { requireApprovedAndDocsValid, requireEarningsAccess } from "./_shared";

// ============== GCS SETUP ==============

// ============== HELPERS ==============

async function getVendorForUser(userId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    select: { id: true, status: true, companyName: true },
  });
  if (!vendor) throw new NotFoundError("Vendor profile");
  return vendor;
}

// Payout status labels — under the new direction (admin pays vendor)
// these read from the vendor's perspective: what's the state of the
// payout admin owes me? PENDING = admin hasn't paid yet. CONFIRMED =
// admin paid + uploaded the bank-transfer receipt. The old
// PAYMENT_UPLOADED state (vendor uploaded proof, admin reviewing)
// doesn't exist anymore — there's no intermediate review step for
// vendor payouts.
const RECEIPT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting Payment",
  CONFIRMED: "Paid",
  OVERDUE: "Overdue from Admin",
};

// ============== SUMMARY TILES ==============

/**
 * GET /api/v1/vendor/earnings/summary
 *
 * 4 summary tiles:
 * 1. Current month revenue
 * 2. Previous month revenue
 * 3. Total rides completed (all time)
 * 4. Last month payment status (paid/pending/overdue)
 */
export const getEarningsSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireEarningsAccess(vendor.status);

    const now = new Date();

    // Current month range
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    // Previous month range
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    );

    // Year-to-date range (Jan 1 of current year → now)
    const ytdStart = new Date(now.getFullYear(), 0, 1);
    const ytdEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

    const [
      currentMonthEarnings,
      prevMonthEarnings,
      lastMonthReceipt,
      // Tile 3: All unpaid receipts where vendor hasn't uploaded payment
      // proof yet (or has, but admin hasn't confirmed) — these are the
      // ones requiring vendor action.
      pendingActionReceipts,
      // Tile 4: Year-to-date aggregate. We use bookings (not receipts)
      // because the current month doesn't have a receipt yet but its
      // revenue should count toward YTD.
      ytdEarnings,
    ] = await Promise.all([
      prisma.booking.aggregate({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: currentMonthStart, lte: currentMonthEnd },
        },
        _sum: { vendorPayoutAmount: true },
        _count: { id: true },
      }),
      prisma.booking.aggregate({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: prevMonthStart, lte: prevMonthEnd },
        },
        _sum: { vendorPayoutAmount: true },
        _count: { id: true },
      }),
      // Last-month payout status. Was: VendorReceipt for vendor's own
      // proof of payment. Now: VendorPayout — record of admin paying
      // vendor for last month's bookings. Status flow:
      //   NO PAYOUT  → admin hasn't generated the period payout yet
      //   PENDING    → payout generated, admin hasn't paid yet
      //   PAID       → admin paid and uploaded the bank-transfer receipt
      prisma.vendorPayout.findFirst({
        where: {
          vendorId: vendor.id,
          periodStart: prevMonthStart,
          periodEnd: prevMonthEnd,
        },
        select: {
          id: true,
          status: true,
          amount: true,
          paidAt: true,
        },
      }),
      // Outstanding payouts admin owes this vendor — PENDING status
      // means the period closed and payout was generated, but admin
      // hasn't sent the money + uploaded receipt yet. Replaces the
      // old "receipts vendor needs to pay" query (opposite direction).
      prisma.vendorPayout.findMany({
        where: {
          vendorId: vendor.id,
          status: "PENDING",
        },
        select: {
          id: true,
          amount: true,
          status: true,
          periodEnd: true,
        },
      }),
      prisma.booking.aggregate({
        where: {
          vendorId: vendor.id,
          status: "COMPLETED",
          tripDate: { gte: ytdStart, lte: ytdEnd },
        },
        _sum: { vendorPayoutAmount: true },
        _count: { id: true },
      }),
    ]);

    // === Tile 1 + 2 derived data ===
    // All revenue figures are vendor-payout-based (what admin owes),
    // not partner-facing totalPrice. Swap is Stage 4 in the payment-
    // direction refactor — see the invoice section further down for
    // the matching per-booking treatment.
    const currentRevenue = Number(
      currentMonthEarnings._sum.vendorPayoutAmount || 0,
    );
    const currentRides = currentMonthEarnings._count.id;
    const prevRevenue = Number(prevMonthEarnings._sum.vendorPayoutAmount || 0);
    const prevRides = prevMonthEarnings._count.id;

    // Month-over-month delta. Only meaningful when prev > 0 — otherwise
    // a vendor's first revenue month would show as +∞.
    let momPercent: number | null = null;
    if (prevRevenue > 0) {
      momPercent = Math.round(
        ((currentRevenue - prevRevenue) / prevRevenue) * 100,
      );
    }

    // Last-month payout payment status — shown as a small status pill
    // on the Last Month tile. Under the new direction (admin pays
    // vendor), the labels reflect ADMIN'S progress paying, not the
    // vendor's progress submitting. PAID is admin confirmed the
    // transfer + uploaded receipt; PENDING is admin hasn't paid yet.
    const lastMonthDueDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      5,
      23,
      59,
      59,
    );
    let lastMonthPaymentStatus: string;
    let lastMonthStatusLabel: string;
    if (!lastMonthReceipt) {
      lastMonthPaymentStatus = "NO_PAYOUT";
      lastMonthStatusLabel = "Payout Pending Generation";
    } else if (lastMonthReceipt.status === "PAID") {
      lastMonthPaymentStatus = "PAID";
      lastMonthStatusLabel = "Paid";
    } else if (now > lastMonthDueDate) {
      lastMonthPaymentStatus = "OVERDUE";
      lastMonthStatusLabel = "Overdue from Admin";
    } else {
      lastMonthPaymentStatus = "PENDING";
      lastMonthStatusLabel = "Awaiting Payment";
    }

    // === Tile 3 derived data ===
    // Pending payouts admin owes the vendor. Under the old direction
    // this tile was split into "vendor needs to upload proof" vs.
    // "awaiting admin confirmation"; in the new direction the vendor
    // doesn't act at all — they're waiting on admin. So the entire
    // pendingActionReceipts list is now "awaiting admin to pay".
    // The "awaitingConfirmation" subcount is kept at 0 to preserve the
    // existing response shape until Stage 4 reworks the frontend tile.
    const needsProofUpload = pendingActionReceipts; // semantic: payouts admin still owes
    const awaitingAdminConfirmation: typeof pendingActionReceipts = [];
    // Overdue subset — used to colour the tile. A payout is overdue
    // if its period ended in a prior month and the 5th of the
    // following month has passed without payment.
    const overdueReceipts = needsProofUpload.filter((r: any) => {
      const periodEndDate = new Date(r.periodEnd);
      const dueDate = new Date(
        periodEndDate.getFullYear(),
        periodEndDate.getMonth() + 1,
        5,
      );
      return now > dueDate;
    });
    const pendingActionAmount = needsProofUpload.reduce(
      (sum: number, r: any) => sum + Number(r.amount),
      0,
    );

    // === Tile 4 derived data ===
    const ytdRevenue = Number(ytdEarnings._sum.vendorPayoutAmount || 0);
    const ytdRides = ytdEarnings._count.id;
    // Monthly average: divide by elapsed months in current year (so Jan
    // shows the actual Jan figure, not Jan/12). Round to integer for
    // display.
    const monthsElapsed = now.getMonth() + 1;
    const ytdMonthlyAvg =
      monthsElapsed > 0 ? Math.round(ytdRevenue / monthsElapsed) : 0;

    res.json({
      success: true,
      data: {
        // ===== Account status — frontend uses this to render the
        // suspension banner with appropriate copy and a link to the
        // overdue receipt. Reading vendor.status here is essentially
        // free since we already loaded the vendor above.
        accountStatus: {
          isSuspended: vendor.status === "SUSPENDED",
          status: vendor.status,
        },
        // ===== Tile 1 — This Month =====
        currentMonth: {
          label: currentMonthStart.toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
          revenue: currentRevenue,
          rides: currentRides,
          momPercent, // null when prev month had no revenue
        },
        // ===== Tile 2 — Last Month =====
        previousMonth: {
          label: prevMonthStart.toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
          revenue: prevRevenue,
          rides: prevRides,
          paymentStatus: lastMonthPaymentStatus,
          paymentStatusLabel: lastMonthStatusLabel,
          receiptId: lastMonthReceipt?.id || null,
        },
        // ===== Tile 3 — Pending Action =====
        pendingAction: {
          count: needsProofUpload.length,
          amount: pendingActionAmount,
          overdueCount: overdueReceipts.length,
          // Awaiting admin info shown as subtext, not as a count to act on
          awaitingConfirmationCount: awaitingAdminConfirmation.length,
        },
        // ===== Tile 4 — Year to Date =====
        ytd: {
          label: String(now.getFullYear()),
          revenue: ytdRevenue,
          rides: ytdRides,
          monthlyAvg: ytdMonthlyAvg,
        },
      },
    });
  },
);

// ============== MONTHLY RECEIPTS LIST ==============

/**
 * GET /api/v1/vendor/earnings/receipts
 *
 * List all monthly receipts with pagination.
 * Shows: month, total rides, amount, status, due date, actions.
 */
export const getReceiptsList = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireEarningsAccess(vendor.status);

    const { page = "1", limit = "10", status } = req.query;

    const where: Record<string, unknown> = { vendorId: vendor.id };

    // Frontend filter values mapped to the new VendorPayout statuses.
    // PAYMENT_UPLOADED (the old "vendor uploaded proof, admin reviewing")
    // is gone — there's no intermediate state in the new direction.
    // We map it to the same as CONFIRMED so existing filter links
    // don't 500; Stage 4 will remove the filter from the frontend.
    if (status && status !== "all") {
      if (status === "PAYMENT_UPLOADED" || status === "CONFIRMED") {
        where.status = "PAID";
      } else if (status === "OVERDUE") {
        where.status = "PENDING"; // overdue is derived client-side from period + dueDate
      } else {
        where.status = status;
      }
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [receipts, total] = await Promise.all([
      prisma.vendorPayout.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { periodStart: "desc" },
      }),
      prisma.vendorPayout.count({ where }),
    ]);

    const now = new Date();

    // Map VendorPayout rows to the same response shape the frontend was
    // expecting from VendorReceipt. Field names like `paymentProofUrl`
    // and `tripCount` are preserved — they now source from the new
    // schema fields (receiptUrl and bookingCount). canUploadPayment is
    // hardcoded to false because under the new direction the vendor
    // doesn't upload anything — admin does.
    const formattedReceipts = receipts.map((r: any) => {
      // Due date is 5th of the month after the period
      const periodEndDate = new Date(r.periodEnd);
      const dueDate = new Date(
        periodEndDate.getFullYear(),
        periodEndDate.getMonth() + 1,
        5,
      );

      const isPaid = r.status === "PAID";
      let displayStatus: string;
      if (isPaid) {
        displayStatus = "CONFIRMED";
      } else if (now > dueDate) {
        displayStatus = "OVERDUE";
      } else {
        displayStatus = "PENDING";
      }

      return {
        id: r.id,
        receiptNumber: r.receiptNumber,
        month: new Date(r.periodStart).toLocaleString("default", {
          month: "long",
          year: "numeric",
        }),
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        tripCount: r.bookingCount,
        amount: Number(r.amount),
        dueDate,
        isOverdue: !isPaid && now > dueDate,
        status: displayStatus,
        statusLabel: RECEIPT_STATUS_LABELS[displayStatus] || displayStatus,
        isPaid,
        paidAt: r.paidAt,
        // Receipt admin uploaded — vendor views as transparency proof
        // of the bank transfer. Field names kept for frontend compat.
        paymentProofUrl: r.receiptUrl,
        paymentProofFileName: r.receiptFileName,
        canUploadPayment: false, // new direction: vendor never uploads
        createdAt: r.createdAt,
      };
    });

    // Status counts for filter badges
    const allReceipts = await prisma.vendorPayout.findMany({
      where: { vendorId: vendor.id },
      select: { status: true, periodEnd: true },
    });

    const statusCounts: Record<string, number> = {
      all: allReceipts.length,
      PENDING: 0,
      CONFIRMED: 0,
      OVERDUE: 0,
    };

    allReceipts.forEach((r: any) => {
      if (r.status === "PAID") {
        statusCounts["CONFIRMED"]++;
      } else {
        const periodEndDate = new Date(r.periodEnd);
        const dueDate = new Date(
          periodEndDate.getFullYear(),
          periodEndDate.getMonth() + 1,
          5,
        );
        if (now > dueDate) {
          statusCounts["OVERDUE"]++;
        } else {
          statusCounts["PENDING"]++;
        }
      }
    });

    res.json({
      success: true,
      data: {
        receipts: formattedReceipts,
        statusCounts,
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

// ============== RECEIPT DETAIL ==============

/**
 * GET /api/v1/vendor/earnings/receipts/:receiptId
 *
 * Full receipt detail with booking breakdown, status, payment proof.
 */
export const getReceiptDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireEarningsAccess(vendor.status);

    const { receiptId } = req.params;

    const receipt = await prisma.vendorPayout.findFirst({
      where: { id: receiptId, vendorId: vendor.id },
    });

    if (!receipt) throw new NotFoundError("Payout");

    // Get bookings for this payout period
    const bookings = await prisma.booking.findMany({
      where: {
        vendorId: vendor.id,
        status: "COMPLETED",
        tripDate: { gte: receipt.periodStart, lte: receipt.periodEnd },
      },
      orderBy: { tripDate: "asc" },
      select: {
        id: true,
        bookingRef: true,
        guestName: true,
        route: true,
        pickupAddress: true,
        dropoffAddress: true,
        tripDate: true,
        tripTime: true,
        vehicleClass: true,
        // Vendor's per-booking payout — what admin agreed to pay this
        // vendor for the booking. This is the amount that actually
        // appears in their payout total. Partner-facing basePrice/
        // vatAmount/totalPrice are NOT selected — they would leak the
        // partner rate through the invoice endpoint.
        vendorPayoutAmount: true,
        // source / partner intentionally not selected — vendor-facing
        // responses must not carry booking-origin attribution.
        driver: { select: { firstName: true, lastName: true } },
      },
    });

    const now = new Date();
    const periodEndDate = new Date(receipt.periodEnd);
    const dueDate = new Date(
      periodEndDate.getFullYear(),
      periodEndDate.getMonth() + 1,
      5,
    );

    // New direction: only two real states (PENDING / PAID); OVERDUE is
    // derived from PENDING + past dueDate.
    const isPaid = receipt.status === "PAID";
    let displayStatus: string;
    if (isPaid) {
      displayStatus = "CONFIRMED";
    } else if (now > dueDate) {
      displayStatus = "OVERDUE";
    } else {
      displayStatus = "PENDING";
    }

    // Admin's bank-transfer receipt (uploaded when marking PAID).
    // Vendor views as transparency proof.
    let paymentProofUrl: string | null = null;
    if (receipt.receiptUrl) {
      paymentProofUrl = await getReadUrl(receipt.receiptUrl);
    }

    // Totals across booked rides for this period. Vendor's payout is
    // stored VAT-inclusive on Booking.vendorPayoutAmount; break each
    // booking down as base = payout / 1.15, vat = payout − base.
    // Previously used partner-facing basePrice/vatAmount/totalPrice
    // (see prior comment on this block) which surfaced the partner's
    // billed amount instead of the vendor's own entitled payout.
    // Stage 4 fix.
    const perBookingSplits = bookings.map((b) => {
      const payoutTotal = b.vendorPayoutAmount
        ? Number(b.vendorPayoutAmount)
        : 0;
      const payoutBase =
        payoutTotal > 0 ? Math.round((payoutTotal / 1.15) * 100) / 100 : 0;
      const payoutVat = Math.round((payoutTotal - payoutBase) * 100) / 100;
      return { id: b.id, payoutBase, payoutVat, payoutTotal };
    });
    const splitById = new Map(perBookingSplits.map((s) => [s.id, s]));
    const subTotal = perBookingSplits.reduce((s, p) => s + p.payoutBase, 0);
    const totalVat = perBookingSplits.reduce((s, p) => s + p.payoutVat, 0);
    const grandTotal = perBookingSplits.reduce((s, p) => s + p.payoutTotal, 0);

    res.json({
      success: true,
      data: {
        receipt: {
          id: receipt.id,
          receiptNumber: receipt.receiptNumber,
          month: new Date(receipt.periodStart).toLocaleString("default", {
            month: "long",
            year: "numeric",
          }),
          periodStart: receipt.periodStart,
          periodEnd: receipt.periodEnd,
          tripCount: receipt.bookingCount,
          amount: Number(receipt.amount),
          dueDate,
          isOverdue: !isPaid && now > dueDate,
          status: displayStatus,
          statusLabel: RECEIPT_STATUS_LABELS[displayStatus] || displayStatus,
          isPaid,
          paidAt: receipt.paidAt,
          canUploadPayment: false, // new direction: vendor never uploads
          paymentProofUrl,
          paymentProofFileName: receipt.receiptFileName,
          reviewedAt: null, // no review step under new direction
          createdAt: receipt.createdAt,
        },
        vendor: {
          companyName: vendor.companyName,
          // Bank details were on VendorReceipt under the old direction
          // (vendor's account to receive from admin). Now they live on
          // the Vendor record itself. Wiring these into VendorPayout
          // is a Stage 3B task; surfacing em-dash placeholders here.
          bankName: "—",
          iban: "—",
        },
        bookings: bookings.map((b) => {
          const split = splitById.get(b.id)!;
          return {
            id: b.id,
            bookingRef: b.bookingRef,
            guestName: b.guestName || "—",
            route: b.route || `${b.pickupAddress} → ${b.dropoffAddress}`,
            tripDate: b.tripDate,
            tripTime: b.tripTime,
            vehicleClass: b.vehicleClass,
            // Field names retained (basePrice/vatAmount/totalPrice)
            // so the vendor-facing frontend consumes them unchanged.
            // Values now reflect the vendor's payout, not the
            // partner-facing booking total. VAT-inclusive split.
            basePrice: split.payoutBase,
            vatAmount: split.payoutVat,
            totalPrice: split.payoutTotal,
            // source / partnerName intentionally omitted — vendor-facing
            // responses don't surface booking origin. See
            // vendor/bookings.controller for the full rationale.
            driverName: b.driver
              ? `${b.driver.firstName} ${b.driver.lastName}`
              : null,
          };
        }),
        totals: {
          subTotal: Math.round(subTotal * 100) / 100,
          vatAmount: Math.round(totalVat * 100) / 100,
          grandTotal: Math.round(grandTotal * 100) / 100,
        },
      },
    });
  },
);

// ============== UPLOAD PAYMENT PROOF (DEPRECATED) ==============

/**
 * POST /api/v1/vendor/earnings/receipts/:receiptId/upload-payment
 *
 * DEPRECATED in the payment-direction refactor.
 *
 * Under the new direction (admin pays vendor), the vendor never
 * uploads payment proof — that flow is gone entirely. Instead admin
 * uploads a receipt when paying the vendor, for transparency.
 *
 * The endpoint export is kept so the existing route registration
 * resolves; the implementation returns 410 GONE explaining the new
 * flow. Stage 4 will remove the frontend's upload UI and we can
 * delete the route + this stub then.
 */
export const uploadPaymentProof = asyncWrapper(
  async (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      error: "ENDPOINT_DEPRECATED",
      message:
        "Payment direction was reversed: vendors no longer upload payment proofs. " +
        "Admin pays vendors directly and uploads a transfer receipt for transparency. " +
        "Please refresh — the upload UI is being removed.",
    });
  },
);

// ============== DOWNLOAD RECEIPT PDF ==============

/**
 * GET /api/v1/vendor/earnings/receipts/:receiptId/pdf
 *
 * Generate printable receipt HTML (vendor uses browser print-to-PDF).
 */
export const downloadReceiptPdf = asyncWrapper(
  async (req: Request, res: Response) => {
    const vendor = await getVendorForUser(req.user!.id);
    requireEarningsAccess(vendor.status);

    const { receiptId } = req.params;

    const receipt = await prisma.vendorPayout.findFirst({
      where: { id: receiptId, vendorId: vendor.id },
    });
    if (!receipt) throw new NotFoundError("Payout");

    // Get vendor full info
    const vendorFull = await prisma.vendor.findUnique({
      where: { id: vendor.id },
      select: {
        companyName: true,
        crNumber: true,
        vatNumber: true,
        contactPerson: true,
        contactPhone: true,
        address: true,
        bankName: true,
        bankAccountNumber: true,
        bankIban: true,
      },
    });

    // Get bookings
    const bookings = await prisma.booking.findMany({
      where: {
        vendorId: vendor.id,
        status: "COMPLETED",
        tripDate: { gte: receipt.periodStart, lte: receipt.periodEnd },
      },
      orderBy: { tripDate: "asc" },
      select: {
        bookingRef: true,
        guestName: true,
        route: true,
        pickupAddress: true,
        dropoffAddress: true,
        tripDate: true,
        tripTime: true,
        vehicleClass: true,
        // Vendor payout is the source of truth for the receipt.
        // Partner-facing basePrice/vatAmount/totalPrice are NOT
        // selected — they would leak the partner rate into a
        // downloadable file.
        vendorPayoutAmount: true,
      },
    });

    // VAT-inclusive per-booking split, same rules as the JSON invoice
    // endpoint. Field names retained on the rendered rows so the
    // receipt HTML template didn't need any structural change.
    const bookingsWithSplit = bookings.map((b) => {
      const payoutTotal = b.vendorPayoutAmount
        ? Number(b.vendorPayoutAmount)
        : 0;
      const payoutBase =
        payoutTotal > 0 ? Math.round((payoutTotal / 1.15) * 100) / 100 : 0;
      const payoutVat = Math.round((payoutTotal - payoutBase) * 100) / 100;
      return {
        ...b,
        basePrice: payoutBase,
        vatAmount: payoutVat,
        totalPrice: payoutTotal,
      };
    });

    const subTotal = bookingsWithSplit.reduce((s, b) => s + b.basePrice, 0);
    const totalVat = bookingsWithSplit.reduce((s, b) => s + b.vatAmount, 0);
    const grandTotal = bookingsWithSplit.reduce((s, b) => s + b.totalPrice, 0);

    const periodEndDate = new Date(receipt.periodEnd);
    const dueDate = new Date(
      periodEndDate.getFullYear(),
      periodEndDate.getMonth() + 1,
      5,
    );

    const periodLabel = new Date(receipt.periodStart).toLocaleString(
      "default",
      { month: "long", year: "numeric" },
    );

    let displayStatus: string;
    if (receipt.status === "PAID") {
      displayStatus = "CONFIRMED";
    } else {
      displayStatus = "PENDING";
    }

    const html = buildReceiptHtml(receipt, vendorFull, bookingsWithSplit, {
      subTotal,
      totalVat,
      grandTotal,
      periodLabel,
      dueDate,
      displayStatus,
    });

    res.json({
      success: true,
      data: {
        receiptNumber: receipt.receiptNumber,
        html,
        meta: {
          fileName: `${receipt.receiptNumber}.pdf`,
          title: `Receipt — ${receipt.receiptNumber}`,
          vendor: vendor.companyName,
        },
      },
    });
  },
);

// ============== RECEIPT HTML BUILDER ==============

function buildReceiptHtml(
  receipt: Record<string, unknown>,
  vendor: Record<string, unknown> | null,
  bookings: Array<Record<string, unknown>>,
  totals: {
    subTotal: number;
    totalVat: number;
    grandTotal: number;
    periodLabel: string;
    dueDate: Date;
    displayStatus: string;
  },
): string {
  const bookingRows = bookings
    .map(
      (b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${b.bookingRef}</td>
      <td>${b.guestName || "—"}</td>
      <td>${b.route || `${b.pickupAddress} → ${b.dropoffAddress}`}</td>
      <td>${new Date(b.tripDate as string).toLocaleDateString()}</td>
      <td>${b.vehicleClass}</td>
      <td class="amount">${Number(b.totalPrice).toFixed(2)}</td>
    </tr>`,
    )
    .join("");

  const statusBadgeClass =
    totals.displayStatus === "CONFIRMED"
      ? "status-PAID"
      : totals.displayStatus === "PAYMENT_UPLOADED"
        ? "status-PENDING"
        : "status-OVERDUE";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt — ${receipt.receiptNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 900px; margin: 0 auto; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #c8a961; padding-bottom: 20px; }
    .logo { font-size: 28px; font-weight: 800; color: #c8a961; }
    .logo span { color: #333; }
    .inv-info { text-align: right; }
    .inv-info h2 { font-size: 22px; color: #333; margin-bottom: 4px; }
    .inv-info p { font-size: 12px; color: #666; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .meta-box { background: #f8f8f8; padding: 16px; border-radius: 8px; }
    .meta-box h4 { font-size: 11px; color: #c8a961; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .meta-box p { font-size: 13px; margin-bottom: 4px; }
    .meta-box .label { color: #999; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; font-size: 11px; color: #999; text-transform: uppercase; padding: 10px 8px; border-bottom: 2px solid #e5e5e5; }
    td { padding: 8px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
    .amount { text-align: right; }
    .totals-section { margin-top: 20px; display: flex; justify-content: flex-end; }
    .totals-table { width: 280px; }
    .totals-table td { padding: 6px 8px; font-size: 13px; }
    .totals-table .grand td { border-top: 2px solid #c8a961; font-weight: 700; font-size: 16px; color: #c8a961; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .status-PENDING { background: #fef3c7; color: #92400e; }
    .status-OVERDUE { background: #fee2e2; color: #991b1b; }
    .status-PAID { background: #d1fae5; color: #065f46; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #999; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">LUX<span>DRIVE</span></div>
      <p style="font-size: 12px; color: #666; margin-top: 4px;">Premium Chauffeur Services</p>
    </div>
    <div class="inv-info">
      <h2>Vendor Receipt</h2>
      <p><strong>${receipt.receiptNumber}</strong></p>
      <p>Period: ${totals.periodLabel}</p>
      <p>Status: <span class="status-badge ${statusBadgeClass}">${RECEIPT_STATUS_LABELS[totals.displayStatus] || totals.displayStatus}</span></p>
      <p>Due: ${totals.dueDate.toLocaleDateString()}</p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <h4>Vendor Details</h4>
      <p><strong>${vendor?.companyName || "—"}</strong></p>
      <p>${vendor?.address || ""}</p>
      <p><span class="label">CR:</span> ${vendor?.crNumber || "—"} &nbsp; <span class="label">VAT:</span> ${vendor?.vatNumber || "—"}</p>
      <p><span class="label">Contact:</span> ${vendor?.contactPerson || "—"} — ${vendor?.contactPhone || "—"}</p>
    </div>
    <div class="meta-box">
      <h4>Payment Details</h4>
      <p><span class="label">Receipt No:</span> ${receipt.receiptNumber}</p>
      <p><span class="label">Total Rides:</span> ${bookings.length}</p>
      <p><span class="label">Amount:</span> <strong>SAR ${totals.grandTotal.toFixed(2)}</strong></p>
      <p><span class="label">Bank:</span> ${vendor?.bankName || "—"}</p>
      <p><span class="label">IBAN:</span> ${vendor?.bankIban || "—"}</p>
    </div>
  </div>

  <h3 style="font-size: 14px; color: #333; margin-bottom: 8px;">Trip Details</h3>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Booking No</th>
        <th>Customer</th>
        <th>Route</th>
        <th>Trip Date</th>
        <th>Vehicle</th>
        <th class="amount">Amount (SAR)</th>
      </tr>
    </thead>
    <tbody>
      ${bookingRows}
    </tbody>
  </table>

  <div class="totals-section">
    <table class="totals-table">
      <tr><td>Sub-Total</td><td class="amount">${totals.subTotal.toFixed(2)}</td></tr>
      <tr><td>VAT (15%)</td><td class="amount">${totals.totalVat.toFixed(2)}</td></tr>
      <tr class="grand"><td>Grand Total</td><td class="amount">SAR ${totals.grandTotal.toFixed(2)}</td></tr>
    </table>
  </div>

  <div class="footer">
    <p>LuxDrive — Premium Chauffeur Services, Kingdom of Saudi Arabia</p>
    <p>Payment is due by ${totals.dueDate.toLocaleDateString()}. Please transfer the amount to the admin account and upload proof of payment.</p>
  </div>
</body>
</html>`;
}
