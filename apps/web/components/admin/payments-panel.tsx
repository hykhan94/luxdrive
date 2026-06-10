"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { adminApi, uploadApi, ApiError } from "@/lib/api";
import DocumentViewer from "@/components/ui/document-viewer";
import {
  CreditCard,
  Send,
  Wallet,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Truck,
  Briefcase,
  CheckCircle2,
  Bell,
  Eye,
  Upload,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";

interface OnlinePayment {
  id: string;
  transactionId: string;
  bookingRef: string | null;
  customer: { name: string; email: string };
  amount: number;
  currency: string;
  methodDisplay: string;
  responseDisplay: string;
  response: string;
  status: string;
  createdAt: string;
}

// Vendor payouts under the new payment direction. The backend renamed
// VendorReceipt → VendorPayout but kept this endpoint's response keys
// compatible (so we can ship UI without churn). The status enum
// collapsed: REVIEWED step is gone — admin pays and uploads receipt
// in a single action.
//
// Field semantics under new direction:
//   - status: PENDING | PAID (was NEW | REVIEWED | PAID)
//   - paymentProofUrl: now ADMIN-UPLOADED RECEIPT (signed URL), set
//     once admin marks paid. Was vendor's uploaded proof. Same field
//     name preserved for compat.
//   - paymentProofFileName: same.
interface VendorPayout {
  id: string;
  receiptNumber: string;
  vendor: { id: string; companyName: string };
  tripCount: number;
  amount: number;
  bankDetails: { bankName: string | null; iban: string | null };
  status: "PENDING" | "PAID";
  isNew: boolean;
  isPaid: boolean;
  paidAt: string | null;
  createdAt: string;
  lifecycle?: { code: string; label: string };
  paymentProofUrl?: string | null;
  paymentProofFileName?: string | null;
}

interface PartnerInvoice {
  id: string;
  invoiceNumber: string;
  partner: { id: string; companyName: string; crNumber: string | null };
  bookingCount: number;
  amount: number;
  dueDate: string;
  status: "PENDING" | "OVERDUE" | "PROOF_UPLOADED" | "PAID";
  isOverdue: boolean;
  isPaid: boolean;
  needsConfirmation: boolean;
  paidAt: string | null;
  createdAt: string;
  // Stage 7: backend now inlines the signed proof URL on the list
  // response so the View Proof button can open the viewer directly
  // (no second fetch needed). Null when no proof has been uploaded.
  paymentProofUrl?: string | null;
  paymentProofFileName?: string | null;
  paymentProofUploadedAt?: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const defaultPagination: Pagination = {
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 0,
};

export default function PaymentsPanel({
  onBadgeUpdate,
}: {
  onBadgeUpdate?: () => void;
}) {
  const { showNotification } = useNotification();
  const [paymentTab, setPaymentTab] = useState<"online" | "vendor" | "partner">(
    "online",
  );
  const [isLoading, setIsLoading] = useState(true);

  // Summary — backend response under new direction collapses to four
  // fields. The fine-grained breakdowns (overdue / dueSoon /
  // awaitingConfirmation) that the old direction's summary exposed
  // aren't in the response anymore; the in-table status filter pills
  // cover that navigation instead.
  const [summary, setSummary] = useState({
    onlineReceived: 0,
    // Money admin owes vendors (sum of PENDING vendor payouts) — what
    // backend now calls "Payments to Send".
    paymentsToSendAmount: 0,
    paymentsToSendBadge: 0,
    // Money admin is owed by partners (sum of PENDING/OVERDUE invoices)
    // — what backend now calls "Payments to Receive".
    paymentsToReceiveAmount: 0,
    paymentsToReceiveBadge: 0,
  });

  // Online payments
  const [onlinePayments, setOnlinePayments] = useState<OnlinePayment[]>([]);
  const [onlinePagination, setOnlinePagination] =
    useState<Pagination>(defaultPagination);
  const [onlineSearch, setOnlineSearch] = useState("");

  // Vendor payouts
  const [vendorPayouts, setVendorPayouts] = useState<VendorPayout[]>([]);
  const [vendorPagination, setVendorPagination] =
    useState<Pagination>(defaultPagination);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorPendingCount, setVendorPendingCount] = useState(0);

  // Partner invoices
  const [partnerInvoices, setPartnerInvoices] = useState<PartnerInvoice[]>([]);
  const [partnerPagination, setPartnerPagination] =
    useState<Pagination>(defaultPagination);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [partnerStatusFilter, setPartnerStatusFilter] = useState<string>("all");

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // DocumentViewer — used to show admin-uploaded receipts (vendor side,
  // when PAID) and partner-uploaded payment proofs (partner side, when
  // PROOF_UPLOADED). Single viewer state shared across both flows.
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string | undefined>(
    undefined,
  );
  const [viewerTitle, setViewerTitle] = useState<string | undefined>(undefined);

  // Mark-paid + receipt upload modal — Stage 3B replaces the old single-
  // click "Mark Paid" action with a combined action that requires admin
  // to upload the bank-transfer receipt at the same time. The receipt
  // becomes visible to the vendor for transparency.
  const [markPaidPayout, setMarkPaidPayout] = useState<VendorPayout | null>(
    null,
  );
  const [markPaidFile, setMarkPaidFile] = useState<File | null>(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Open vendor-side receipt viewer (admin's uploaded transfer receipt
  // on a PAID payout). The list response already includes a signed URL,
  // so this is a simple open.
  const openVendorReceiptViewer = (payout: VendorPayout) => {
    if (!payout.paymentProofUrl) return;
    setViewerUrl(payout.paymentProofUrl);
    setViewerFileName(payout.paymentProofFileName || undefined);
    setViewerTitle(
      `Bank Receipt — ${payout.vendor.companyName} (${payout.receiptNumber})`,
    );
  };

  // Open partner-side proof viewer. Stage 7: backend now inlines the
  // signed proof URL on the list response, so we can open the viewer
  // directly in one click when the URL is present. The fallback (fetch
  // details → sign → open) is preserved for the deploy-overlap window
  // where the frontend may briefly run against an older backend.
  const openPartnerProofViewer = async (invoice: PartnerInvoice) => {
    // Fast path — backend inlined the signed URL.
    if (invoice.paymentProofUrl) {
      setViewerUrl(invoice.paymentProofUrl);
      setViewerFileName(invoice.paymentProofFileName || undefined);
      setViewerTitle(
        `Payment Proof — ${invoice.partner.companyName} (${invoice.invoiceNumber})`,
      );
      return;
    }
    // Legacy fallback — older backend that doesn't return inlined URL.
    setActionLoading(invoice.id);
    try {
      const detailRes = await adminApi.getPartnerInvoiceDetails(invoice.id);
      const raw: any = detailRes?.data;
      if (!raw?.paymentProofUrl) {
        showNotification(
          "info",
          "No payment proof on file for this invoice yet",
        );
        return;
      }
      const signed = await uploadApi.getSignedReadUrl({
        filePath: raw.paymentProofUrl,
      });
      if (!signed.success || !signed.data) {
        throw new Error("Failed to load proof URL");
      }
      setViewerUrl(signed.data.readUrl ?? signed.data.url ?? null);
      setViewerFileName(raw.paymentProofFileName || undefined);
      setViewerTitle(
        `Payment Proof — ${invoice.partner.companyName} (${invoice.invoiceNumber})`,
      );
    } catch (err: any) {
      const msg =
        err instanceof ApiError ? err.message : err?.message || "Failed";
      showNotification("error", msg);
    } finally {
      setActionLoading(null);
    }
  };

  // Fetch summary — reads the new flipped response shape (labels
  // already correct from backend; we just bind values).
  const fetchSummary = useCallback(async () => {
    try {
      const res = await adminApi.getPaymentSummary();
      if (res.success && res.data) {
        const vendorBucket = res.data.toReceiveFromVendors || {};
        const partnerBucket = res.data.toReceiveFromPartners || {};
        const notifications = res.data.notifications || {};
        setSummary({
          onlineReceived: Number(res.data.onlineReceived?.amount || 0),
          paymentsToSendAmount: Number(vendorBucket.amount || 0),
          paymentsToSendBadge:
            notifications.paymentsToSend ??
            vendorBucket.badgeTotal ??
            vendorBucket.newReceipts ??
            0,
          paymentsToReceiveAmount: Number(partnerBucket.amount || 0),
          paymentsToReceiveBadge: notifications.paymentsToReceive ?? 0,
        });
      }
    } catch {
      /* silent */
    }
  }, []);

  // Fetch online payments
  const fetchOnlinePayments = useCallback(
    async (page = 1, search = "") => {
      setIsLoading(true);
      try {
        const params: Record<string, any> = { page, limit: 10 };
        if (search) params.search = search;
        const res = await adminApi.getOnlinePayments(params);
        if (res.success && res.data) {
          setOnlinePayments(res.data.payments || []);
          setOnlinePagination(res.data.pagination || defaultPagination);
        }
      } catch (err: any) {
        showNotification(
          "error",
          err.message || "Failed to load online payments",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [showNotification],
  );

  // Fetch vendor payouts. Backend route path kept as `vendor-receipts`
  // for backward compat; helper name in api.ts mirrors that. New
  // direction semantic — these are payouts admin OWES to vendors.
  const fetchVendorPayouts = useCallback(
    async (page = 1, search = "") => {
      setIsLoading(true);
      try {
        const params: Record<string, any> = { page, limit: 10 };
        if (search) params.search = search;
        const res = await adminApi.getVendorReceipts(params);
        if (res.success && res.data) {
          setVendorPayouts(res.data.receipts || []);
          setVendorPagination(res.data.pagination || defaultPagination);
          setVendorPendingCount(
            res.data.newCount ?? res.data.pendingCount ?? 0,
          );
        }
      } catch (err: any) {
        showNotification(
          "error",
          err.message || "Failed to load vendor payouts",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [showNotification],
  );

  // Fetch partner invoices
  const fetchPartnerInvoices = useCallback(
    async (page = 1, search = "", status = "all") => {
      setIsLoading(true);
      try {
        const params: Record<string, any> = { page, limit: 10 };
        if (search) params.search = search;
        if (status && status !== "all") params.status = status;
        const res = await adminApi.getPartnerInvoices(params);
        if (res.success && res.data) {
          setPartnerInvoices(res.data.invoices || []);
          setPartnerPagination(res.data.pagination || defaultPagination);
        }
      } catch (err: any) {
        showNotification(
          "error",
          err.message || "Failed to load partner invoices",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [showNotification],
  );

  // Initial load
  useEffect(() => {
    fetchSummary();
    fetchOnlinePayments(1);
  }, [fetchSummary, fetchOnlinePayments]);

  // Load tab data when switching
  useEffect(() => {
    if (paymentTab === "online") fetchOnlinePayments(1, onlineSearch);
    else if (paymentTab === "vendor") fetchVendorPayouts(1, vendorSearch);
    else fetchPartnerInvoices(1, partnerSearch, partnerStatusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentTab]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (paymentTab === "online") fetchOnlinePayments(1, onlineSearch);
      else if (paymentTab === "vendor") fetchVendorPayouts(1, vendorSearch);
      else fetchPartnerInvoices(1, partnerSearch, partnerStatusFilter);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineSearch, vendorSearch, partnerSearch, partnerStatusFilter]);

  // ============== VENDOR PAYOUT: MARK PAID + UPLOAD RECEIPT ==============
  //
  // Single combined action under new direction. Admin clicks "Mark Paid"
  // → modal opens → admin selects bank receipt file → submit triggers:
  //   1. Get signed upload URL from uploadApi.
  //   2. PUT the file to GCS.
  //   3. Call adminApi.markVendorReceiptPaid with the GCS path + filename.
  // Backend transitions the payout to PAID, denormalizes receipt URL,
  // and notifies vendor (VENDOR_PAYOUT_PAID notification).
  const openMarkPaidModal = (payout: VendorPayout) => {
    setMarkPaidPayout(payout);
    setMarkPaidFile(null);
  };

  const closeMarkPaidModal = () => {
    setMarkPaidPayout(null);
    setMarkPaidFile(null);
  };

  const submitMarkPaid = async () => {
    if (!markPaidPayout || !markPaidFile) return;
    setIsMarkingPaid(true);
    try {
      // 1. Get signed upload URL.
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: markPaidFile.name,
        fileType: markPaidFile.type,
        section: "payments",
        folder: "vendor-payouts",
        entityId: markPaidPayout.id,
      });
      if (!signedRes.success || !signedRes.data)
        throw new Error("Failed to get upload URL");

      // 2. PUT file to GCS.
      const uploadRes = await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": markPaidFile.type },
        body: markPaidFile,
      });
      if (!uploadRes.ok) throw new Error("Receipt upload failed");

      // 3. Mark payout PAID with the uploaded receipt reference.
      const res = await adminApi.markVendorReceiptPaid(markPaidPayout.id, {
        receiptUrl: signedRes.data.filePath,
        receiptFileName: markPaidFile.name,
      });
      if (res.success) {
        showNotification(
          "success",
          res.message || "Payout marked as paid; vendor notified",
        );
        closeMarkPaidModal();
        fetchVendorPayouts(vendorPagination.page, vendorSearch);
        fetchSummary();
        onBadgeUpdate?.();
      }
    } catch (err: any) {
      const msg =
        err instanceof ApiError ? err.message : err?.message || "Failed";
      showNotification("error", msg);
    } finally {
      setIsMarkingPaid(false);
    }
  };

  // ============== PARTNER INVOICE ACTIONS ==============

  const handleSendReminder = async (id: string, partnerName: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.sendPartnerReminder(id);
      if (res.success) {
        showNotification(
          "success",
          res.message || `Reminder sent to ${partnerName}`,
        );
        fetchPartnerInvoices(
          partnerPagination.page,
          partnerSearch,
          partnerStatusFilter,
        );
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmPayment = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.confirmPartnerPayment(id);
      if (res.success) {
        showNotification("success", "Payment confirmed; partner notified");
        fetchPartnerInvoices(
          partnerPagination.page,
          partnerSearch,
          partnerStatusFilter,
        );
        fetchSummary();
        onBadgeUpdate?.();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Admin manually flips PENDING/OVERDUE → PROOF_UPLOADED when they see
  // proof out-of-band (bank statement, email screenshot). The follow-up
  // confirmPartnerPayment then transitions to PAID. Kept for the
  // out-of-band path; in-app uploads from the partner portal will
  // skip this step.
  const handleMarkReceived = async (id: string, partnerName: string) => {
    setActionLoading(id);
    try {
      const res = await adminApi.markPartnerPaymentReceived(id);
      if (res.success) {
        showNotification(
          "success",
          `Payment from ${partnerName} marked as received. Click "Confirm" to finalize.`,
        );
        fetchPartnerInvoices(
          partnerPagination.page,
          partnerSearch,
          partnerStatusFilter,
        );
        fetchSummary();
        onBadgeUpdate?.();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Pagination helper
  const renderPagination = (
    pagination: Pagination,
    onPage: (p: number) => void,
  ) => {
    if (pagination.total === 0) return null;
    return (
      <div className="px-4 sm:px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {(pagination.page - 1) * pagination.limit + 1}–
          {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
          {pagination.total}
        </p>
        {pagination.totalPages > 1 && (
          <div className="flex gap-2">
            <button
              onClick={() => onPage(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  // ============== STATUS PILL HELPERS ==============
  // Pulled inline-helper logic out of the JSX so the per-row render
  // stays readable.

  const vendorPayoutPill = useMemo(
    () => (payout: VendorPayout) => {
      const code =
        payout.lifecycle?.code || (payout.isPaid ? "PAID" : "PENDING");
      const label =
        payout.lifecycle?.label || (code === "PAID" ? "Paid" : "Pending");
      const cls =
        code === "PAID"
          ? "bg-green-500/10 text-green-400 border-green-500/30"
          : code === "OVERDUE"
            ? "bg-red-500/20 text-red-400 border-red-500/30"
            : "bg-amber-500/20 text-amber-400 border-amber-500/30";
      return { label, cls };
    },
    [],
  );

  const partnerInvoicePill = useMemo(
    () => (inv: PartnerInvoice) => {
      if (inv.status === "PAID") {
        return {
          label: "Paid",
          cls: "bg-green-500/10 text-green-400 border-green-500/30",
        };
      }
      if (inv.status === "PROOF_UPLOADED") {
        return {
          label: "Proof Uploaded",
          cls: "bg-purple-500/10 text-purple-400 border-purple-500/30",
        };
      }
      if (inv.status === "OVERDUE") {
        return {
          label: "Overdue",
          cls: "bg-red-500/10 text-red-400 border-red-500/30",
        };
      }
      return {
        label: "Pending",
        cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      };
    },
    [],
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards. Labels now reflect the flipped direction.
          Vendor tile is money OUT (admin pays vendor). Partner tile
          is money IN (admin gets paid by partner). Both backed by the
          backend's `label` strings as fallback. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-neutral-900 border border-green-500/30 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-sm text-gray-400">Online Received</span>
          </div>
          <p className="text-2xl font-bold text-green-400">
            SAR {summary.onlineReceived.toLocaleString()}
          </p>
        </div>
        <div className="bg-neutral-900 border border-orange-500/30 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-orange-400" />
            </div>
            <span className="text-sm text-gray-400">Payments to Send</span>
          </div>
          <p className="text-2xl font-bold text-orange-400">
            SAR {summary.paymentsToSendAmount.toLocaleString()}
          </p>
          {summary.paymentsToSendBadge > 0 && (
            <p className="text-xs text-orange-300 mt-1">
              {summary.paymentsToSendBadge} payout(s) pending
            </p>
          )}
        </div>
        <div className="bg-neutral-900 border border-blue-500/30 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-sm text-gray-400">Payments to Receive</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">
            SAR {summary.paymentsToReceiveAmount.toLocaleString()}
          </p>
          {summary.paymentsToReceiveBadge > 0 && (
            <p className="text-xs text-blue-300 mt-1">
              {summary.paymentsToReceiveBadge} awaiting confirmation
            </p>
          )}
        </div>
      </div>

      {/* Tab Navigation — labels match the new payment direction. The
          vendor tab moves money OUT ("Payments to Send"); the partner
          tab moves money IN ("Payments to Receive"). Badge counts come
          from the backend's `notifications` block. */}
      <div className="flex gap-2 border-b border-neutral-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setPaymentTab("online")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${paymentTab === "online" ? "bg-green-500/20 text-green-400 border-b-2 border-green-400" : "text-gray-400 hover:text-white"}`}
        >
          Online Payments
        </button>
        <button
          onClick={() => setPaymentTab("vendor")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${paymentTab === "vendor" ? "bg-orange-500/20 text-orange-400 border-b-2 border-orange-400" : "text-gray-400 hover:text-white"}`}
        >
          Payments to Send
          {summary.paymentsToSendBadge > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {summary.paymentsToSendBadge}
            </span>
          )}
        </button>
        <button
          onClick={() => setPaymentTab("partner")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 whitespace-nowrap ${paymentTab === "partner" ? "bg-blue-500/20 text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"}`}
        >
          Payments to Receive
          {summary.paymentsToReceiveBadge > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {summary.paymentsToReceiveBadge}
            </span>
          )}
        </button>
      </div>

      {/* ============== ONLINE PAYMENTS TAB ============== */}
      {paymentTab === "online" && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-white font-semibold">
                Online Payments (PayTabs)
              </h3>
              <p className="text-sm text-gray-500 hidden sm:block">
                User payments received via PayTabs gateway
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={onlineSearch}
                onChange={(e) => setOnlineSearch(e.target.value)}
                placeholder="Search..."
                className="pl-9 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm w-40 sm:w-48 focus:outline-none focus:border-green-500/50"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
            </div>
          ) : onlinePayments.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No payments found
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-neutral-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Transaction
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Booking
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Method
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {onlinePayments.map((p) => (
                      <tr key={p.id} className="hover:bg-neutral-800/30">
                        <td className="px-4 py-3 text-white text-sm font-mono">
                          {p.transactionId}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-white text-sm">
                            {p.customer.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {p.customer.email}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-sm">
                          {p.bookingRef || "—"}
                        </td>
                        <td className="px-4 py-3 text-green-400 font-medium">
                          SAR {Number(p.amount).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-sm">
                          {p.methodDisplay}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs rounded-full border bg-green-500/10 text-green-400 border-green-500/30">
                            {p.responseDisplay}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300 text-sm">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="sm:hidden space-y-3 p-4">
                {onlinePayments.map((p) => (
                  <div
                    key={p.id}
                    className="bg-neutral-800 rounded-xl p-4 border border-neutral-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white text-sm font-mono">
                        {p.transactionId}
                      </span>
                      <span className="text-green-400 font-semibold">
                        SAR {Number(p.amount).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-white text-sm">{p.customer.name}</p>
                    <p className="text-xs text-gray-500">{p.methodDisplay}</p>
                    <div className="mt-2 pt-2 border-t border-neutral-700 flex items-center justify-between">
                      <span className="text-xs text-gray-400">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                      <span className="px-2 py-1 text-xs rounded-full border bg-green-500/10 text-green-400 border-green-500/30">
                        {p.responseDisplay}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {renderPagination(onlinePagination, (p) =>
            fetchOnlinePayments(p, onlineSearch),
          )}
        </div>
      )}

      {/* ============== VENDOR PAYOUTS TAB (Payments to Send) ============== */}
      {paymentTab === "vendor" && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div>
                <h3 className="text-white font-semibold">Vendor Payouts</h3>
                <p className="text-sm text-gray-500 hidden sm:block">
                  Payouts admin owes vendors
                </p>
              </div>
              {vendorPendingCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30">
                  {vendorPendingCount} pending
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                placeholder="Search..."
                className="pl-9 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm w-40 focus:outline-none focus:border-orange-500/50"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
            </div>
          ) : vendorPayouts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No payouts found
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-neutral-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Vendor
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Payout
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Bank
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {vendorPayouts.map((r) => {
                      const pill = vendorPayoutPill(r);
                      return (
                        <tr
                          key={r.id}
                          className={`hover:bg-neutral-800/30 ${r.isNew ? "bg-orange-500/5" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center ${r.isNew ? "bg-orange-500/20" : "bg-neutral-800"}`}
                              >
                                <Truck
                                  className={`w-5 h-5 ${r.isNew ? "text-orange-400" : "text-gray-400"}`}
                                />
                              </div>
                              <div>
                                <p className="text-white text-sm">
                                  {r.vendor.companyName}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {r.tripCount} trips
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-white text-sm font-mono">
                              {r.receiptNumber}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(r.createdAt).toLocaleDateString()}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-orange-400 font-medium">
                            SAR {Number(r.amount).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-white text-sm">
                              {r.bankDetails.bankName || "—"}
                            </p>
                            <p className="text-xs text-gray-500 font-mono">
                              {r.bankDetails.iban || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 text-xs rounded-full border whitespace-nowrap ${pill.cls}`}
                            >
                              {pill.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {r.isPaid ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">
                                  Paid{" "}
                                  {r.paidAt
                                    ? new Date(r.paidAt).toLocaleDateString()
                                    : ""}
                                </span>
                                {r.paymentProofUrl && (
                                  <button
                                    onClick={() => openVendorReceiptViewer(r)}
                                    className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded hover:bg-blue-500/30 flex items-center gap-1"
                                  >
                                    <Eye className="w-3 h-3" />
                                    View Receipt
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => openMarkPaidModal(r)}
                                className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded hover:bg-green-500/30 flex items-center gap-1"
                              >
                                <Upload className="w-3 h-3" />
                                Mark Paid + Upload Receipt
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="sm:hidden space-y-3 p-4">
                {vendorPayouts.map((r) => {
                  const pill = vendorPayoutPill(r);
                  const code =
                    r.lifecycle?.code || (r.isPaid ? "PAID" : "PENDING");
                  const cardCls =
                    code === "OVERDUE"
                      ? "bg-red-500/5 border-red-500/30"
                      : code === "PENDING"
                        ? "bg-amber-500/5 border-amber-500/30"
                        : "bg-neutral-800 border-neutral-700";
                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl p-4 border ${cardCls}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`px-2 py-1 text-xs rounded-full border ${pill.cls}`}
                        >
                          {pill.label}
                        </span>
                        <span className="text-orange-400 font-semibold">
                          SAR {Number(r.amount).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-white text-sm font-medium">
                        {r.vendor.companyName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.tripCount} trips • {r.receiptNumber}
                      </p>
                      <div className="mt-3 pt-3 border-t border-neutral-700 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-500 truncate">
                            {r.bankDetails.bankName || "—"}
                          </p>
                        </div>
                        {r.isPaid ? (
                          r.paymentProofUrl && (
                            <button
                              onClick={() => openVendorReceiptViewer(r)}
                              className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" />
                              Receipt
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => openMarkPaidModal(r)}
                            className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded flex items-center gap-1"
                          >
                            <Upload className="w-3 h-3" />
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {renderPagination(vendorPagination, (p) =>
            fetchVendorPayouts(p, vendorSearch),
          )}
        </div>
      )}

      {/* ============== PARTNER INVOICES TAB (Payments to Receive) ============== */}
      {paymentTab === "partner" && (
        <div className="space-y-4">
          {/* Notification banner — single count line. The old direction's
              breakdown (overdue / dueSoon / awaitingConfirmation) isn't
              available in the new backend response shape. The Status
              Filter Pills below cover that navigation pattern instead. */}
          {summary.paymentsToReceiveBadge > 0 && (
            <div className="flex flex-wrap items-center gap-3 p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
              <Bell className="w-5 h-5 text-purple-400 flex-shrink-0" />
              <p className="text-sm text-gray-300">
                {summary.paymentsToReceiveBadge} invoice
                {summary.paymentsToReceiveBadge === 1 ? "" : "s"} awaiting your
                confirmation
              </p>
              <button
                onClick={() => setPartnerStatusFilter("PROOF_UPLOADED")}
                className="ml-auto px-3 py-1.5 text-xs bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-lg hover:bg-purple-500/20"
              >
                Show
              </button>
            </div>
          )}

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-neutral-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold">Partner Invoices</h3>
                  <p className="text-sm text-gray-500 hidden sm:block">
                    Payments to receive from partners
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={partnerSearch}
                    onChange={(e) => setPartnerSearch(e.target.value)}
                    placeholder="Search..."
                    className="pl-9 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm w-40 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>
              {/* Status filter pills — updated for new direction. Added
                  PROOF_UPLOADED state so admin can jump to invoices
                  waiting their confirmation. */}
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all", label: "All" },
                  { key: "OVERDUE", label: "Overdue" },
                  { key: "PENDING", label: "Pending" },
                  { key: "PROOF_UPLOADED", label: "Proof Uploaded" },
                  { key: "PAID", label: "Paid" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setPartnerStatusFilter(f.key)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      partnerStatusFilter === f.key
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-neutral-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
              </div>
            ) : partnerInvoices.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No invoices found
              </div>
            ) : (
              <>
                {/* Desktop */}
                <div className="overflow-x-auto hidden sm:block">
                  <table className="w-full min-w-[700px]">
                    <thead className="bg-neutral-800/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Partner
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Invoice
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Due Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {partnerInvoices.map((inv) => {
                        const pill = partnerInvoicePill(inv);
                        return (
                          <tr key={inv.id} className="hover:bg-neutral-800/30">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                  <Briefcase className="w-5 h-5 text-blue-400" />
                                </div>
                                <div>
                                  <p className="text-white text-sm">
                                    {inv.partner.companyName}
                                  </p>
                                  {inv.partner.crNumber && (
                                    <p className="text-xs text-gray-500">
                                      CR: {inv.partner.crNumber}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-white text-sm font-mono">
                                {inv.invoiceNumber}
                              </p>
                              <p className="text-xs text-gray-500">
                                {inv.bookingCount} bookings
                              </p>
                            </td>
                            <td className="px-4 py-3 text-blue-400 font-medium">
                              SAR {Number(inv.amount).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-gray-300 text-sm">
                              {new Date(inv.dueDate).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 text-xs rounded-full border ${pill.cls}`}
                              >
                                {pill.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {/* PROOF_UPLOADED → View Proof + Confirm.
                                  Partner uploaded proof; admin verifies
                                  and either confirms or contacts partner. */}
                              {inv.needsConfirmation ? (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openPartnerProofViewer(inv)}
                                    disabled={actionLoading === inv.id}
                                    className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded hover:bg-blue-500/30 disabled:opacity-50 flex items-center gap-1"
                                  >
                                    {actionLoading === inv.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Eye className="w-3 h-3" />
                                    )}
                                    View Proof
                                  </button>
                                  <button
                                    onClick={() => handleConfirmPayment(inv.id)}
                                    disabled={actionLoading === inv.id}
                                    className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded hover:bg-purple-500/30 disabled:opacity-50 flex items-center gap-1"
                                  >
                                    {actionLoading === inv.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-3 h-3" />
                                    )}
                                    Confirm
                                  </button>
                                </div>
                              ) : !inv.isPaid ? (
                                /* PENDING/OVERDUE → admin can manually mark
                                   received (out-of-band proof) or send a
                                   reminder. */
                                <div className="flex gap-2">
                                  <button
                                    onClick={() =>
                                      handleMarkReceived(
                                        inv.id,
                                        inv.partner.companyName,
                                      )
                                    }
                                    disabled={actionLoading === inv.id}
                                    className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded hover:bg-green-500/30 disabled:opacity-50"
                                  >
                                    {actionLoading === inv.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      "Mark Received"
                                    )}
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleSendReminder(
                                        inv.id,
                                        inv.partner.companyName,
                                      )
                                    }
                                    disabled={actionLoading === inv.id}
                                    className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded hover:bg-blue-500/30 disabled:opacity-50"
                                  >
                                    Remind
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500">
                                  Paid{" "}
                                  {inv.paidAt
                                    ? new Date(inv.paidAt).toLocaleDateString()
                                    : ""}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobile */}
                <div className="sm:hidden space-y-3 p-4">
                  {partnerInvoices.map((inv) => {
                    const pill = partnerInvoicePill(inv);
                    return (
                      <div
                        key={inv.id}
                        className="bg-neutral-800 rounded-xl p-4 border border-neutral-700"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`px-2 py-1 text-xs rounded-full border ${pill.cls}`}
                          >
                            {pill.label}
                          </span>
                          <span className="text-blue-400 font-semibold">
                            SAR {Number(inv.amount).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-white text-sm font-medium">
                          {inv.partner.companyName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {inv.invoiceNumber} • {inv.bookingCount} bookings
                        </p>
                        <div className="mt-3 pt-3 border-t border-neutral-700 flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs text-gray-400">
                            Due: {new Date(inv.dueDate).toLocaleDateString()}
                          </span>
                          {inv.needsConfirmation ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => openPartnerProofViewer(inv)}
                                className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                Proof
                              </button>
                              <button
                                onClick={() => handleConfirmPayment(inv.id)}
                                className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded"
                              >
                                Confirm
                              </button>
                            </div>
                          ) : !inv.isPaid ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  handleMarkReceived(
                                    inv.id,
                                    inv.partner.companyName,
                                  )
                                }
                                className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded"
                              >
                                Received
                              </button>
                              <button
                                onClick={() =>
                                  handleSendReminder(
                                    inv.id,
                                    inv.partner.companyName,
                                  )
                                }
                                className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded"
                              >
                                Remind
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {renderPagination(partnerPagination, (p) =>
              fetchPartnerInvoices(p, partnerSearch, partnerStatusFilter),
            )}
          </div>
        </div>
      )}

      {/* ============== MARK PAID + UPLOAD RECEIPT MODAL ==============
          Vendor-side combined action under new direction. Admin uploads
          the bank transfer receipt (image or PDF) at the same time as
          marking the payout as paid. Receipt becomes visible to vendor
          for transparency. */}
      {markPaidPayout && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isMarkingPaid && closeMarkPaidModal()}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="p-5 border-b border-neutral-800 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Mark Paid + Upload Receipt
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {markPaidPayout.vendor.companyName} —{" "}
                  {markPaidPayout.receiptNumber}
                </p>
              </div>
              <button
                onClick={closeMarkPaidModal}
                disabled={isMarkingPaid}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-neutral-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="text-orange-400 font-semibold">
                    SAR {Number(markPaidPayout.amount).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Trips</span>
                  <span className="text-white">{markPaidPayout.tripCount}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Bank Transfer Receipt *
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setMarkPaidFile(e.target.files?.[0] || null)}
                  disabled={isMarkingPaid}
                  className="w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-luxury-gold/20 file:text-luxury-gold hover:file:bg-luxury-gold/30 file:cursor-pointer disabled:opacity-50"
                />
                {markPaidFile && (
                  <p className="text-xs text-gray-400 mt-2 truncate">
                    Selected: {markPaidFile.name} (
                    {(markPaidFile.size / 1024).toFixed(0)} KB)
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  PDF or image of the bank transfer receipt. Vendor will see
                  this for transparency.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={closeMarkPaidModal}
                disabled={isMarkingPaid}
                className="px-4 py-2 text-gray-400 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitMarkPaid}
                disabled={!markPaidFile || isMarkingPaid}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                {isMarkingPaid ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Mark Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DocumentViewer — overlay used by both vendor receipt view and
          partner proof view. Single instance at root so it overlays
          everything else. */}
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
