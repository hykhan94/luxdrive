"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { adminApi, ApiError } from "@/lib/api";
import {
  Search,
  Calendar,
  MapPin,
  Clock,
  X,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Building2,
  AlertTriangle,
  Loader2,
  XCircle,
  User,
  Eye,
  RefreshCw,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";

type StatusFilter =
  | "all"
  | "pending"
  | "confirmed"
  | "in-progress"
  | "completed"
  | "cancelled";
type SourceFilter = "all" | "direct" | "partner";

// Status badge config — keys here are lower-kebab versions of the raw
// BookingStatus enum from the backend (the lookup helper converts e.g.
// "ASSIGNMENT_OFFERED" → "assignment-offered"). Stage 3B replaced the
// old AWAITING_VENDOR / VENDOR_REJECTED states with two new ones:
// ASSIGNMENT_OFFERED (first offer outstanding to a vendor) and
// ASSIGNMENT_RE_OFFERED (price-revised re-offer after a PRICE_TOO_LOW
// rejection). Old keys deliberately removed.
const statusConfig: Record<string, { label: string; color: string }> = {
  pending: {
    label: "Pending",
    color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  },
  "assignment-offered": {
    label: "Offer Sent",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  },
  "assignment-re-offered": {
    label: "Re-offer Pending",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  confirmed: {
    label: "Confirmed",
    color: "bg-green-500/10 text-green-400 border-green-500/30",
  },
  "in-progress": {
    label: "In Progress",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  },
  completed: {
    label: "Completed",
    color: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-500/10 text-red-400 border-red-500/30",
  },
};

interface Booking {
  id: string;
  bookingRef: string;
  customer: { name: string; email: string | null; phone: string | null };
  partner: { id: string; companyName: string } | null;
  isPartnerBooking: boolean;
  source: string | null;
  route: { pickup: string | null; dropoff: string | null };
  tripDate: string;
  tripTime: string | null;
  createdAt: string;
  vendor: { id: string; companyName: string } | null;
  vendorStatus: string | null;
  status: string;
  statusDisplay: string;
  amount: number;
  vehicleClass: string | null;
  isUnread: boolean;
  needsAttention: boolean;
  attentionReason: string | null;
  highlightType: string;
}

interface BookingDetail {
  id: string;
  bookingRef: string;
  status: string;
  statusDisplay: string;
  customer: { name: string; email: string | null; phone: string | null };
  partner: { id: string; companyName: string } | null;
  isPartnerBooking: boolean;
  pickup: string | null;
  dropoff: string | null;
  tripDate: string;
  tripTime: string | null;
  vehicleClass: string | null;
  vehicleClassDisplay: string | null;
  passengers: number | null;
  vendorAssignment: any;
  availableVendors: { count: number; rejectedCount: number };
  actions: {
    canAssignVendor: boolean;
    canCancel: boolean;
    needsReassignment: boolean;
  };
  timeline: any[];
  totalAmount: number;
  pricing: {
    basePrice: number;
    peakMultiplier: number | null;
    vatAmount: number | null;
    totalPrice: number;
  };
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
}

// Backend now sorts vendors by completedBookingsCount desc and surfaces
// it as the primary signal for admin selection (replacing the old rating-
// only sort). vehicleCount/driverCount are now filtered counts (only
// vehicles/drivers whose docs are valid through the trip date).
interface AvailableVendor {
  id: string;
  companyName: string;
  rating: number | null;
  completedBookingsCount: number;
  vehicleCount: number;
  driverCount: number;
  displayText: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
interface StatusCounts {
  all: number;
  pending: number;
  confirmed: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

// Reasons admin can record on behalf of a vendor. Backend accepts these
// enum values; the panel maps them to friendly labels for the select.
const REJECTION_REASONS = [
  { value: "CAR_DRIVER_UNAVAILABLE", label: "No car or driver available" },
  { value: "PRICE_TOO_LOW", label: "Offered price too low" },
  { value: "UNSUITABLE_ROUTE", label: "Unsuitable route" },
] as const;
type RejectionReason = (typeof REJECTION_REASONS)[number]["value"];

export default function BookingList({
  showSourceFilter = false,
}: {
  showSourceFilter?: boolean;
}) {
  const { showNotification } = useNotification();

  // List state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [counts, setCounts] = useState<StatusCounts>({
    all: 0,
    pending: 0,
    confirmed: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
  });
  const [alerts, setAlerts] = useState({ unreadCount: 0, attentionCount: 0 });
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Detail panel
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(
    null,
  );
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Vendor assignment (Stage 3B: payout amount is part of the offer
  // payload, not implicit. Negative margin warning is shown inline but
  // submit is still allowed — see render section.)
  const [availableVendors, setAvailableVendors] = useState<AvailableVendor[]>(
    [],
  );
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  // Tracks whether a vendor-load attempt has completed for the current
  // booking. We can't rely on `availableVendors.length > 0` alone —
  // zero is a valid loaded result (no eligible vendors) and we want to
  // show a clear empty state in that case rather than re-prompting
  // with a "Load Available Vendors" button that loops back to the
  // same outcome.
  const [vendorsLoaded, setVendorsLoaded] = useState(false);

  // Re-offer state — only used when booking.status === ASSIGNMENT_RE_OFFERED.
  // The booking still has vendorId set (the vendor who rejected for price);
  // admin enters a revised payout and triggers reOfferBooking which creates
  // an attempt-2 offer for the same vendor.
  const [reOfferPayoutAmount, setReOfferPayoutAmount] = useState("");
  const [isReOffering, setIsReOffering] = useState(false);

  // Record rejection (admin-recorded on vendor's behalf — used when a
  // vendor calls/emails admin instead of using the app). Same flow as
  // vendor's own reject endpoint: PRICE_TOO_LOW at attempt 1 transitions
  // to ASSIGNMENT_RE_OFFERED; everything else cascades to the next
  // eligible vendor.
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>(
    "CAR_DRIVER_UNAVAILABLE",
  );
  const [isRecordingRejection, setIsRecordingRejection] = useState(false);

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch bookings list
  const fetchBookings = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      try {
        const params: Record<string, any> = { page, limit: 10 };
        if (searchQuery) params.search = searchQuery;
        if (statusFilter !== "all") params.status = statusFilter;
        if (sourceFilter !== "all") params.source = sourceFilter;
        if (dateFrom) params.startDate = dateFrom;
        if (dateTo) params.endDate = dateTo;
        params.dateType = "tripDate";

        const res = await adminApi.getBookings(params);
        if (res.success && res.data) {
          setBookings(res.data.bookings || []);
          setPagination(
            res.data.pagination || {
              page: 1,
              limit: 10,
              total: 0,
              totalPages: 0,
            },
          );
          setCounts(
            res.data.counts || {
              all: 0,
              pending: 0,
              confirmed: 0,
              inProgress: 0,
              completed: 0,
              cancelled: 0,
            },
          );
          setAlerts(res.data.alerts || { unreadCount: 0, attentionCount: 0 });
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load bookings");
      } finally {
        setIsLoading(false);
      }
    },
    [
      searchQuery,
      statusFilter,
      sourceFilter,
      dateFrom,
      dateTo,
      showNotification,
    ],
  );

  useEffect(() => {
    fetchBookings(1);
  }, [fetchBookings]);

  // Reset all per-booking detail state. Called whenever admin switches
  // bookings so stale inputs (payout, reOfferPayout, rejection modal)
  // don't leak between bookings.
  const resetDetailState = () => {
    setSelectedVendorId("");
    setAvailableVendors([]);
    setVendorsLoaded(false);
    setPayoutAmount("");
    setReOfferPayoutAmount("");
    setShowRejectionModal(false);
    setRejectionReason("CAR_DRIVER_UNAVAILABLE");
  };

  // Fetch booking detail. Also pre-loads the eligible-vendors list
  // when the booking is in an assignable state so the admin sees the
  // dropdown immediately rather than a "Load Available Vendors" button
  // that loops back to itself when the result is empty.
  const handleSelectBooking = async (bookingId: string) => {
    setIsLoadingDetail(true);
    resetDetailState();
    try {
      const res = await adminApi.getBooking(bookingId);
      if (res.success && res.data) {
        setSelectedBooking(res.data);
        // Refresh list to update read status
        fetchBookings(pagination.page);
        // Auto-load vendors if this booking is eligible for assignment.
        // We pass the freshly-loaded booking through directly rather
        // than reading from state (setSelectedBooking is async).
        const b = res.data;
        const isReOffer = b.status === "ASSIGNMENT_RE_OFFERED";
        if (b.actions?.canAssignVendor && !isReOffer) {
          // Don't await — admin can start reading the rest of the
          // detail panel while vendors load in parallel.
          loadVendorsForBooking(bookingId);
        }
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load booking");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Fetch available vendors (uses the new eligibility filter — backend
  // returns only vendors whose docs are valid through trip date and who
  // haven't already rejected this booking, sorted by completed-bookings).
  // Takes the bookingId as a param so it can be called from
  // handleSelectBooking before selectedBooking state has settled.
  const loadVendorsForBooking = async (bookingId: string) => {
    setIsLoadingVendors(true);
    setVendorsLoaded(false);
    try {
      const res = await adminApi.getAvailableVendors(bookingId);
      if (res.success && res.data)
        setAvailableVendors(res.data.available || []);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load vendors");
    } finally {
      setIsLoadingVendors(false);
      setVendorsLoaded(true);
    }
  };

  // Manual reload button (kept for refresh after admin actions like
  // recording a rejection elsewhere).
  const handleLoadVendors = async () => {
    if (!selectedBooking) return;
    await loadVendorsForBooking(selectedBooking.id);
  };

  // Live margin breakdown for the assign-vendor form. Recalculates as
  // admin types. Negative margin = admin would lose money on this
  // booking; surfaced as a warning but submit is allowed (admin may
  // accept a loss to maintain the relationship with a strategic partner).
  const partnerPrice = selectedBooking?.pricing.totalPrice ?? 0;
  const payoutNumber = useMemo(() => {
    const n = Number(payoutAmount);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [payoutAmount]);
  const margin = payoutNumber !== null ? partnerPrice - payoutNumber : null;
  const marginPct =
    margin !== null && partnerPrice > 0 ? (margin / partnerPrice) * 100 : null;
  const isMarginNegative = margin !== null && margin < 0;

  // Assign vendor — now sends payoutAmount as part of the offer payload.
  // Backend creates a BookingAssignmentOffer row at attemptNumber=1 and
  // transitions booking to ASSIGNMENT_OFFERED.
  const handleAssignVendor = async () => {
    if (!selectedBooking || !selectedVendorId) return;
    if (payoutNumber === null) {
      showNotification("error", "Enter a payout amount greater than zero");
      return;
    }
    setIsAssigning(true);
    try {
      const res = await adminApi.assignVendor(selectedBooking.id, {
        vendorId: selectedVendorId,
        payoutAmount: payoutNumber,
      });
      if (res.success) {
        showNotification("success", res.message || "Vendor assigned");
        handleSelectBooking(selectedBooking.id);
        fetchBookings(pagination.page);
      }
    } catch (err: any) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to assign vendor";
      showNotification("error", msg);
    } finally {
      setIsAssigning(false);
    }
  };

  // Re-offer at revised price — only valid when booking is in
  // ASSIGNMENT_RE_OFFERED state (entered after a PRICE_TOO_LOW rejection
  // at attempt 1). Creates attempt-2 offer for the same vendor.
  const reOfferPayoutNumber = useMemo(() => {
    const n = Number(reOfferPayoutAmount);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [reOfferPayoutAmount]);
  const reOfferMargin =
    reOfferPayoutNumber !== null ? partnerPrice - reOfferPayoutNumber : null;
  const reOfferMarginPct =
    reOfferMargin !== null && partnerPrice > 0
      ? (reOfferMargin / partnerPrice) * 100
      : null;
  const isReOfferMarginNegative = reOfferMargin !== null && reOfferMargin < 0;

  const handleReOffer = async () => {
    if (!selectedBooking || reOfferPayoutNumber === null) {
      showNotification("error", "Enter a revised payout amount");
      return;
    }
    setIsReOffering(true);
    try {
      const res = await adminApi.reOfferBooking(selectedBooking.id, {
        payoutAmount: reOfferPayoutNumber,
      });
      if (res.success) {
        showNotification("success", res.message || "Booking re-offered");
        setReOfferPayoutAmount("");
        handleSelectBooking(selectedBooking.id);
        fetchBookings(pagination.page);
      }
    } catch (err: any) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to re-offer booking";
      showNotification("error", msg);
    } finally {
      setIsReOffering(false);
    }
  };

  // Record vendor rejection on behalf of vendor (admin path — used when
  // vendor declines via phone/email instead of via the vendor portal).
  // Backend follows the same branching as vendor's own reject endpoint:
  // PRICE_TOO_LOW at attempt 1 transitions to ASSIGNMENT_RE_OFFERED;
  // everything else cascades.
  const handleRecordRejection = async () => {
    if (!selectedBooking?.vendorAssignment?.vendor?.id) {
      showNotification(
        "error",
        "No vendor associated with this booking to record a rejection for",
      );
      return;
    }
    setIsRecordingRejection(true);
    try {
      const res = await adminApi.recordVendorRejection(selectedBooking.id, {
        vendorId: selectedBooking.vendorAssignment.vendor.id,
        reason: rejectionReason,
      });
      if (res.success) {
        showNotification("success", res.message || "Rejection recorded");
        setShowRejectionModal(false);
        handleSelectBooking(selectedBooking.id);
        fetchBookings(pagination.page);
      }
    } catch (err: any) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to record rejection";
      showNotification("error", msg);
    } finally {
      setIsRecordingRejection(false);
    }
  };

  // Cancel booking
  const handleCancelBooking = async () => {
    if (!selectedBooking || !cancelReason) return;
    setIsCancelling(true);
    try {
      const res = await adminApi.cancelBooking(selectedBooking.id, {
        reason: cancelReason,
      });
      if (res.success) {
        showNotification("success", "Booking cancelled");
        setShowCancelModal(false);
        setCancelReason("");
        handleSelectBooking(selectedBooking.id);
        fetchBookings(pagination.page);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to cancel");
    } finally {
      setIsCancelling(false);
    }
  };

  // Resolve attention flag
  const handleResolveAttention = async () => {
    if (!selectedBooking) return;
    try {
      const res = await adminApi.resolveBookingAttention(selectedBooking.id);
      if (res.success) {
        showNotification("success", "Attention resolved");
        handleSelectBooking(selectedBooking.id);
        fetchBookings(pagination.page);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      const res = await adminApi.markAllBookingsAsRead();
      if (res.success) {
        showNotification("success", res.message || "All marked as read");
        fetchBookings(pagination.page);
      }
    } catch {
      /* silent */
    }
  };

  const getStatusStyle = (status: string) => {
    const key = status.toLowerCase().replace(/_/g, "-");
    return statusConfig[key]?.color || "bg-neutral-800 text-gray-400";
  };

  const getStatusLabel = (status: string) => {
    const key = status.toLowerCase().replace(/_/g, "-");
    return statusConfig[key]?.label || status.replace(/_/g, " ");
  };

  const statusTabs: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "pending", label: "Pending", count: counts.pending },
    { value: "confirmed", label: "Confirmed", count: counts.confirmed },
    { value: "in-progress", label: "In Progress", count: counts.inProgress },
    { value: "completed", label: "Completed", count: counts.completed },
    { value: "cancelled", label: "Cancelled", count: counts.cancelled },
  ];

  const isReOfferState = selectedBooking?.status === "ASSIGNMENT_RE_OFFERED";

  return (
    <div className="space-y-4">
      {/* Alerts Bar */}
      {(alerts.unreadCount > 0 || alerts.attentionCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-neutral-900 border border-neutral-800 rounded-xl">
          <div className="flex flex-wrap items-center gap-3">
            {alerts.unreadCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-blue-400">
                <span className="w-2 h-2 bg-blue-400 rounded-full" />
                {alerts.unreadCount} unread
              </span>
            )}
            {alerts.attentionCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                {alerts.attentionCount} need attention
              </span>
            )}
          </div>
          {alerts.unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search booking ID, customer, partner..."
              className="w-full pl-9 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold/50"
            />
          </div>
          {showSourceFilter && (
            <div className="flex gap-1.5">
              {(["all", "direct", "partner"] as SourceFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSourceFilter(s)}
                  className={`px-3 py-2 text-xs rounded-lg capitalize transition-colors ${sourceFilter === s ? "bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/30" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Trip Date:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none max-w-[130px]"
          />
          <span className="text-xs text-gray-500">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none max-w-[130px]"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="p-1.5 text-red-400 hover:bg-red-500/20 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${statusFilter === tab.value ? "bg-luxury-gold text-black font-semibold" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-white font-medium">No bookings found</p>
            <p className="text-sm text-gray-500">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full min-w-[900px]">
                <thead className="bg-neutral-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Booking
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Route
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Trip Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Vendor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {bookings.map((b) => (
                    <tr
                      key={b.id}
                      className={`hover:bg-neutral-800/30 transition-colors ${b.highlightType === "attention" ? "bg-red-500/5" : b.highlightType === "unread" ? "bg-blue-500/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {b.isUnread && (
                            <span className="w-2 h-2 bg-blue-400 rounded-full flex-shrink-0" />
                          )}
                          {b.needsAttention && (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          )}
                          <span className="text-sm text-luxury-gold font-mono">
                            {b.bookingRef}
                          </span>
                        </div>
                        {b.partner && (
                          <p className="text-xs text-purple-400 mt-0.5">
                            {b.partner.companyName}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white text-sm">{b.customer.name}</p>
                        {b.customer.phone && (
                          <p className="text-xs text-gray-500">
                            {b.customer.phone}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white text-sm truncate max-w-[140px]">
                          {b.route.pickup || "—"}
                        </p>
                        <p className="text-xs text-gray-500 truncate max-w-[140px]">
                          → {b.route.dropoff || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white text-sm">
                          {new Date(b.tripDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                        {b.tripTime && (
                          <p className="text-xs text-gray-500">{b.tripTime}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-300">
                          {b.vendor?.companyName || "Unassigned"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(b.status)}`}
                        >
                          {getStatusLabel(b.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white font-medium">
                        SAR {Number(b.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleSelectBooking(b.id)}
                          className="p-1.5 text-gray-400 hover:text-luxury-gold hover:bg-luxury-gold/10 rounded transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3 p-4">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  onClick={() => handleSelectBooking(b.id)}
                  className={`rounded-xl p-4 border cursor-pointer transition-colors ${b.highlightType === "attention" ? "bg-red-500/5 border-red-500/30" : b.highlightType === "unread" ? "bg-blue-500/5 border-blue-500/30" : "bg-neutral-800 border-neutral-700"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {b.isUnread && (
                        <span className="w-2 h-2 bg-blue-400 rounded-full" />
                      )}
                      {b.needsAttention && (
                        <AlertTriangle className="w-3 h-3 text-red-400" />
                      )}
                      <span className="text-luxury-gold text-sm font-mono">
                        {b.bookingRef}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(b.status)}`}
                    >
                      {getStatusLabel(b.status)}
                    </span>
                  </div>
                  <p className="text-white text-sm">{b.customer.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {b.route.pickup} → {b.route.dropoff}
                  </p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-700">
                    <span className="text-xs text-gray-400">
                      {new Date(b.tripDate).toLocaleDateString()} ·{" "}
                      {b.vendor?.companyName || "Unassigned"}
                    </span>
                    <span className="text-sm text-white font-medium">
                      SAR {Number(b.amount).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination */}
        {pagination.total > 0 && (
          <div className="px-4 sm:px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              of {pagination.total}
            </p>
            {pagination.totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => fetchBookings(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fetchBookings(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============== BOOKING DETAIL PANEL ============== */}
      {(selectedBooking || isLoadingDetail) && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setSelectedBooking(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full sm:w-[520px] bg-neutral-900 border-l border-neutral-800 z-50 overflow-y-auto">
            {isLoadingDetail ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
              </div>
            ) : (
              selectedBooking && (
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        {selectedBooking.bookingRef}
                      </h2>
                      <span
                        className={`mt-1 inline-block px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(selectedBooking.status)}`}
                      >
                        {selectedBooking.statusDisplay}
                      </span>
                    </div>
                    <button
                      onClick={() => setSelectedBooking(null)}
                      className="p-2 hover:bg-neutral-800 rounded-lg"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Attention Banner — needsReassignment is set when admin
                       needs to act: typically after a non-price rejection
                       cascades back to PENDING with no auto-cascade target,
                       or when offer-state has a stale outstanding offer. */}
                  {selectedBooking.actions.needsReassignment && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-red-400 font-medium">
                          Needs Reassignment
                        </p>
                        {selectedBooking.vendorAssignment?.rejectionReason && (
                          <p className="text-xs text-red-300/80 mt-1">
                            Last rejection:{" "}
                            {selectedBooking.vendorAssignment.rejectionReason}
                          </p>
                        )}
                        <button
                          onClick={handleResolveAttention}
                          className="text-xs text-red-400/70 hover:text-red-300 mt-1"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Customer */}
                  <div className="bg-neutral-800 rounded-xl p-4 mb-4">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <User className="w-4 h-4 text-luxury-gold" /> Customer
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Name</span>
                        <span className="text-white">
                          {selectedBooking.customer.name}
                        </span>
                      </div>
                      {selectedBooking.customer.email && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Email</span>
                          <span className="text-white">
                            {selectedBooking.customer.email}
                          </span>
                        </div>
                      )}
                      {selectedBooking.customer.phone && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Phone</span>
                          <span className="text-white">
                            {selectedBooking.customer.phone}
                          </span>
                        </div>
                      )}
                      {selectedBooking.partner && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Partner</span>
                          <span className="text-purple-400">
                            {selectedBooking.partner.companyName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trip Details */}
                  <div className="bg-neutral-800 rounded-xl p-4 mb-4">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-luxury-gold" /> Trip
                      Details
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Pickup</span>
                        <span className="text-white text-right max-w-[60%]">
                          {selectedBooking.pickup || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Dropoff</span>
                        <span className="text-white text-right max-w-[60%]">
                          {selectedBooking.dropoff || "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Date</span>
                        <span className="text-white">
                          {new Date(
                            selectedBooking.tripDate,
                          ).toLocaleDateString()}{" "}
                          {selectedBooking.tripTime || ""}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Vehicle</span>
                        <span className="text-white">
                          {selectedBooking.vehicleClassDisplay || "—"}
                        </span>
                      </div>
                      {selectedBooking.passengers && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Passengers</span>
                          <span className="text-white">
                            {selectedBooking.passengers}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="bg-neutral-800 rounded-xl p-4 mb-4">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-luxury-gold" /> Pricing
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Base Price</span>
                        <span className="text-white">
                          SAR{" "}
                          {Number(
                            selectedBooking.pricing.basePrice,
                          ).toLocaleString()}
                        </span>
                      </div>
                      {selectedBooking.pricing.peakMultiplier &&
                        selectedBooking.pricing.peakMultiplier > 1 && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">
                              Peak Multiplier
                            </span>
                            <span className="text-yellow-400">
                              {selectedBooking.pricing.peakMultiplier}x
                            </span>
                          </div>
                        )}
                      {selectedBooking.pricing.vatAmount && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">VAT</span>
                          <span className="text-white">
                            SAR{" "}
                            {Number(
                              selectedBooking.pricing.vatAmount,
                            ).toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-neutral-700 font-semibold">
                        <span className="text-white">Total (Partner)</span>
                        <span className="text-luxury-gold">
                          SAR{" "}
                          {Number(
                            selectedBooking.pricing.totalPrice,
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Vendor Assignment */}
                  <div className="bg-neutral-800 rounded-xl p-4 mb-4">
                    <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-luxury-gold" /> Vendor
                      Assignment
                    </h3>

                    {/* Already-confirmed vendor block — shows the agreed
                        payout amount alongside the vendor and assets. Stage
                        3B: backend now exposes vendorPayoutAmount on the
                        assignment object so admin can see what was agreed. */}
                    {selectedBooking.vendorAssignment?.vendor &&
                    ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(
                      selectedBooking.status,
                    ) ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Vendor</span>
                          <span className="text-white">
                            {
                              selectedBooking.vendorAssignment.vendor
                                .companyName
                            }
                          </span>
                        </div>
                        {selectedBooking.vendorAssignment.vendor.rating && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Rating</span>
                            <span className="text-yellow-400">
                              ★{" "}
                              {Number(
                                selectedBooking.vendorAssignment.vendor.rating,
                              ).toFixed(1)}
                            </span>
                          </div>
                        )}
                        {selectedBooking.vendorAssignment.vendorPayoutAmount !=
                          null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Vendor Payout</span>
                            <span className="text-white">
                              SAR{" "}
                              {Number(
                                selectedBooking.vendorAssignment
                                  .vendorPayoutAmount,
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {selectedBooking.vendorAssignment.vehicle && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Vehicle</span>
                            <span className="text-white">
                              {selectedBooking.vendorAssignment.vehicle.name ||
                                selectedBooking.vendorAssignment.vehicle
                                  .plateNumber}
                            </span>
                          </div>
                        )}
                        {selectedBooking.vendorAssignment.driver && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Driver</span>
                            <span className="text-white">
                              {selectedBooking.vendorAssignment.driver.name}
                            </span>
                          </div>
                        )}

                        {/* Allow admin to record a rejection on the
                            confirmed vendor's behalf if the trip hasn't
                            started yet (vendor pulls out, calls admin
                            instead of using the app). Only relevant
                            before IN_PROGRESS / COMPLETED. */}
                        {selectedBooking.status === "CONFIRMED" && (
                          <button
                            onClick={() => setShowRejectionModal(true)}
                            className="mt-3 w-full py-2 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
                          >
                            Record Vendor Rejection (Offline)
                          </button>
                        )}
                      </div>
                    ) : selectedBooking.vendorAssignment?.vendor &&
                      (selectedBooking.status === "ASSIGNMENT_OFFERED" ||
                        selectedBooking.status === "ASSIGNMENT_RE_OFFERED") ? (
                      /* Offer-outstanding block — vendor has a pending
                         offer but hasn't accepted yet. Show payout +
                         offer/re-offer indicator + admin's "record
                         rejection" shortcut for offline declines. */
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Vendor</span>
                          <span className="text-white">
                            {
                              selectedBooking.vendorAssignment.vendor
                                .companyName
                            }
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Offer Status</span>
                          <span
                            className={
                              isReOfferState
                                ? "text-amber-400"
                                : "text-purple-400"
                            }
                          >
                            {isReOfferState
                              ? "Awaiting Re-offer Decision"
                              : "Awaiting Response"}
                          </span>
                        </div>
                        {selectedBooking.vendorAssignment.vendorPayoutAmount !=
                          null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">
                              Offered Payout
                            </span>
                            <span className="text-white">
                              SAR{" "}
                              {Number(
                                selectedBooking.vendorAssignment
                                  .vendorPayoutAmount,
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => setShowRejectionModal(true)}
                          className="mt-3 w-full py-2 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
                        >
                          Record Vendor Rejection (Offline)
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        No vendor assigned
                      </p>
                    )}

                    {/* Rejection history — show the audit trail of any
                        prior rejections so admin sees who's already
                        declined and the exact reasons. */}
                    {selectedBooking.vendorAssignment?.rejectionHistory
                      ?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-neutral-700">
                        <p className="text-xs text-gray-500 mb-2">
                          Rejection History
                        </p>
                        <div className="space-y-1.5">
                          {selectedBooking.vendorAssignment.rejectionHistory.map(
                            (r: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex justify-between text-xs"
                              >
                                <span className="text-gray-400">
                                  {r.vendorCompanyName || "Unknown"}
                                  {r.attemptNumber > 1 &&
                                    ` (attempt ${r.attemptNumber})`}
                                </span>
                                <span className="text-red-300">{r.reason}</span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                    {/* ============== ASSIGN VENDOR (new flow) ==============
                        Available when canAssignVendor is true AND we're
                        NOT in ASSIGNMENT_RE_OFFERED state (re-offer has
                        its own UI block below). */}
                    {selectedBooking.actions.canAssignVendor &&
                      !isReOfferState && (
                        <div className="mt-4 pt-4 border-t border-neutral-700">
                          {/* Three states:
                              1. Not yet loaded (first paint of a freshly
                                 selected booking before the auto-load
                                 fires, or after a manual reset) → show
                                 the Load button with the current count.
                              2. Loading → spinner.
                              3. Loaded → show the dropdown UI. If the
                                 result is empty the dropdown branch
                                 itself renders the "No eligible
                                 vendors" message inline — we do NOT
                                 fall back to the Load button, which
                                 would just loop. */}
                          {!vendorsLoaded && !isLoadingVendors ? (
                            <button
                              onClick={handleLoadVendors}
                              className="w-full py-2 bg-luxury-gold/20 text-luxury-gold text-sm rounded-lg hover:bg-luxury-gold/30 transition-colors"
                            >
                              Load Available Vendors (
                              {selectedBooking.availableVendors.count})
                            </button>
                          ) : isLoadingVendors ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="w-5 h-5 text-luxury-gold animate-spin" />
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                  Vendor
                                </label>
                                <select
                                  value={selectedVendorId}
                                  onChange={(e) =>
                                    setSelectedVendorId(e.target.value)
                                  }
                                  disabled={availableVendors.length === 0}
                                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold disabled:opacity-40"
                                >
                                  <option value="">
                                    {availableVendors.length === 0
                                      ? "No eligible vendors"
                                      : "Select vendor..."}
                                  </option>
                                  {availableVendors.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.displayText}
                                    </option>
                                  ))}
                                </select>
                                {availableVendors.length === 0 && (
                                  <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-300 space-y-1">
                                    <p className="font-medium">
                                      No eligible vendors found.
                                    </p>
                                    <p className="text-amber-400/80">
                                      All vendors with vehicles in this category
                                      either have expired documents (profile /
                                      vehicle / driver) through the trip date,
                                      no approved vehicles/drivers, or have
                                      already rejected this booking. Resolve
                                      expirations or wait for the pool to grow.
                                    </p>
                                    <button
                                      onClick={handleLoadVendors}
                                      className="mt-1 text-amber-300 underline hover:text-amber-200"
                                    >
                                      Retry
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Vendor Payout input (Stage 3B-required).
                                  Number input; backend validates > 0 and
                                  rejects missing values. */}
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">
                                  Vendor Payout (SAR)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={payoutAmount}
                                  onChange={(e) =>
                                    setPayoutAmount(e.target.value)
                                  }
                                  placeholder="Enter payout amount"
                                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold"
                                />
                              </div>

                              {/* 3-line margin breakdown. Recalculates as
                                  admin types. Negative margin shown red
                                  with warning text below but doesn't
                                  block submit (admin may accept loss for
                                  strategic reasons). */}
                              {payoutNumber !== null && (
                                <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-3 space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">
                                      Partner Price
                                    </span>
                                    <span className="text-white">
                                      SAR {partnerPrice.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">
                                      Vendor Payout
                                    </span>
                                    <span className="text-white">
                                      SAR{" "}
                                      {payoutNumber.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </span>
                                  </div>
                                  <div className="flex justify-between pt-1 border-t border-neutral-700">
                                    <span className="text-gray-400 font-medium">
                                      Margin
                                    </span>
                                    <span
                                      className={
                                        isMarginNegative
                                          ? "text-red-400 font-medium"
                                          : "text-green-400 font-medium"
                                      }
                                    >
                                      SAR{" "}
                                      {margin?.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{" "}
                                      ({marginPct?.toFixed(1)}%)
                                    </span>
                                  </div>
                                  {isMarginNegative && (
                                    <p className="text-xs text-red-400 mt-1">
                                      Warning: payout exceeds partner price.
                                      This is a loss.
                                    </p>
                                  )}
                                </div>
                              )}

                              <button
                                onClick={handleAssignVendor}
                                disabled={
                                  !selectedVendorId ||
                                  payoutNumber === null ||
                                  isAssigning
                                }
                                className="w-full py-2 bg-luxury-gold text-black text-sm font-semibold rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                              >
                                {isAssigning ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                                Send Offer to Vendor
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                    {/* ============== RE-OFFER UI ==============
                        Only shown when booking.status === ASSIGNMENT_RE_OFFERED.
                        Vendor previously declined for PRICE_TOO_LOW at
                        attempt 1; admin enters a revised price and triggers
                        an attempt-2 offer for the same vendor. */}
                    {isReOfferState &&
                      selectedBooking.vendorAssignment?.vendor && (
                        <div className="mt-4 pt-4 border-t border-neutral-700 space-y-3">
                          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                            <p className="text-sm text-amber-400 font-medium">
                              {
                                selectedBooking.vendorAssignment.vendor
                                  .companyName
                              }{" "}
                              declined for price
                            </p>
                            <p className="text-xs text-amber-300/80 mt-1">
                              Enter a revised payout to send a re-offer to the
                              same vendor. After this attempt, no further
                              re-offers — if vendor declines again, the booking
                              auto-cascades to the next eligible vendor.
                            </p>
                          </div>

                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              Revised Payout (SAR)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={reOfferPayoutAmount}
                              onChange={(e) =>
                                setReOfferPayoutAmount(e.target.value)
                              }
                              placeholder="Enter revised payout amount"
                              className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          {reOfferPayoutNumber !== null && (
                            <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-3 space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500">
                                  Partner Price
                                </span>
                                <span className="text-white">
                                  SAR {partnerPrice.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500">
                                  Revised Payout
                                </span>
                                <span className="text-white">
                                  SAR{" "}
                                  {reOfferPayoutNumber.toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    },
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between pt-1 border-t border-neutral-700">
                                <span className="text-gray-400 font-medium">
                                  Margin
                                </span>
                                <span
                                  className={
                                    isReOfferMarginNegative
                                      ? "text-red-400 font-medium"
                                      : "text-green-400 font-medium"
                                  }
                                >
                                  SAR{" "}
                                  {reOfferMargin?.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}{" "}
                                  ({reOfferMarginPct?.toFixed(1)}%)
                                </span>
                              </div>
                              {isReOfferMarginNegative && (
                                <p className="text-xs text-red-400 mt-1">
                                  Warning: payout exceeds partner price. This is
                                  a loss.
                                </p>
                              )}
                            </div>
                          )}

                          <button
                            onClick={handleReOffer}
                            disabled={
                              reOfferPayoutNumber === null || isReOffering
                            }
                            className="w-full py-2 bg-amber-500 text-black text-sm font-semibold rounded-lg hover:bg-amber-500/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                          >
                            {isReOffering ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                            Re-offer at Revised Price
                          </button>
                        </div>
                      )}
                  </div>

                  {/* Timeline */}
                  {selectedBooking.timeline &&
                    selectedBooking.timeline.length > 0 && (
                      <div className="bg-neutral-800 rounded-xl p-4 mb-4">
                        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-luxury-gold" />{" "}
                          Timeline
                        </h3>
                        <div className="space-y-3">
                          {selectedBooking.timeline.map(
                            (event: any, i: number) => (
                              <div key={i} className="flex items-start gap-3">
                                <div
                                  className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${event.completed ? "bg-luxury-gold" : "bg-neutral-600"}`}
                                />
                                <div>
                                  <p className="text-sm text-white">
                                    {event.status || event.label}
                                  </p>
                                  {event.date && (
                                    <p className="text-xs text-gray-500">
                                      {event.date}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                  {/* Actions */}
                  <div className="space-y-3">
                    {selectedBooking.actions.canCancel && (
                      <button
                        onClick={() => setShowCancelModal(true)}
                        className="w-full py-3 bg-red-500/20 text-red-400 font-medium rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/30 flex items-center justify-center gap-2"
                      >
                        <XCircle className="w-4 h-4" /> Cancel Booking
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCancelModal(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="p-5 border-b border-neutral-800">
              <h3 className="text-lg font-semibold text-white">
                Cancel Booking
              </h3>
              <p className="text-sm text-gray-400">
                {selectedBooking?.bookingRef}
              </p>
            </div>
            <div className="p-5">
              <label className="block text-sm text-gray-400 mb-2">
                Reason for cancellation *
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                placeholder="Enter reason..."
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason("");
                }}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCancelBooking}
                disabled={!cancelReason || isCancelling}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {isCancelling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Vendor Rejection Modal — admin-driven path for when a
          vendor declines via phone/email instead of using the app.
          Backend recordVendorRejection accepts the enum value and runs
          the same branching as the vendor's own reject endpoint
          (PRICE_TOO_LOW@1 → ASSIGNMENT_RE_OFFERED; otherwise cascade). */}
      {showRejectionModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowRejectionModal(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl">
            <div className="p-5 border-b border-neutral-800">
              <h3 className="text-lg font-semibold text-white">
                Record Vendor Rejection
              </h3>
              <p className="text-sm text-gray-400">
                {selectedBooking?.bookingRef} —{" "}
                {selectedBooking?.vendorAssignment?.vendor?.companyName}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-400">
                Use this when the vendor declined the offer offline (phone or
                email) instead of via the vendor portal. The system will handle
                the rest based on the reason.
              </p>
              <label className="block text-sm text-gray-400 mb-2">
                Rejection Reason
              </label>
              <select
                value={rejectionReason}
                onChange={(e) =>
                  setRejectionReason(e.target.value as RejectionReason)
                }
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold"
              >
                {REJECTION_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {rejectionReason === "PRICE_TOO_LOW" && (
                <p className="text-xs text-amber-400">
                  If this is the vendor's first rejection, you'll be able to
                  send a revised-price re-offer to the same vendor. Otherwise
                  the booking will cascade to the next eligible vendor.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => setShowRejectionModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordRejection}
                disabled={isRecordingRejection}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {isRecordingRejection ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Record Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
