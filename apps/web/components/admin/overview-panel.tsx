"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import {
  Building2,
  Handshake,
  CalendarDays,
  Wallet,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Users,
  Car,
  TrendingUp,
  AlertTriangle,
  AlertCircle,
  Clock,
  CreditCard,
  Bell,
  FileText,
  Crown,
  Briefcase,
  Truck,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";

const BASE = "/api/v1/admin/overview";

interface OverviewStats {
  totalVendors: number;
  activeVendors: number;
  totalPartners: number;
  activePartners: number;
  activeBookings: number;
  completedBookingsThisMonth: number;
  totalDrivers: number;
  totalVehicles: number;
  monthlyRevenue: number;
  totalCustomers: number;
}

interface RecentBooking {
  id: string;
  bookingRef: string;
  customer: string;
  vendor: string;
  partner: string | null;
  date: string;
  time: string | null;
  status: string;
  amount: number;
  vehicleClass: string | null;
  source: string | null;
  isUnread: boolean;
  needsAttention: boolean;
}

interface PaymentOverview {
  onlineReceived: number;
  pendingToVendors: number;
  pendingFromPartners: number;
  overduePartnerInvoices: number;
}

interface DocRow {
  entityType: "partner" | "vendor";
  entityId: string;
  entityName: string;
  docType: string; // "MOU" | "CR" | "VAT" | ...
  expiryDate: string;
  daysFromNow: number; // negative = N days ago
}

interface UnactionedBookingRow {
  id: string;
  bookingRef: string;
  tripDate: string;
  pickupAddress: string;
  dropoffAddress: string;
  status: string;
  source: string;
  customerLabel: string | null;
  hoursUntilTrip: number;
}

