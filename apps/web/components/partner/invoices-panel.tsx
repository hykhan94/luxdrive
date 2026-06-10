"use client";

// ============================================
// components/partner/invoices/invoices-panel.tsx
// Partner Portal — Invoices (Monthly + Custom)
// ============================================

import { useState, useEffect, useCallback } from "react";
import { partnerApi, uploadApi, ApiError } from "@/lib/api";
import { useNotification } from "@/lib/notification-context";
import {
  Eye,
  Download,
  FileText,
  Loader2,
  X,
  Calendar,
  Plus,
  Sparkles,
  ShieldAlert,
  Upload,
  CheckCircle2,
} from "lucide-react";
import Logo from "@/components/shared/logo";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { FileText as FileTextEmpty } from "lucide-react";

// ============== TYPES ==============

interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  month?: string;
  dateRangeLabel?: string;
  periodStart: string;
  periodEnd: string;
  bookingCount: number;
  amount: number;
  dueDate: string;
  status: string;
  statusLabel: string;
  isPaymentReceived: boolean;
  isNew?: boolean;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface InvoiceDetail {
  invoice: {
    id: string;
    invoiceNumber: string;
    isCustom: boolean;
    dateRangeLabel: string | null;
    month: string;
    periodStart: string;
    periodEnd: string;
    bookingCount: number;
    amount: number;
    dueDate: string;
    status: string;
    statusLabel: string;
    isPaymentReceived: boolean;
    paymentReceivedAt: string | null;
    isConfirmed: boolean;
    confirmedAt: string | null;
    createdAt: string;
  };
  partner: {
    companyName: string;
    crNumber: string;
    vatNumber: string;
    address: string;
    contactPerson: string;
    contactPhone: string;
  };
  bookings: Array<{
    id: string;
    bookingRef: string;
    guestName: string;
    route: string;
    tripDate: string;
    tripTime: string;
    vehicleClass: string;
    basePrice: number;
    vatAmount: number;
    totalPrice: number;
  }>;
  totals: { subTotal: number; vatAmount: number; grandTotal: number };
  customInvoicedInfo: {
    count: number;
    totalAmount: number;
    message: string;
    invoices: Array<{ invoiceNumber: string }>;
  } | null;
}

// ============== HELPERS ==============

const PAGINATION_OPTIONS = [5, 10, 15, 20];

