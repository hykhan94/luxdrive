"use client";

import { useState, useEffect, useCallback } from "react";
import { vendorApi, uploadApi, ApiError } from "@/lib/api";
import DocumentViewer from "@/components/ui/document-viewer";
import {
  Wallet,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  FileText,
  X,
  Calendar,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { useNotification } from "@/lib/notification-context";

// ============== TYPES ==============

// Mirrors the backend `getEarningsSummary` response. Four tiles each
// answer a distinct vendor question — see the design note in the
// backend controller for the rationale.
interface EarningsSummary {
  accountStatus: {
    isSuspended: boolean;
    status: string;
  };
  currentMonth: {
    label: string;
    revenue: number;
    rides: number;
    momPercent: number | null;
  };
  previousMonth: {
    label: string;
    revenue: number;
    rides: number;
    paymentStatus: string;
    paymentStatusLabel: string;
    receiptId: string | null;
  };
  pendingAction: {
    count: number;
    amount: number;
    overdueCount: number;
    awaitingConfirmationCount: number;
  };
  ytd: {
    label: string;
    revenue: number;
    rides: number;
    monthlyAvg: number;
  };
}

// Mirrors the backend `getReceiptsList` row shape. Names match the
// backend exactly so we don't reintroduce the mapping bugs that hid
// the data on the prior version.
//
// Stage 3B-2 direction flip — semantics changed but field NAMES kept
// for frontend compat:
//   - status: PENDING | CONFIRMED | OVERDUE  (PAYMENT_UPLOADED is gone;
//     there's no intermediate "vendor uploaded, admin reviewing" step
//     anymore. Admin pays + uploads receipt as a single action.)
//   - paymentProofUrl / paymentProofFileName: ADMIN-UPLOADED bank
//     transfer receipt (signed only on detail-fetch; list returns the
//     raw GCS path that needs signing before viewing). Was vendor's
//     own payment proof in the old direction.
//   - canUploadPayment: backend hardcodes false under new direction
//     — vendor never uploads payment proof anymore.
//   - isPaid: true when admin has paid the payout out (status PAID
//     on the backend / CONFIRMED in this response).
interface Receipt {
  id: string;
  receiptNumber: string;
  month: string;
  periodStart: string;
  periodEnd: string;
  tripCount: number;
  amount: number;
  dueDate: string | null;
  isOverdue: boolean;
  status: string; // PENDING | CONFIRMED | OVERDUE
  statusLabel: string;
  isPaid: boolean;
  paidAt: string | null;
  paymentProofUrl: string | null;
  paymentProofFileName: string | null;
  canUploadPayment: boolean;
  createdAt: string;
}

// Detail response: backend wraps in `receipt` + `vendor` + `bookings`.
// The previous frontend flattened these wrong, which is why the modal
// rendered blank.
interface ReceiptDetail {
  receipt: Receipt & { reviewedAt: string | null };
  vendor: {
    companyName: string;
    bankName: string;
    iban: string;
  };
  bookings: Array<{
    id: string;
    bookingRef: string;
    guestName: string;
    route: string;
    tripDate: string;
    tripTime: string | null;
    vehicleClass: string;
    basePrice: number;
    vatAmount: number;
    totalPrice: number;
    source: string;
    partnerName: string | null;
    driverName: string | null;
  }>;
  summary?: {
    subTotal: number;
    totalVat: number;
    grandTotal: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface VendorEarningsProps {
  refreshBadges: () => void;
}

// ============== HELPERS ==============

// Pill colors for the receipt-status enum returned by the backend.
// Under new direction backend returns PENDING / CONFIRMED / OVERDUE
// — the old PAYMENT_UPLOADED middle state is gone (admin pays and
// uploads receipt as a single action).
function getStatusColor(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "PENDING":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "OVERDUE":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    case "PAID":
      // Legacy/alias — same look as CONFIRMED.
      return "bg-green-500/10 text-green-400 border-green-500/30";
    default:
      return "bg-gray-500/10 text-gray-400 border-gray-500/30";
  }
}

// Color the Last Month tile's payment-status pill the same way as the
// receipts table pill, so visual language is consistent.
function getLastMonthStatusColor(status: string) {
  switch (status) {
    case "PAID":
      return "bg-green-500/15 text-green-400 border-green-500/30";
    case "OVERDUE":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "PENDING":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "NO_RECEIPT":
    default:
      return "bg-neutral-700 text-gray-400 border-neutral-600";
  }
}

function fmtSAR(n: number) {
  return (Number(n) || 0).toLocaleString();
}

// ============== MAIN COMPONENT ==============

export default function VendorEarningsPanel({
  refreshBadges,
}: VendorEarningsProps) {
  const { showNotification } = useNotification();

  // Summary
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  // Receipts list
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(true);

  // Receipt detail
  const [receiptDetail, setReceiptDetail] = useState<ReceiptDetail | null>(
    null,
  );
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Tracks the receipt row currently loading a signed read-URL for
  // its "View Receipt" action. Used to disable the button + show a
  // spinner so the vendor doesn't double-click while signing.
  const [viewingReceiptId, setViewingReceiptId] = useState<string | null>(null);

  // DocumentViewer — under new direction this shows admin's uploaded
  // bank-transfer receipt (proof to vendor that payout was sent).
  // Previously showed vendor's own payment proof, but vendors no
  // longer upload anything under Stage 3B-2.
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | undefined>(
    undefined,
  );
  const [viewerTitle, setViewerTitle] = useState<string | undefined>(undefined);

  // ============== FETCH SUMMARY ==============

  const fetchSummary = useCallback(async () => {
    setIsLoadingSummary(true);
    try {
      const res = await vendorApi.getEarningsSummary();
      if (res.success && res.data) {
        setSummary(res.data);
      }
    } catch {
      // Silent — tiles will show 0s if summary fetch fails
    } finally {
      setIsLoadingSummary(false);
    }
  }, []);

  // ============== FETCH RECEIPTS ==============

  const fetchReceipts = useCallback(
    async (page = 1) => {
      setIsLoadingReceipts(true);
      try {
        const params: Record<string, any> = { page, limit: pagination.limit };
        if (statusFilter !== "all") params.status = statusFilter;

        const res = await vendorApi.getReceipts(params);
        if (res.success && res.data) {
          setReceipts(res.data.receipts || []);
          setPagination(
            res.data.pagination || {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 0,
            },
          );
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load receipts");
      } finally {
        setIsLoadingReceipts(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusFilter, pagination.limit],
  );

  useEffect(() => {
    fetchSummary();
    fetchReceipts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchReceipts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // ============== VIEW DETAIL ==============

  const handleViewDetail = async (receiptId: string) => {
    setIsLoadingDetail(true);
    setShowDetailModal(true);
    try {
      const res = await vendorApi.getReceipt(receiptId);
      // Backend wraps the detail as { receipt, vendor, bookings, summary }
      // so we keep the full envelope rather than try to flatten it.
      if (res.success && res.data) setReceiptDetail(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load receipt");
      setShowDetailModal(false);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // ============== VIEW RECEIPT (admin-uploaded transfer proof) ==============
  //
  // Stage 3B-2 inversion — admin uploads the bank-transfer receipt to
  // the vendor's payout record after marking it paid; vendor sees that
  // receipt here as transparency proof. The list endpoint returns the
  // raw GCS path in `paymentProofUrl` (legacy field name preserved for
  // compat) — the detail endpoint signs it on the way out, but for
  // the inline "View Receipt" button on the row we need to sign it
  // on-demand via the upload helper. Two calls, but it avoids a fetch
  // of the whole detail payload when the vendor only wants the file.
  const handleViewReceipt = async (receipt: Receipt) => {
    if (!receipt.paymentProofUrl) return;
    setViewingReceiptId(receipt.id);
    try {
      const signed = await uploadApi.getSignedReadUrl({
        filePath: receipt.paymentProofUrl,
      });
      if (!signed.success || !signed.data) {
        throw new Error("Failed to load receipt URL");
      }
      const url = signed.data.readUrl ?? signed.data.url ?? null;
      if (!url) throw new Error("No signed URL returned");
      setViewerUrl(url);
      setViewerFileName(receipt.paymentProofFileName || undefined);
      setViewerTitle(`Bank Receipt from Admin — ${receipt.receiptNumber}`);
    } catch (err: any) {
      const msg =
        err instanceof ApiError ? err.message : err?.message || "Failed";
      showNotification("error", msg);
    } finally {
      setViewingReceiptId(null);
    }
  };

  // ============== DOWNLOAD PDF ==============
  //
  // The backend returns receipt HTML built with print-friendly CSS
  // (@media print rules included). Strategy: open the HTML in a new
  // tab and auto-trigger the browser's print dialog, where the vendor
  // can pick "Save as PDF" as the destination. This avoids shipping a
  // PDF rendering library while still giving the vendor a real PDF
  // they can save or send.
  //
  // The previous implementation called `api.get(...)` and threw the
  // result away — nothing actually downloaded. The success toast was
  // misleading because no error was thrown.
  const handleDownloadPdf = async (receiptId: string) => {
    try {
      const res = await vendorApi.downloadReceiptPdf(receiptId);
      const html: string | undefined = res?.data?.html;
      const title: string | undefined = res?.data?.meta?.title;
      if (!html) {
        throw new Error("Receipt content unavailable");
      }

      // Open a new window first, then write the HTML into it. Some
      // browsers block popups initiated outside of a user gesture, but
      // since this handler is wired to a click it should pass through.
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        // Pop-up blocked — fall back to a same-tab data URL so the
        // vendor at least gets the receipt in front of them. They can
        // print from the address bar's File menu manually.
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        window.location.href = url;
        showNotification(
          "info",
          "Pop-up was blocked — opening receipt in current tab. Use your browser's Print option to save as PDF.",
        );
        return;
      }

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      if (title) {
        try {
          printWindow.document.title = title;
        } catch {
          // Cross-origin restrictions can throw here even on same-
          // origin docs in some browsers; safe to ignore.
        }
      }

      // Wait for the new window's resources to settle (mainly the
      // @font-face / inline styles) before invoking print, otherwise
      // the print preview can render with fallback fonts and look
      // wrong. `onload` fires after the writeable doc parses.
      const triggerPrint = () => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
          // No-op — vendor can still print manually if auto-print fails.
        }
      };
      if (printWindow.document.readyState === "complete") {
        triggerPrint();
      } else {
        printWindow.addEventListener("load", triggerPrint);
      }

      showNotification(
        "success",
        "Receipt opened — choose 'Save as PDF' in the print dialog",
      );
    } catch (err: any) {
      showNotification("error", err.message || "Download failed");
    }
  };

  // ============== DERIVED TILE STATES ==============

  // Show the urgent-action tile in red when there's anything overdue,
  // amber when there's pending action but nothing overdue, neutral
  // when everything's clear.
  const pendingActionTone: "red" | "amber" | "neutral" = (() => {
    if (!summary) return "neutral";
    if (summary.pendingAction.overdueCount > 0) return "red";
    if (summary.pendingAction.count > 0) return "amber";
    return "neutral";
  })();

  const pendingActionStyles = {
    red: {
      card: "border-red-500/40 bg-red-500/5",
      number: "text-red-400",
      icon: "text-red-400",
    },
    amber: {
      card: "border-yellow-500/40 bg-yellow-500/5",
      number: "text-yellow-400",
      icon: "text-yellow-400",
    },
    neutral: {
      card: "border-neutral-800",
      number: "text-white",
      icon: "text-gray-500",
    },
  }[pendingActionTone];

  // ============== RENDER ==============

  return (
    <div className="space-y-6">
      {/* ===== Suspension Banner =====
          Shown only when the vendor is currently suspended. We separate
          the two suspension-flavored cases so the copy is actionable:
            - Suspended AND has overdue receipts → non-payment, banner
              tells them paying clears it and points at the receipts table.
            - Suspended for some other reason (doc expiry, admin manual)
              → generic banner asking them to contact admin.
          When the vendor isn't suspended, nothing renders. */}
      {summary?.accountStatus.isSuspended && (
        <div className="p-4 rounded-xl border bg-red-500/5 border-red-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">
              Account Suspended
            </p>
            <p className="text-xs text-red-400/80 mt-0.5">
              {summary.pendingAction.overdueCount > 0 ? (
                <>
                  Your account is suspended due to non-payment of{" "}
                  {summary.pendingAction.overdueCount} overdue receipt
                  {summary.pendingAction.overdueCount !== 1
                    ? "s"
                    : ""} (SAR {fmtSAR(summary.pendingAction.amount)}). Upload
                  payment proof below — once admin confirms the payment, your
                  account will be reactivated.
                </>
              ) : (
                <>
                  Your account is currently suspended. Please contact admin to
                  discuss reactivation.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* ===== Summary Tiles ===== */}
      {isLoadingSummary || !summary ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Tile 1 — This Month */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <p className="text-gray-400 text-sm mb-1">
              {summary.currentMonth.label}
            </p>
            <p className="text-2xl font-bold text-green-400">
              SAR {fmtSAR(summary.currentMonth.revenue)}
            </p>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-500">
                {summary.currentMonth.rides} ride
                {summary.currentMonth.rides !== 1 ? "s" : ""}
              </p>
              {summary.currentMonth.momPercent !== null && (
                <span
                  className={`flex items-center gap-1 text-xs font-medium ${
                    summary.currentMonth.momPercent >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {summary.currentMonth.momPercent >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {summary.currentMonth.momPercent >= 0 ? "+" : ""}
                  {summary.currentMonth.momPercent}% MoM
                </span>
              )}
            </div>
          </div>

          {/* Tile 2 — Last Month */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <p className="text-gray-400 text-sm mb-1">
              {summary.previousMonth.label}
            </p>
            <p className="text-2xl font-bold text-white">
              SAR {fmtSAR(summary.previousMonth.revenue)}
            </p>
            <div className="flex items-center justify-between mt-1 gap-2">
              <p className="text-xs text-gray-500">
                {summary.previousMonth.rides} ride
                {summary.previousMonth.rides !== 1 ? "s" : ""}
              </p>
              <span
                className={`px-2 py-0.5 text-[10px] rounded-full border whitespace-nowrap ${getLastMonthStatusColor(summary.previousMonth.paymentStatus)}`}
              >
                {summary.previousMonth.paymentStatusLabel}
              </span>
            </div>
          </div>

          {/* Tile 3 — Pending Action */}
          <div
            className={`bg-neutral-900 border rounded-xl p-5 ${pendingActionStyles.card}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <p className="text-gray-400 text-sm">Needs Action</p>
              {summary.pendingAction.overdueCount > 0 && (
                <AlertTriangle
                  className={`w-3.5 h-3.5 ${pendingActionStyles.icon}`}
                />
              )}
            </div>
            <p className={`text-2xl font-bold ${pendingActionStyles.number}`}>
              {summary.pendingAction.count} receipt
              {summary.pendingAction.count !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {summary.pendingAction.count > 0 ? (
                <>
                  SAR {fmtSAR(summary.pendingAction.amount)} — upload proof
                  {summary.pendingAction.overdueCount > 0 && (
                    <span className="text-red-400">
                      {" "}
                      ({summary.pendingAction.overdueCount} overdue)
                    </span>
                  )}
                </>
              ) : summary.pendingAction.awaitingConfirmationCount > 0 ? (
                <>
                  {summary.pendingAction.awaitingConfirmationCount} awaiting
                  admin confirmation
                </>
              ) : (
                "All clear"
              )}
            </p>
          </div>

          {/* Tile 4 — Year to Date */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-gray-400 text-sm">{summary.ytd.label} YTD</p>
              <Calendar className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <p className="text-2xl font-bold text-white">
              SAR {fmtSAR(summary.ytd.revenue)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {summary.ytd.rides} rides · SAR {fmtSAR(summary.ytd.monthlyAvg)}
              /mo avg
            </p>
          </div>
        </div>
      )}

      {/* ===== Receipts Section ===== */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-white font-semibold">Vendor Receipts</h3>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-400">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold/50"
            >
              <option value="all">All</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Paid</option>
              <option value="OVERDUE">Overdue</option>
            </select>
          </div>
        </div>

        {isLoadingReceipts ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
          </div>
        ) : receipts.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-neutral-800">
                <Wallet className="w-5 h-5 text-gray-400" />
              </EmptyMedia>
              <EmptyTitle className="text-white">No receipts yet</EmptyTitle>
              <EmptyDescription className="text-gray-400">
                Your vendor receipts will appear here at the start of each month
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-800/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Receipt #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Rides
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {receipts.map((receipt) => (
                    <tr key={receipt.id} className="hover:bg-neutral-800/30">
                      <td className="px-6 py-4 text-sm text-luxury-gold font-mono">
                        {receipt.receiptNumber}
                      </td>
                      <td className="px-6 py-4 text-sm text-white">
                        {receipt.month}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {receipt.tripCount}
                      </td>
                      <td className="px-6 py-4 text-sm text-white font-medium">
                        SAR {fmtSAR(receipt.amount)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full border ${getStatusColor(receipt.status)}`}
                        >
                          {receipt.statusLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewDetail(receipt.id)}
                            className="px-3 py-1.5 text-xs text-gray-400 border border-neutral-700 rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </button>
                          <button
                            onClick={() => handleDownloadPdf(receipt.id)}
                            className="px-3 py-1.5 bg-luxury-gold/10 text-luxury-gold text-xs rounded-lg hover:bg-luxury-gold/20 transition-colors flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            PDF
                          </button>
                          {/* View Receipt — only when admin has paid and
                              uploaded the bank-transfer receipt. Under
                              new direction this replaces the old
                              "Upload Proof" action entirely. */}
                          {receipt.isPaid && receipt.paymentProofUrl && (
                            <button
                              onClick={() => handleViewReceipt(receipt)}
                              disabled={viewingReceiptId === receipt.id}
                              className="px-3 py-1.5 bg-blue-500/10 text-blue-400 text-xs rounded-lg hover:bg-blue-500/20 transition-colors flex items-center gap-1 disabled:opacity-50"
                            >
                              {viewingReceiptId === receipt.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <FileText className="w-3 h-3" />
                              )}
                              View Receipt
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total,
                  )}{" "}
                  of {pagination.total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchReceipts(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="p-2 bg-neutral-800 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from(
                    { length: Math.min(pagination.totalPages, 5) },
                    (_, i) => i + 1,
                  ).map((page) => (
                    <button
                      key={page}
                      onClick={() => fetchReceipts(page)}
                      className={`w-8 h-8 rounded-lg text-sm ${pagination.page === page ? "bg-luxury-gold text-black font-medium" : "bg-neutral-800 text-gray-400 hover:bg-neutral-700"}`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => fetchReceipts(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="p-2 bg-neutral-800 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============== RECEIPT DETAIL MODAL ============== */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowDetailModal(false)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden max-h-[90vh] overflow-y-auto">
            {isLoadingDetail ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
              </div>
            ) : receiptDetail ? (
              <>
                <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 p-5 flex items-center justify-between z-10">
                  <div>
                    <h3 className="text-white font-semibold text-lg">
                      Receipt Details
                    </h3>
                    <p className="text-sm text-luxury-gold font-mono">
                      {receiptDetail.receipt.receiptNumber}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="p-1 hover:bg-neutral-800 rounded"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Status + Amount */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-3 py-1.5 text-sm rounded-full border ${getStatusColor(receiptDetail.receipt.status)}`}
                    >
                      {receiptDetail.receipt.statusLabel}
                    </span>
                    <p className="text-2xl font-bold text-luxury-gold">
                      SAR {fmtSAR(receiptDetail.receipt.amount)}
                    </p>
                  </div>

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-4 bg-neutral-800/50 rounded-lg p-4">
                    <div>
                      <p className="text-xs text-gray-500">Period</p>
                      <p className="text-white font-medium">
                        {receiptDetail.receipt.month}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Bookings</p>
                      <p className="text-white font-medium">
                        {receiptDetail.receipt.tripCount} rides
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Due Date</p>
                      <p
                        className={`font-medium ${receiptDetail.receipt.isOverdue ? "text-red-400" : "text-white"}`}
                      >
                        {receiptDetail.receipt.dueDate
                          ? new Date(
                              receiptDetail.receipt.dueDate,
                            ).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Paid Date</p>
                      <p className="text-white font-medium">
                        {receiptDetail.receipt.paidAt
                          ? new Date(
                              receiptDetail.receipt.paidAt,
                            ).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Bank details — useful context for the vendor when
                      preparing the bank transfer the proof refers to. */}
                  {(receiptDetail.vendor.bankName !== "—" ||
                    receiptDetail.vendor.iban !== "—") && (
                    <div className="p-3 bg-neutral-800/50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">
                        Bank Details on File
                      </p>
                      <p className="text-sm text-white">
                        {receiptDetail.vendor.bankName} ·{" "}
                        {receiptDetail.vendor.iban}
                      </p>
                    </div>
                  )}

                  {/* Bank receipt — clickable; opens DocumentViewer
                      with the admin-uploaded transfer receipt. Under
                      new direction this is admin's proof to vendor
                      that the payout was sent, replacing the old
                      "vendor uploaded their own proof" flow. */}
                  {receiptDetail.receipt.paymentProofUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setViewerUrl(receiptDetail.receipt.paymentProofUrl);
                        setViewerFileName(
                          receiptDetail.receipt.paymentProofFileName ||
                            undefined,
                        );
                        setViewerTitle("Bank Receipt from Admin");
                      }}
                      className="w-full p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex items-center gap-3 hover:bg-blue-500/10 hover:border-blue-500/40 transition-colors text-left"
                    >
                      <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">
                          Bank Receipt from Admin
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {receiptDetail.receipt.paymentProofFileName} · Click
                          to view
                        </p>
                      </div>
                      <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    </button>
                  )}

                  {/* Booking breakdown */}
                  {receiptDetail.bookings &&
                    receiptDetail.bookings.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-400 mb-3">
                          Booking Breakdown
                        </h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {receiptDetail.bookings.map((b) => (
                            <div
                              key={b.id}
                              className="flex items-center justify-between py-2 px-3 bg-neutral-800/50 rounded-lg"
                            >
                              <div className="min-w-0">
                                <p className="text-sm text-white">
                                  {b.bookingRef}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {b.guestName} ·{" "}
                                  {new Date(b.tripDate).toLocaleDateString()}
                                </p>
                              </div>
                              <p className="text-sm text-white font-medium whitespace-nowrap pl-3">
                                SAR {fmtSAR(b.totalPrice)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>

                {/* Actions */}
                <div className="border-t border-neutral-800 p-5 flex gap-3">
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="flex-1 px-4 py-3 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => handleDownloadPdf(receiptDetail.receipt.id)}
                    className="flex-1 px-4 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ============== DOCUMENT VIEWER ============== */}
      {viewerUrl && (
        <DocumentViewer
          url={viewerUrl}
          fileName={viewerFileName}
          title={viewerTitle}
          onClose={() => {
            setViewerUrl(null);
            setViewerFileName(undefined);
            setViewerTitle(undefined);
          }}
        />
      )}
    </div>
  );
}