interface AlertsSummary {
  unactionedBookings: number;
  unreadBookings: number;
  needsAttentionBookings: number;
  pendingVendorReviews: number;
  pendingPartnerReviews: number;
  newVendorReceipts: number;
  overduePartnerInvoices: number;
  expiringMous: number;
  // New: per-doc detail for the hover popovers. expiredDocs are
  // already lapsed (red); expiringDocs are within 30 days (amber).
  // Each row carries entityId so clicks can deep-link directly.
  expiredDocsCount: number;
  expiringDocsCount: number;
  expiredDocs: DocRow[];
  expiringDocs: DocRow[];
  // Same idea for unactioned bookings — click a row to open it.
  unactionedBookingsList: UnactionedBookingRow[];
  totalAlerts: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================
// AlertPillWithPopover
//
// Reusable chip + hover-popover used inside the overview alerts
// banner. Mirrors the position:fixed approach from the portal's
// per-profile expiry chip (vendor/profile.tsx, partner/profile-
// panel.tsx) so the popover isn't clipped by any ancestor
// overflow:hidden and stays inside the viewport on mobile.
//
// Generic over the row type — caller supplies items + how to
// render each row + what to do on row click. Keeps the chip
// dumb about whether it's listing docs or bookings.
// ============================================================
function AlertPillWithPopover<T>({
  pillIcon,
  pillLabel,
  pillClass,
  popoverTitle,
  emptyText,
  items,
  renderItem,
  onItemClick,
}: {
  pillIcon: React.ReactNode;
  pillLabel: React.ReactNode;
  pillClass: string;
  popoverTitle: string;
  emptyText: string;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  onItemClick?: (item: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Unique id so multiple instances of the popover can coexist on
  // the same banner without their outside-click handlers fighting.
  const popoverId = useRef(
    `alert-popover-${Math.random().toString(36).slice(2, 9)}`,
  );

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(360, window.innerWidth - 16);
    const margin = 8;
    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;
    let top = rect.bottom + 8;
    const estimatedHeight = 320;
    if (top + estimatedHeight > window.innerHeight - margin) {
      const above = rect.top - estimatedHeight - 8;
      if (above >= margin) top = above;
    }
    setPos({ top, left, width: popoverWidth });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const popover = document.getElementById(popoverId.current);
      if (popover?.contains(target)) return;
      setOpen(false);
    };
    const handleReflow = () => computePosition();
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    window.addEventListener("scroll", handleReflow, true);
    window.addEventListener("resize", handleReflow);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      window.removeEventListener("scroll", handleReflow, true);
      window.removeEventListener("resize", handleReflow);
    };
  }, [open, computePosition]);

  const handleOpen = () => {
    computePosition();
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg transition-colors ${pillClass}`}
        onMouseEnter={handleOpen}
        onMouseLeave={() => {
          // Delay so the user has time to move the cursor into the
          // popover without it dismissing. The popover's own
          // onMouseEnter cancels the close.
          setTimeout(() => {
            const popover = document.getElementById(popoverId.current);
            if (popover && popover.matches(":hover")) return;
            setOpen(false);
          }, 120);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else handleOpen();
        }}
      >
        {pillIcon}
        {pillLabel}
      </button>

      {open && pos && (
        <div
          id={popoverId.current}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: "min(60vh, 420px)",
          }}
          className="z-[100] p-3 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-y-auto"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <p className="text-xs font-medium text-white mb-2 px-1">
            {popoverTitle}
          </p>
          {items.length === 0 ? (
            <p className="text-xs text-gray-500 py-2 px-1">{emptyText}</p>
          ) : (
            <div className="space-y-1">
              {items.map((item, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    onItemClick?.(item);
                  }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-neutral-800 transition-colors group"
                >
                  {renderItem(item, i)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function OverviewPanel({
  onTabChange,
}: {
  // Deep-link option: when navigating from a popover row, pass an
  // identifier so the destination panel can auto-open that entity.
  // The admin page consumes the second argument and routes it to
  // the relevant management panel as an initial-open prop.
  onTabChange?: (
    tab: string,
    deepLink?: {
      openVendorId?: string;
      openPartnerId?: string;
      openBookingId?: string;
    },
  ) => void;
}) {
  const { showNotification } = useNotification();

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [bookings, setBookings] = useState<RecentBooking[]>([]);
  const [bookingPagination, setBookingPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [payments, setPayments] = useState<PaymentOverview | null>(null);
  const [alerts, setAlerts] = useState<AlertsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsRes, bookingsRes, paymentsRes, alertsRes] = await Promise.all(
        [
          api.get(`${BASE}/stats`),
          api.get(`${BASE}/recent-bookings`, { page: 1, limit: 10 }),
          api.get(`${BASE}/payment-summary`),
          api.get(`${BASE}/alerts-summary`),
        ],
      );
      if (statsRes.success) setStats(statsRes.data);
      if (bookingsRes.success && bookingsRes.data) {
        setBookings(bookingsRes.data.bookings || []);
        setBookingPagination(
          bookingsRes.data.pagination || {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
          },
        );
      }
      if (paymentsRes.success) setPayments(paymentsRes.data);
      if (alertsRes.success) setAlerts(alertsRes.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  const fetchBookings = useCallback(async (page: number) => {
    try {
      const res = await api.get(`${BASE}/recent-bookings`, { page, limit: 10 });
      if (res.success && res.data) {
        setBookings(res.data.bookings || []);
        setBookingPagination(
          res.data.pagination || {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
          },
        );
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const nav = (tab: string) => onTabChange?.(tab);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "in-progress":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
      case "completed":
        return "bg-green-500/10 text-green-400 border-green-500/30";
      case "cancelled":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      case "pending":
        return "bg-orange-500/10 text-orange-400 border-orange-500/30";
      case "awaiting-vendor":
        return "bg-purple-500/10 text-purple-400 border-purple-500/30";
      default:
        return "bg-neutral-800 text-gray-400";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ============== ALERTS BANNER ==============
          Each pill is a button that shows a count and (where
          relevant) a hover popover with the underlying detail.
          Clicking a row in the popover deep-links to the specific
          entity (vendor, partner, or booking) — much faster than
          navigating to the section and then hunting for the row.

          Severity colors:
            red    → expired docs, unactioned bookings (highest)
            amber  → expiring docs (≤30d), overdue invoices
            yellow → pending vendor reviews
            blue   → pending partner reviews
          The banner only renders when totalAlerts > 0 so it's
          invisible in steady-state. */}
      {alerts && alerts.totalAlerts > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-4 bg-neutral-900 border border-red-500/20 rounded-xl">
          <Bell className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {/* Unactioned bookings — red, hover for booking list,
                click a row to open that specific booking. */}
            {alerts.unactionedBookings > 0 && (
              <AlertPillWithPopover
                pillIcon={<AlertTriangle className="w-3.5 h-3.5" />}
                pillLabel={
                  <span>
                    {alerts.unactionedBookings} unactioned booking
                    {alerts.unactionedBookings > 1 ? "s" : ""}
                  </span>
                }
                pillClass="bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                popoverTitle="Unactioned Bookings — Trip in ≤24h"
                emptyText="No bookings to action right now."
                items={alerts.unactionedBookingsList}
                onItemClick={(b) =>
                  onTabChange?.("bookings", { openBookingId: b.id })
                }
                renderItem={(b) => (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white truncate">
                        {b.bookingRef}
                        {b.customerLabel ? ` · ${b.customerLabel}` : ""}
                      </p>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
                          b.hoursUntilTrip <= 0
                            ? "bg-red-500/20 text-red-300 border-red-500/30"
                            : b.hoursUntilTrip <= 6
                              ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
                              : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                        }`}
                      >
                        {b.hoursUntilTrip <= 0
                          ? "overdue"
                          : `${b.hoursUntilTrip}h`}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">
                      {b.pickupAddress} → {b.dropoffAddress}
                    </p>
                  </div>
                )}
              />
            )}

            {/* Expired documents — red. MOU + all other docs across
                both partners and vendors. Click a row to jump to
                the relevant entity. */}
            {alerts.expiredDocsCount > 0 && (
              <AlertPillWithPopover
                pillIcon={<AlertCircle className="w-3.5 h-3.5" />}
                pillLabel={
                  <span>
                    {alerts.expiredDocsCount} document
                    {alerts.expiredDocsCount > 1 ? "s" : ""} expired
                  </span>
                }
                pillClass="bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                popoverTitle="Expired Documents"
                emptyText="No expired documents."
                items={alerts.expiredDocs}
                onItemClick={(d) =>
                  onTabChange?.(
                    d.entityType === "vendor" ? "vendors" : "partners",
                    d.entityType === "vendor"
                      ? { openVendorId: d.entityId }
                      : { openPartnerId: d.entityId },
                  )
                }
                renderItem={(d) => (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      {d.entityType === "vendor" ? (
                        <Truck className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      ) : (
                        <Briefcase className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">
                          {d.entityName}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {d.docType}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/20 text-red-300 border-red-500/30 whitespace-nowrap">
                      {Math.abs(d.daysFromNow)}d ago
                    </span>
                  </div>
                )}
              />
            )}

            {/* Expiring documents — amber. Same shape as expired,
                different urgency. */}
            {alerts.expiringDocsCount > 0 && (
              <AlertPillWithPopover
                pillIcon={<Clock className="w-3.5 h-3.5" />}
                pillLabel={
                  <span>
                    {alerts.expiringDocsCount} document
                    {alerts.expiringDocsCount > 1 ? "s" : ""} expiring
                  </span>
                }
                pillClass="bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                popoverTitle="Documents Expiring Within 30 Days"
                emptyText="No documents expiring soon."
                items={alerts.expiringDocs}
                onItemClick={(d) =>
                  onTabChange?.(
                    d.entityType === "vendor" ? "vendors" : "partners",
                    d.entityType === "vendor"
                      ? { openVendorId: d.entityId }
                      : { openPartnerId: d.entityId },
                  )
                }
                renderItem={(d) => (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      {d.entityType === "vendor" ? (
                        <Truck className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      ) : (
                        <Briefcase className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">
                          {d.entityName}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {d.docType}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/20 text-amber-300 border-amber-500/30 whitespace-nowrap">
                      {d.daysFromNow}d left
                    </span>
                  </div>
                )}
              />
            )}

            {/* Remaining static chips — these don't yet have detail
                lists, so they stay as simple navigate-to-section
                buttons. Easy follow-up to upgrade them later if
                useful. */}
            {alerts.overduePartnerInvoices > 0 && (
              <button
                onClick={() => nav("payments")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-lg hover:bg-orange-500/20 transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {alerts.overduePartnerInvoices} overdue invoice
                {alerts.overduePartnerInvoices > 1 ? "s" : ""}
              </button>
            )}
            {alerts.pendingVendorReviews > 0 && (
              <button
                onClick={() => nav("vendors")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/20 transition-colors"
              >
                <Clock className="w-3.5 h-3.5" />
                {alerts.pendingVendorReviews} vendor review
                {alerts.pendingVendorReviews > 1 ? "s" : ""}
              </button>
            )}
            {alerts.pendingPartnerReviews > 0 && (
              <button
                onClick={() => nav("partners")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 transition-colors"
              >
                <Handshake className="w-3.5 h-3.5" />
                {alerts.pendingPartnerReviews} partner review
                {alerts.pendingPartnerReviews > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-luxury-gold" />
              </div>
              <span className="text-sm text-gray-400">Vendors</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.activeVendors}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {stats.totalVendors} total · {stats.totalDrivers} drivers ·{" "}
              {stats.totalVehicles} vehicles
            </p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Handshake className="w-5 h-5 text-purple-400" />
              </div>
              <span className="text-sm text-gray-400">Partners</span>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.activePartners}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {stats.totalPartners} total · {stats.totalCustomers} customers
            </p>
          </div>
          <div className="bg-neutral-900 border border-blue-500/30 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-sm text-gray-400">Active Bookings</span>
            </div>
            <p className="text-2xl font-bold text-blue-400">
              {stats.activeBookings}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {stats.completedBookingsThisMonth} completed this month
            </p>
          </div>
          <div className="bg-neutral-900 border border-green-500/30 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-green-400" />
              </div>
              <span className="text-sm text-gray-400">Monthly Revenue</span>
            </div>
            <p className="text-2xl font-bold text-green-400">
              SAR {Number(stats.monthlyRevenue).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Payment Overview Cards */}
      {payments && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  Online Received (this month)
                </p>
                <p className="text-lg font-bold text-green-400">
                  SAR {Number(payments.onlineReceived).toLocaleString()}
                </p>
              </div>
              <CreditCard className="w-8 h-8 text-green-400/20" />
            </div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">Pending to Vendors</p>
                <p className="text-lg font-bold text-orange-400">
                  SAR {Number(payments.pendingToVendors).toLocaleString()}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-400/20" />
            </div>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  Pending from Partners
                </p>
                <p className="text-lg font-bold text-blue-400">
                  SAR {Number(payments.pendingFromPartners).toLocaleString()}
                </p>
                {payments.overduePartnerInvoices > 0 && (
                  <p className="text-xs text-red-400 mt-1">
                    {payments.overduePartnerInvoices} overdue
                  </p>
                )}
              </div>
              <Wallet className="w-8 h-8 text-blue-400/20" />
            </div>
          </div>
        </div>
      )}

      {/* Recent Bookings */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold">Recent Bookings</h3>
            <p className="text-sm text-gray-500">Latest booking activity</p>
          </div>
          <button
            onClick={() => nav("bookings")}
            className="text-sm text-luxury-gold hover:text-[#D4B978] flex items-center gap-1"
          >
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {bookings.length === 0 ? (
          <div className="text-center py-12">
            <CalendarDays className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-white font-medium">No bookings yet</p>
            <p className="text-sm text-gray-500">
              Bookings will appear here once customers start booking
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="overflow-x-auto hidden sm:block">
              <table className="w-full">
                <thead className="bg-neutral-800/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Booking
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Vendor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {bookings.map((b) => (
                    <tr
                      key={b.id}
                      className={`hover:bg-neutral-800/30 ${b.isUnread ? "bg-blue-500/5" : ""}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-luxury-gold font-mono">
                            {b.bookingRef}
                          </span>
                          {b.needsAttention && (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                          )}
                          {b.isUnread && (
                            <span className="w-2 h-2 bg-blue-400 rounded-full" />
                          )}
                        </div>
                        {b.partner && (
                          <p className="text-xs text-gray-500">{b.partner}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-white">
                        {b.customer}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {b.vendor}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {new Date(b.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {b.time && (
                          <span className="text-gray-600 ml-1">{b.time}</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(b.status)}`}
                        >
                          {b.status.replace(/-/g, " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-white font-medium">
                        SAR {Number(b.amount).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden space-y-3 p-4">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className={`bg-neutral-800 rounded-xl p-4 border ${b.isUnread ? "border-blue-500/30" : "border-neutral-700"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-luxury-gold text-sm font-mono">
                        {b.bookingRef}
                      </span>
                      {b.needsAttention && (
                        <AlertTriangle className="w-3 h-3 text-red-400" />
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(b.status)}`}
                    >
                      {b.status.replace(/-/g, " ")}
                    </span>
                  </div>
                  <p className="text-white text-sm">{b.customer}</p>
                  <p className="text-xs text-gray-500">{b.vendor}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-700">
                    <span className="text-xs text-gray-400">
                      {new Date(b.date).toLocaleDateString()}
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
        {bookingPagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {bookingPagination.page} of {bookingPagination.totalPages} (
              {bookingPagination.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchBookings(bookingPagination.page - 1)}
                disabled={bookingPagination.page === 1}
                className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => fetchBookings(bookingPagination.page + 1)}
                disabled={
                  bookingPagination.page >= bookingPagination.totalPages
                }
                className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => nav("vendors")}
          className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 transition-colors text-left"
        >
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5 text-luxury-gold" />
            <span className="text-white font-medium">Manage Vendors</span>
          </div>
          <p className="text-sm text-gray-400">
            {stats?.totalDrivers || 0} drivers · {stats?.totalVehicles || 0}{" "}
            vehicles
          </p>
        </button>
        <button
          onClick={() => nav("payments")}
          className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 transition-colors text-left"
        >
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="w-5 h-5 text-luxury-gold" />
            <span className="text-white font-medium">Payments</span>
          </div>
          <p className="text-sm text-gray-400">
            {payments
              ? `SAR ${Number(payments.pendingToVendors).toLocaleString()} pending to vendors`
              : "View payment status"}
          </p>
        </button>
        <button
          onClick={() => nav("settings")}
          className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 transition-colors text-left"
        >
          <div className="flex items-center gap-3 mb-2">
            <Bell className="w-5 h-5 text-luxury-gold" />
            <span className="text-white font-medium">Alerts & Settings</span>
          </div>
          <p className="text-sm text-gray-400">
            {alerts?.unactionedBookings || 0} unactioned bookings
          </p>
        </button>
      </div>
    </div>
  );
}