function getStatusColor(status: string) {
  switch (status.toUpperCase()) {
    case "PAID":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "PENDING":
      return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
    case "OVERDUE":
      return "bg-red-500/10 text-red-400 border-red-500/30";
    // Stage 3B-2: PROOF_UPLOADED is the intermediate state after partner
    // uploads payment proof but before admin confirms. Purple matches the
    // admin panel's "awaiting confirmation" treatment for parity across
    // the two portals.
    case "PROOF_UPLOADED":
      return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    default:
      return "bg-neutral-800 text-gray-400";
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ============== INVOICE DETAIL MODAL ==============

function InvoiceDetailModal({
  detail,
  onClose,
  onDownloadCSV,
  onDownloadPDF,
  downloadingCSV,
  downloadingPDF,
}: {
  detail: InvoiceDetail;
  onClose: () => void;
  onDownloadCSV: () => void;
  onDownloadPDF: () => void;
  downloadingCSV: boolean;
  downloadingPDF: boolean;
}) {
  const { invoice, partner, bookings, totals, customInvoicedInfo } = detail;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Invoice Details
            </h3>
            <p className="text-sm text-luxury-gold font-mono">
              {invoice.invoiceNumber}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-800 rounded"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Invoice Info */}
          <div className="flex justify-between items-start p-4 bg-neutral-800/50 rounded-lg">
            <Logo size="md" showTagline linkTo={null} />
            <div className="text-right">
              <p className="text-sm text-gray-400">Invoice Period</p>
              <p className="text-white font-medium">
                {invoice.isCustom ? invoice.dateRangeLabel : invoice.month}
              </p>
              <span
                className={`inline-block mt-2 px-2 py-1 text-xs rounded border capitalize ${getStatusColor(invoice.status)}`}
              >
                {invoice.statusLabel}
              </span>
              {invoice.isCustom && (
                <span className="inline-block ml-2 mt-2 px-2 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 rounded border border-purple-500/30 uppercase font-semibold">
                  Custom
                </span>
              )}
            </div>
          </div>

          {/* Partner Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Bill To</p>
              <p className="text-white font-medium">{partner.companyName}</p>
              <p className="text-sm text-gray-400">{partner.address}</p>
              <p className="text-sm text-gray-400">CR: {partner.crNumber}</p>
              <p className="text-sm text-gray-400">VAT: {partner.vatNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">Due Date</p>
              <p className="text-white">{formatDate(invoice.dueDate)}</p>
              {/* Stage 3B-2: split the date label so the partner can tell
                  proof-submitted (waiting on admin) from paid (admin has
                  confirmed). `isConfirmed` is true only when status === PAID;
                  `isPaymentReceived` covers both PROOF_UPLOADED and PAID. */}
              {invoice.isConfirmed && invoice.confirmedAt ? (
                <>
                  <p className="text-xs text-gray-500 mt-2 mb-1">Paid On</p>
                  <p className="text-green-400">
                    {formatDate(invoice.confirmedAt)}
                  </p>
                </>
              ) : invoice.isPaymentReceived && invoice.paymentReceivedAt ? (
                <>
                  <p className="text-xs text-gray-500 mt-2 mb-1">
                    Proof Submitted
                  </p>
                  <p className="text-purple-400">
                    {formatDate(invoice.paymentReceivedAt)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Awaiting admin confirmation
                  </p>
                </>
              ) : null}
            </div>
          </div>

          {/* Custom-invoiced info banner */}
          {customInvoicedInfo && (
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <p className="text-xs text-purple-400">
                {customInvoicedInfo.message}
              </p>
            </div>
          )}

          {/* Bookings Table */}
          <div>
            <p className="text-sm font-medium text-white mb-3">
              Booking Details ({bookings.length} rides)
            </p>
            <div className="border border-neutral-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-800/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      Ref
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      Customer
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      Route
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      Date
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 text-luxury-gold font-mono text-xs">
                        {b.bookingRef}
                      </td>
                      <td className="px-3 py-2 text-white">{b.guestName}</td>
                      <td className="px-3 py-2 text-gray-400 max-w-[150px] truncate">
                        {b.route}
                      </td>
                      <td className="px-3 py-2 text-gray-400">
                        {formatDate(b.tripDate)}
                      </td>
                      <td className="px-3 py-2 text-right text-white">
                        SAR {b.totalPrice.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {bookings.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-gray-500"
                      >
                        No bookings found for this invoice period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-neutral-800 pt-4">
            <div className="flex justify-end">
              <div className="w-full sm:w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="text-white">
                    SAR {totals.subTotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">VAT (15%)</span>
                  <span className="text-white">
                    SAR {totals.vatAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-base sm:text-lg font-bold border-t border-neutral-700 pt-2">
                  <span className="text-white">Grand Total</span>
                  <span className="text-luxury-gold">
                    SAR {totals.grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 p-5 border-t border-neutral-800 sticky bottom-0 bg-neutral-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Close
          </button>
          <button
            onClick={onDownloadCSV}
            disabled={downloadingCSV}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            {downloadingCSV ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download CSV
          </button>
          <button
            onClick={onDownloadPDF}
            disabled={downloadingPDF}
            className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black rounded-lg hover:bg-luxury-gold/80 transition-colors disabled:opacity-50"
          >
            {downloadingPDF ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ============== MAIN COMPONENT ==============

interface InvoicesPanelProps {
  refreshBadges: () => void;
  // Partner status — used to gate Generate Custom Invoice. Only APPROVED
  // partners can create new invoices. Viewing/exporting existing invoices
  // remains open in all states.
  partnerStatus?: string | null;
  // Required profile docs that are past their expiry. When non-empty,
  // Generate Custom Invoice is locked even when partnerStatus === APPROVED.
  expiredRequiredDocs?: Array<{
    type: string;
    label: string;
    expiryDate: string;
  }>;
}

export default function InvoicesPanel({
  refreshBadges,
  partnerStatus,
  expiredRequiredDocs,
}: InvoicesPanelProps) {
  const { showNotification } = useNotification();

  // Doc-expiry is its own axis on top of partnerStatus. Same lock effect but
  // a distinct, more actionable banner ("Balady Expired").
  const hasExpiredDocs = (expiredRequiredDocs?.length ?? 0) > 0;

  // Partner must be APPROVED AND have no expired docs to create new
  // invoices. Viewing/exporting existing invoices is not gated — partner
  // needs to access historical records regardless of current status.
  const canGenerateInvoice = partnerStatus === "APPROVED" && !hasExpiredDocs;
  const generateLockReason = hasExpiredDocs
    ? `The following profile document${expiredRequiredDocs!.length > 1 ? "s have" : " has"} expired: ${expiredRequiredDocs!.map((d) => d.label).join(", ")}. Submit a profile change request to renew before generating new invoices.`
    : partnerStatus === "INVITED"
      ? "Complete and submit your profile to generate invoices"
      : partnerStatus === "PENDING_REVIEW"
        ? "Your profile is being reviewed. Invoice generation will be available once approved."
        : partnerStatus === "CHANGES_REQUESTED"
          ? "Admin has requested profile changes — update your profile and resubmit before generating new invoices."
          : "Your profile must be approved before you can generate invoices.";

  // Tab: monthly vs custom
  const [activeTab, setActiveTab] = useState<"monthly" | "custom">("monthly");

  // Monthly invoices
  const [monthlyInvoices, setMonthlyInvoices] = useState<InvoiceListItem[]>([]);
  const [monthlyPagination, setMonthlyPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [monthlyStatusCounts, setMonthlyStatusCounts] = useState<
    Record<string, number>
  >({});
  const [monthlyStatusFilter, setMonthlyStatusFilter] = useState("all");
  const [newInvoiceCount, setNewInvoiceCount] = useState(0);
  const [loadingMonthly, setLoadingMonthly] = useState(true);

  // Custom invoices
  const [customInvoices, setCustomInvoices] = useState<InvoiceListItem[]>([]);
  const [customPagination, setCustomPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loadingCustom, setLoadingCustom] = useState(false);

  // Custom invoice generation
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [generating, setGenerating] = useState(false);

  // Detail modal
  const [selectedDetail, setSelectedDetail] = useState<InvoiceDetail | null>(
    null,
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloadingCSV, setDownloadingCSV] = useState<string | null>(null);
  const [downloadingPDF, setDownloadingPDF] = useState<string | null>(null);

  // ============== UPLOAD PAYMENT PROOF ==============
  //
  // Stage 3B-2: partner uploads bank-transfer proof for an invoice.
  // Flow:
  //   1. Open modal, select PDF/image of bank receipt.
  //   2. Get signed upload URL from uploadApi.
  //   3. PUT the file to GCS.
  //   4. Call partnerApi.uploadPaymentProof with the GCS path.
  // Backend transitions invoice PENDING/OVERDUE → PROOF_UPLOADED and
  // notifies admin to review. Allowed when partner is APPROVED or
  // SUSPENDED (SUSPENDED is the recovery path for partners auto-
  // suspended on the 6th-of-month cron — uploading proof gets them
  // back into PROOF_UPLOADED and out of the next suspension cycle).
  const [uploadProofInvoice, setUploadProofInvoice] =
    useState<InvoiceListItem | null>(null);
  const [uploadProofFile, setUploadProofFile] = useState<File | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);

  const openUploadProofModal = (invoice: InvoiceListItem) => {
    setUploadProofInvoice(invoice);
    setUploadProofFile(null);
  };

  const closeUploadProofModal = () => {
    setUploadProofInvoice(null);
    setUploadProofFile(null);
  };

  const submitUploadProof = async () => {
    if (!uploadProofInvoice || !uploadProofFile) return;
    setIsUploadingProof(true);
    try {
      // 1. Signed upload URL.
      const signedRes = await uploadApi.getSignedUploadUrl({
        fileName: uploadProofFile.name,
        fileType: uploadProofFile.type,
        section: "partners",
        folder: "payment-proofs",
        entityId: uploadProofInvoice.id,
      });
      if (!signedRes.success || !signedRes.data)
        throw new Error("Failed to get upload URL");

      // 2. PUT to GCS.
      const uploadRes = await fetch(signedRes.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": uploadProofFile.type },
        body: uploadProofFile,
      });
      if (!uploadRes.ok) throw new Error("Proof upload failed");

      // 3. Tell backend.
      const res = await partnerApi.uploadPaymentProof(uploadProofInvoice.id, {
        proofUrl: signedRes.data.filePath,
        proofFileName: uploadProofFile.name,
      });
      if (res.success) {
        showNotification(
          "success",
          res.message ||
            "Payment proof uploaded. Admin will review and confirm shortly.",
        );
        closeUploadProofModal();
        if (activeTab === "monthly") fetchMonthly();
        if (activeTab === "custom") fetchCustom();
        refreshBadges();
      }
    } catch (err: any) {
      const msg =
        err instanceof ApiError ? err.message : err?.message || "Upload failed";
      showNotification("error", msg);
    } finally {
      setIsUploadingProof(false);
    }
  };

  // ============== FETCH MONTHLY INVOICES ==============
  const fetchMonthly = useCallback(async () => {
    setLoadingMonthly(true);
    try {
      const params: Record<string, any> = {
        page: monthlyPagination.page,
        limit: monthlyPagination.limit,
      };
      if (monthlyStatusFilter !== "all") params.status = monthlyStatusFilter;

      const res = await partnerApi.getMonthlyInvoices(params);
      if (res.data) {
        setMonthlyInvoices(res.data.invoices || []);
        setNewInvoiceCount(res.data.newInvoiceCount || 0);
        setMonthlyStatusCounts(res.data.statusCounts || {});
        if (res.data.pagination)
          setMonthlyPagination((prev) => ({ ...prev, ...res.data.pagination }));
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load invoices");
    } finally {
      setLoadingMonthly(false);
    }
  }, [
    monthlyPagination.page,
    monthlyPagination.limit,
    monthlyStatusFilter,
    showNotification,
  ]);

  useEffect(() => {
    if (activeTab === "monthly") fetchMonthly();
  }, [fetchMonthly, activeTab]);

  // ============== FETCH CUSTOM INVOICES ==============
  const fetchCustom = useCallback(async () => {
    setLoadingCustom(true);
    try {
      const res = await partnerApi.getCustomInvoices({
        page: customPagination.page,
        limit: customPagination.limit,
      });
      if (res.data) {
        setCustomInvoices(res.data.invoices || []);
        if (res.data.pagination)
          setCustomPagination((prev) => ({ ...prev, ...res.data.pagination }));
      }
    } catch (err: any) {
      showNotification(
        "error",
        err.message || "Failed to load custom invoices",
      );
    } finally {
      setLoadingCustom(false);
    }
  }, [customPagination.page, customPagination.limit, showNotification]);

  useEffect(() => {
    if (activeTab === "custom") fetchCustom();
  }, [fetchCustom, activeTab]);

  // Auto-clear invoice notifications
  useEffect(() => {
    partnerApi
      .markAllNotificationsAsRead({ category: "INVOICE" })
      .then(() => refreshBadges())
      .catch(() => {});
  }, []);

  // ============== VIEW INVOICE DETAIL ==============
  const handleViewDetail = async (invoiceId: string) => {
    setLoadingDetail(true);
    try {
      const res = await partnerApi.getInvoiceDetail(invoiceId);
      if (res.data) setSelectedDetail(res.data);
      // Refresh list to remove NEW badge + refresh sidebar badge count
      if (activeTab === "monthly") fetchMonthly();
      if (activeTab === "custom") fetchCustom();
      refreshBadges();
    } catch (err: any) {
      showNotification(
        "error",
        err.message || "Failed to load invoice details",
      );
    } finally {
      setLoadingDetail(false);
    }
  };

  // ============== DOWNLOAD CSV ==============
  const handleDownloadCSV = async (invoiceId: string) => {
    setDownloadingCSV(invoiceId);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/v1/partner/invoices/${invoiceId}/csv`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("CSV export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoiceId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification("success", "Invoice CSV downloaded");
    } catch (err: any) {
      showNotification("error", err.message || "Failed to download CSV");
    } finally {
      setDownloadingCSV(null);
    }
  };

  // ============== DOWNLOAD PDF ==============
  const handleDownloadPDF = async (invoiceId: string) => {
    setDownloadingPDF(invoiceId);
    try {
      const res = await partnerApi.downloadInvoicePdf(invoiceId);
      if (res.data?.html) {
        const win = window.open("", "_blank", "width=900,height=900");
        if (win) {
          win.document.write(res.data.html);
          win.document.close();
        }
      }
      showNotification("success", "Invoice PDF opened");
    } catch (err: any) {
      showNotification("error", err.message || "Failed to download PDF");
    } finally {
      setDownloadingPDF(null);
    }
  };

  // ============== GENERATE CUSTOM INVOICE ==============
  const handleGenerateCustom = async () => {
    if (!customDateFrom || !customDateTo) {
      showNotification("error", "Please select both start and end dates");
      return;
    }
    setGenerating(true);
    try {
      const res = await partnerApi.generateCustomInvoice({
        startDate: customDateFrom,
        endDate: customDateTo,
      });
      showNotification(
        "success",
        res.message || `Custom invoice ${res.data?.invoiceNumber} generated`,
      );
      setCustomDateFrom("");
      setCustomDateTo("");
      fetchCustom();
      refreshBadges();
    } catch (err: any) {
      showNotification(
        "error",
        err.message || "Failed to generate custom invoice",
      );
    } finally {
      setGenerating(false);
    }
  };

  // ============== INVOICE TABLE (shared for monthly and custom) ==============
  const renderInvoiceTable = (
    invoices: InvoiceListItem[],
    loading: boolean,
    pagination: Pagination,
    onPageChange: (p: number) => void,
    isCustom: boolean,
  ) => (
    <>
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Invoice #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  {isCustom ? "Period" : "Month"}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Rides
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Due Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="hover:bg-neutral-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-luxury-gold">
                        {inv.invoiceNumber}
                      </span>
                      {inv.isNew && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-luxury-gold text-black rounded uppercase">
                          New
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-white">
                    {isCustom ? inv.dateRangeLabel : inv.month}
                  </td>
                  <td className="px-4 py-3 text-sm text-white">
                    {inv.bookingCount}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-white">
                    SAR {inv.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {formatDate(inv.dueDate)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded border capitalize ${getStatusColor(inv.status)}`}
                    >
                      {inv.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewDetail(inv.id)}
                        title="View Details"
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-neutral-700 rounded transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(inv.id)}
                        disabled={downloadingPDF === inv.id}
                        title="Download PDF"
                        className="p-1.5 text-gray-400 hover:text-luxury-gold hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
                      >
                        {downloadingPDF === inv.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDownloadCSV(inv.id)}
                        disabled={downloadingCSV === inv.id}
                        title="Download CSV"
                        className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-neutral-700 rounded transition-colors disabled:opacity-50"
                      >
                        {downloadingCSV === inv.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                      {/* Upload Payment Proof — only valid for PENDING /
                          OVERDUE invoices (PROOF_UPLOADED already has one,
                          PAID is settled). Mirrors backend gating. */}
                      {(inv.status === "PENDING" ||
                        inv.status === "OVERDUE") && (
                        <button
                          onClick={() => openUploadProofModal(inv)}
                          title="Upload Payment Proof"
                          className="p-1.5 text-gray-400 hover:text-purple-400 hover:bg-neutral-700 rounded transition-colors"
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                      )}
                      {inv.status === "PROOF_UPLOADED" && (
                        <span
                          className="text-[10px] text-purple-400 px-1.5 py-0.5 bg-purple-500/10 rounded border border-purple-500/30 whitespace-nowrap"
                          title="Awaiting admin confirmation"
                        >
                          Submitted
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && invoices.length === 0 && (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon" className="bg-neutral-800">
                  <FileTextEmpty className="w-5 h-5 text-gray-400" />
                </EmptyMedia>
                <EmptyTitle className="text-white">
                  {isCustom ? "No Custom Invoices" : "No Invoices Yet"}
                </EmptyTitle>
                <EmptyDescription className="text-gray-400">
                  {isCustom
                    ? "Generate a custom invoice using the date range selector above"
                    : "Your monthly invoices will appear here once generated"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>

      {/* Pagination */}
      {pagination.total > 0 && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">
            {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
              disabled={pagination.page === 1}
              className="px-3 py-1.5 bg-neutral-800 text-gray-400 rounded text-sm hover:text-white disabled:opacity-50 transition-colors"
            >
              Prev
            </button>
            {Array.from(
              { length: Math.min(pagination.totalPages, 5) },
              (_, i) => i + 1,
            ).map((p) => (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`w-7 h-7 rounded text-sm font-medium transition-colors ${pagination.page === p ? "bg-luxury-gold text-black" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() =>
                onPageChange(
                  Math.min(pagination.totalPages, pagination.page + 1),
                )
              }
              disabled={pagination.page === pagination.totalPages}
              className="px-3 py-1.5 bg-neutral-800 text-gray-400 rounded text-sm hover:text-white disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );

  // ============== RENDER ==============
  return (
    <div className="space-y-6">
      {/* Lock banner — shown only when partner cannot generate new invoices.
          Doc-expired variant (red) takes precedence over status-based variant
          (amber). Viewing/exporting existing invoices is not gated, so the
          banner explains specifically what's blocked. */}
      {!canGenerateInvoice && (hasExpiredDocs || partnerStatus) && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            hasExpiredDocs
              ? "bg-red-500/5 border-red-500/20"
              : "bg-amber-500/5 border-amber-500/20"
          }`}
        >
          <ShieldAlert
            className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              hasExpiredDocs ? "text-red-400" : "text-amber-400"
            }`}
          />
          <div className="flex-1">
            <p
              className={`text-sm font-medium ${
                hasExpiredDocs ? "text-red-400" : "text-amber-400"
              }`}
            >
              {hasExpiredDocs
                ? expiredRequiredDocs!.length === 1
                  ? `${expiredRequiredDocs![0].label} has expired`
                  : `${expiredRequiredDocs!.length} required documents have expired`
                : partnerStatus === "INVITED"
                  ? "Profile not yet submitted"
                  : partnerStatus === "PENDING_REVIEW"
                    ? "Profile under review"
                    : partnerStatus === "CHANGES_REQUESTED"
                      ? "Admin requested profile changes"
                      : "Custom invoice generation disabled"}
            </p>
            <p
              className={`text-xs mt-0.5 ${
                hasExpiredDocs ? "text-red-400/70" : "text-amber-400/70"
              }`}
            >
              {hasExpiredDocs
                ? `Renew the expired document${expiredRequiredDocs!.length > 1 ? "s" : ""} via the profile change-request flow. You can view and export existing invoices, but cannot generate new custom invoices until renewed.`
                : "You can view and export existing invoices. Generating new custom invoices will be available once your profile is approved."}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("monthly")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "monthly" ? "bg-luxury-gold text-black" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
        >
          Monthly Invoices
          {newInvoiceCount > 0 && (
            <span
              className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                activeTab === "monthly"
                  ? "bg-black/20 text-black"
                  : "bg-luxury-gold text-black"
              }`}
            >
              {newInvoiceCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("custom")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "custom" ? "bg-luxury-gold text-black" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
        >
          Custom Date Range
        </button>
      </div>

      {/* New invoices banner */}
      {activeTab === "monthly" && newInvoiceCount > 0 && (
        <div className="flex items-center gap-3 p-3 bg-luxury-gold/10 border border-luxury-gold/30 rounded-lg">
          <Sparkles className="w-5 h-5 text-luxury-gold flex-shrink-0" />
          <p className="text-sm text-luxury-gold">
            You have <strong>{newInvoiceCount}</strong> new invoice
            {newInvoiceCount > 1 ? "s" : ""} to review.
          </p>
        </div>
      )}

      {/* Monthly Status Filter */}
      {activeTab === "monthly" && (
        <div className="flex gap-2 flex-wrap">
          {["all", "PENDING", "OVERDUE", "PROOF_UPLOADED", "PAID"].map((s) => {
            // Friendly label override for the PROOF_UPLOADED state — the
            // raw enum is too internal for a filter pill. Everything else
            // uses the existing lowercased-status pattern.
            const pillLabel =
              s === "all"
                ? "All"
                : s === "PROOF_UPLOADED"
                  ? "Proof Submitted"
                  : s.toLowerCase();
            return (
              <button
                key={s}
                onClick={() => {
                  setMonthlyStatusFilter(s);
                  setMonthlyPagination((p) => ({ ...p, page: 1 }));
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  monthlyStatusFilter === s
                    ? "bg-neutral-700 text-white"
                    : "bg-neutral-800/50 text-gray-400 hover:text-white"
                }`}
              >
                {pillLabel}
                {s !== "all" && monthlyStatusCounts[s] ? (
                  <span className="ml-1 text-[10px] opacity-60">
                    ({monthlyStatusCounts[s]})
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Monthly Invoices Tab */}
      {activeTab === "monthly" && (
        <>
          {loadingMonthly && monthlyInvoices.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
            </div>
          ) : (
            renderInvoiceTable(
              monthlyInvoices,
              loadingMonthly,
              monthlyPagination,
              (p) => setMonthlyPagination((prev) => ({ ...prev, page: p })),
              false,
            )
          )}
        </>
      )}

      {/* Custom Date Range Tab */}
      {activeTab === "custom" && (
        <div className="space-y-6">
          {/* Generate Section */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              Generate Custom Invoice
            </h3>
            <p className="text-sm text-gray-400 mb-6">
              Select a date range to generate an invoice for all completed
              bookings within that period. These bookings will be excluded from
              the monthly auto-generated invoice.
            </p>

            <div className="flex flex-wrap items-end gap-4 mb-6">
              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">From Date</label>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-gray-500 mb-1">To Date</label>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:border-luxury-gold focus:outline-none"
                />
              </div>
              <button
                onClick={() =>
                  canGenerateInvoice
                    ? handleGenerateCustom()
                    : showNotification("warning", generateLockReason)
                }
                disabled={
                  generating ||
                  !customDateFrom ||
                  !customDateTo ||
                  !canGenerateInvoice
                }
                title={canGenerateInvoice ? undefined : generateLockReason}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  canGenerateInvoice
                    ? "bg-luxury-gold text-black hover:bg-luxury-gold/80"
                    : "bg-neutral-800 text-gray-500"
                }`}
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : !canGenerateInvoice ? (
                  <ShieldAlert className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {generating
                  ? "Generating..."
                  : !canGenerateInvoice
                    ? "Locked"
                    : "Generate Invoice"}
              </button>
            </div>

            {customDateFrom && customDateTo && (
              <div className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg">
                <p className="text-sm text-gray-400">
                  This will create an invoice for all completed bookings from{" "}
                  <span className="text-white">{customDateFrom}</span> to{" "}
                  <span className="text-white">{customDateTo}</span>. Bookings
                  already on a custom invoice will be excluded.
                </p>
              </div>
            )}
          </div>

          {/* Custom Invoices List */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">
                Your Custom Invoices
              </h3>
            </div>
            {loadingCustom && customInvoices.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
              </div>
            ) : (
              renderInvoiceTable(
                customInvoices,
                loadingCustom,
                customPagination,
                (p) => setCustomPagination((prev) => ({ ...prev, page: p })),
                true,
              )
            )}
          </div>
        </div>
      )}

      {/* Loading detail overlay */}
      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-6 py-4 bg-neutral-900 border border-neutral-700 rounded-xl">
            <Loader2 className="w-5 h-5 text-luxury-gold animate-spin" />
            <span className="text-white">Loading invoice details...</span>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedDetail && (
        <InvoiceDetailModal
          detail={selectedDetail}
          onClose={() => setSelectedDetail(null)}
          onDownloadCSV={() => handleDownloadCSV(selectedDetail.invoice.id)}
          onDownloadPDF={() => handleDownloadPDF(selectedDetail.invoice.id)}
          downloadingCSV={downloadingCSV === selectedDetail.invoice.id}
          downloadingPDF={downloadingPDF === selectedDetail.invoice.id}
        />
      )}

      {/* ============== UPLOAD PAYMENT PROOF MODAL ==============
          Mirrors the admin "Mark Paid + Upload Receipt" modal but for
          the partner side. Partner uploads bank-transfer receipt (image
          or PDF) which becomes visible to admin in the payments panel
          for verification. */}
      {uploadProofInvoice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isUploadingProof && closeUploadProofModal()}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="p-5 border-b border-neutral-800 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Upload Payment Proof
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {uploadProofInvoice.invoiceNumber} —{" "}
                  {uploadProofInvoice.month ||
                    uploadProofInvoice.dateRangeLabel ||
                    ""}
                </p>
              </div>
              <button
                onClick={closeUploadProofModal}
                disabled={isUploadingProof}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-neutral-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="text-luxury-gold font-semibold">
                    SAR {Number(uploadProofInvoice.amount).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">Due Date</span>
                  <span className="text-white">
                    {formatDate(uploadProofInvoice.dueDate)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Bank Transfer Receipt *
                </label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) =>
                    setUploadProofFile(e.target.files?.[0] || null)
                  }
                  disabled={isUploadingProof}
                  className="w-full text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-luxury-gold/20 file:text-luxury-gold hover:file:bg-luxury-gold/30 file:cursor-pointer disabled:opacity-50"
                />
                {uploadProofFile && (
                  <p className="text-xs text-gray-400 mt-2 truncate">
                    Selected: {uploadProofFile.name} (
                    {(uploadProofFile.size / 1024).toFixed(0)} KB)
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                  PDF or image of the bank transfer receipt. Admin will review
                  and confirm. Until confirmed, the invoice status will show as
                  "Proof Submitted".
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={closeUploadProofModal}
                disabled={isUploadingProof}
                className="px-4 py-2 text-gray-400 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitUploadProof}
                disabled={!uploadProofFile || isUploadingProof}
                className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50"
              >
                {isUploadingProof ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Submit Proof
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
