"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Bell,
  Gift,
  MessageSquare,
  AlertTriangle,
  Save,
  Phone,
  Car,
  Crown,
  Award,
  Percent,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  Clock,
  AlertCircle,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  Eye,
  Zap,
  Star,
  Users,
  MapPin,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";

const BASE = "/api/v1/admin/alerts-settings";

// ============== TYPES ==============

interface UnactionedBooking {
  id: string;
  bookingRef: string;
  customerName: string;
  customerPhone: string | null;
  tripDate: string;
  tripTime: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  vehicleClass: string | null;
  totalPrice: number | null;
  status: string;
  source: string | null;
  partner: { id: string; companyName: string } | null;
  hoursLeft: number;
  minutesLeft: number;
  urgencyLevel: "OVERDUE" | "CRITICAL" | "URGENT" | "WARNING";
}

interface VendorOption {
  id: string;
  companyName: string;
  rating: number | null;
  contactPerson: string | null;
  contactPhone: string | null;
  matchingVehicles: Array<{
    id: string;
    make: string;
    model: string;
    plateNumber: string;
    year: number;
    driver: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
    } | null;
  }>;
  totalBookings: number;
}

interface LoyaltyConfig {
  pointsPerSar: number;
  isPointsEnabled: boolean;
  birthdayDiscountPercent: number;
  isBirthdayDiscountEnabled: boolean;
  tierThresholds: { silver: number; gold: number; platinum: number };
  freeRideRedemption: {
    economySedan: number;
    businessSedan: number;
    firstClass: number;
    businessSuv: number;
  };
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

export default function AdminSettingsPanel() {
  const { showNotification } = useNotification();
  const [activeSection, setActiveSection] = useState<
    "alerts" | "loyalty" | "whatsapp"
  >("alerts");

  // ============== UNACTIONED BOOKINGS STATE ==============
  const [bookings, setBookings] = useState<UnactionedBooking[]>([]);
  const [bookingPagination, setBookingPagination] =
    useState<Pagination>(defaultPagination);
  const [bookingSearch, setBookingSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [alertSummary, setAlertSummary] = useState({
    unactioned: 0,
    overdue: 0,
    total: 0,
  });
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);

  // Assign vendor modal
  const [assigningBooking, setAssigningBooking] =
    useState<UnactionedBooking | null>(null);
  const [availableVendors, setAvailableVendors] = useState<VendorOption[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // ============== LOYALTY STATE ==============
  const [loyalty, setLoyalty] = useState<LoyaltyConfig | null>(null);
  const [loyaltyStats, setLoyaltyStats] = useState<{
    totalCustomers: number;
    tierCounts: Record<string, number>;
  } | null>(null);
  const [isLoadingLoyalty, setIsLoadingLoyalty] = useState(true);
  const [isSavingLoyalty, setIsSavingLoyalty] = useState(false);
  const [loyaltyDraft, setLoyaltyDraft] = useState<LoyaltyConfig | null>(null);

  // ============== WHATSAPP STATE ==============
  const [waTemplate, setWaTemplate] = useState("");
  const [waEnabled, setWaEnabled] = useState(true);
  const [waPreview, setWaPreview] = useState("");
  const [waPlaceholders, setWaPlaceholders] = useState<
    Array<{ key: string; description: string }>
  >([]);
  const [isLoadingWa, setIsLoadingWa] = useState(true);
  const [isSavingWa, setIsSavingWa] = useState(false);

  // ============== FETCH FUNCTIONS ==============

  const fetchAlertSummary = useCallback(async () => {
    try {
      const res = await api.get(`${BASE}/unactioned-bookings/summary`);
      if (res.success && res.data) {
        setAlertSummary({
          unactioned: res.data.unactionedBookings || 0,
          overdue: res.data.overdueBookings || 0,
          total: res.data.totalNeedingAction || 0,
        });
      }
    } catch {
      /* silent */
    }
  }, []);

  const fetchUnactionedBookings = useCallback(
    async (page = 1, search = "", urgency = "all") => {
      setIsLoadingBookings(true);
      try {
        const params: any = { page, limit: 10 };
        if (search) params.search = search;
        if (urgency !== "all") params.urgency = urgency;
        const res = await api.get(`${BASE}/unactioned-bookings`, params);
        if (res.success && res.data) {
          setBookings(res.data.bookings || []);
          setBookingPagination(res.data.pagination || defaultPagination);
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load bookings");
      } finally {
        setIsLoadingBookings(false);
      }
    },
    [showNotification],
  );

  const fetchLoyaltyConfig = useCallback(async () => {
    setIsLoadingLoyalty(true);
    try {
      const res = await api.get(`${BASE}/loyalty`);
      if (res.success && res.data) {
        const c = res.data.config;
        const config: LoyaltyConfig = {
          pointsPerSar: c.pointsPerSar,
          isPointsEnabled: c.isPointsEnabled,
          birthdayDiscountPercent: c.birthdayDiscountPercent,
          isBirthdayDiscountEnabled: c.isBirthdayDiscountEnabled,
          tierThresholds: c.tierThresholds,
          freeRideRedemption: c.freeRideRedemption,
        };
        setLoyalty(config);
        setLoyaltyDraft(JSON.parse(JSON.stringify(config)));
        setLoyaltyStats(res.data.stats || null);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load loyalty config");
    } finally {
      setIsLoadingLoyalty(false);
    }
  }, [showNotification]);

  const fetchWhatsApp = useCallback(async () => {
    setIsLoadingWa(true);
    try {
      const res = await api.get(`${BASE}/whatsapp`);
      if (res.success && res.data) {
        setWaTemplate(res.data.template || "");
        setWaEnabled(res.data.isEnabled ?? true);
        setWaPlaceholders(res.data.availablePlaceholders || []);
      }
    } catch (err: any) {
      showNotification(
        "error",
        err.message || "Failed to load WhatsApp config",
      );
    } finally {
      setIsLoadingWa(false);
    }
  }, [showNotification]);

  // Initial load per section
  useEffect(() => {
    if (activeSection === "alerts") {
      fetchAlertSummary();
      fetchUnactionedBookings(1);
    } else if (activeSection === "loyalty") fetchLoyaltyConfig();
    else fetchWhatsApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  // Search + filter debounce
  useEffect(() => {
    if (activeSection !== "alerts") return;
    const timer = setTimeout(
      () => fetchUnactionedBookings(1, bookingSearch, urgencyFilter),
      400,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingSearch, urgencyFilter]);

  // ============== ACTIONS ==============

  const handleOpenAssign = async (booking: UnactionedBooking) => {
    setAssigningBooking(booking);
    setSelectedVendorId("");
    setSelectedVehicleId("");
    setSelectedDriverId("");
    setIsLoadingVendors(true);
    try {
      const res = await api.get(
        `${BASE}/unactioned-bookings/${booking.id}/available-vendors`,
      );
      if (res.success && res.data) setAvailableVendors(res.data.vendors || []);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load vendors");
    } finally {
      setIsLoadingVendors(false);
    }
  };

  const handleAssignVendor = async () => {
    if (!assigningBooking || !selectedVendorId) return;
    setIsAssigning(true);
    try {
      const res = await api.patch(
        `${BASE}/unactioned-bookings/${assigningBooking.id}/assign-vendor`,
        {
          vendorId: selectedVendorId,
          vehicleId: selectedVehicleId || undefined,
          driverId: selectedDriverId || undefined,
        },
      );
      if (res.success) {
        showNotification("success", res.message || "Vendor assigned");
        setAssigningBooking(null);
        fetchUnactionedBookings(
          bookingPagination.page,
          bookingSearch,
          urgencyFilter,
        );
        fetchAlertSummary();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to assign");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleSaveLoyalty = async () => {
    if (!loyaltyDraft) return;
    setIsSavingLoyalty(true);
    try {
      const res = await api.post(`${BASE}/loyalty/save`, {
        pointsPerSar: loyaltyDraft.pointsPerSar,
        isPointsEnabled: loyaltyDraft.isPointsEnabled,
        birthdayDiscountPercent: loyaltyDraft.birthdayDiscountPercent,
        isBirthdayDiscountEnabled: loyaltyDraft.isBirthdayDiscountEnabled,
        tierThresholds: loyaltyDraft.tierThresholds,
        freeRideRedemption: loyaltyDraft.freeRideRedemption,
      });
      if (res.success) {
        showNotification("success", "Loyalty configuration saved");
        fetchLoyaltyConfig();
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save");
    } finally {
      setIsSavingLoyalty(false);
    }
  };

  const handleSaveWhatsApp = async () => {
    setIsSavingWa(true);
    try {
      const res = await api.put(`${BASE}/whatsapp/template`, {
        template: waTemplate,
      });
      if (res.success) showNotification("success", "WhatsApp template saved");
    } catch (err: any) {
      showNotification("error", err.message || "Failed to save");
    } finally {
      setIsSavingWa(false);
    }
  };

  const handleToggleWhatsApp = async () => {
    try {
      const res = await api.patch(`${BASE}/whatsapp/toggle`, {
        isEnabled: !waEnabled,
      });
      if (res.success) {
        setWaEnabled(!waEnabled);
        showNotification(
          "success",
          res.message || `WhatsApp ${!waEnabled ? "enabled" : "disabled"}`,
        );
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    }
  };

  const handlePreviewWhatsApp = async () => {
    try {
      const res = await api.get(`${BASE}/whatsapp/preview`);
      if (res.success && res.data) setWaPreview(res.data.preview || "");
    } catch {
      /* silent */
    }
  };

  // ============== URGENCY HELPERS ==============

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case "OVERDUE":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "CRITICAL":
        return "bg-red-500/10 text-red-400 border-red-500/30";
      case "URGENT":
        return "bg-orange-500/10 text-orange-400 border-orange-500/30";
      case "WARNING":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-neutral-800 text-gray-400";
    }
  };

  const getHoursDisplay = (b: UnactionedBooking) => {
    if (b.hoursLeft < 0) return `${Math.abs(Math.round(b.hoursLeft))}h overdue`;
    if (b.hoursLeft < 1) return `${b.minutesLeft}m left`;
    return `${Math.round(b.hoursLeft)}h left`;
  };

  const selectedVendor = availableVendors.find(
    (v) => v.id === selectedVendorId,
  );

  // ============== RENDER ==============

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveSection("alerts")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors whitespace-nowrap ${activeSection === "alerts" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
        >
          <Bell className="w-4 h-4" />
          Unactioned Bookings
          {alertSummary.total > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {alertSummary.total}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSection("loyalty")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors whitespace-nowrap ${activeSection === "loyalty" ? "bg-luxury-gold/20 text-luxury-gold border border-luxury-gold/30" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
        >
          <Gift className="w-4 h-4" />
          Loyalty Program
        </button>
        <button
          onClick={() => setActiveSection("whatsapp")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors whitespace-nowrap ${activeSection === "whatsapp" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
        >
          <MessageSquare className="w-4 h-4" />
          WhatsApp Template
        </button>
      </div>

      {/* ============== UNACTIONED BOOKINGS ============== */}
      {activeSection === "alerts" && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-neutral-900 border border-red-500/30 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <span className="text-sm text-gray-400">Overdue</span>
              </div>
              <p className="text-2xl font-bold text-red-400">
                {alertSummary.overdue}
              </p>
            </div>
            <div className="bg-neutral-900 border border-orange-500/30 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-orange-400" />
                </div>
                <span className="text-sm text-gray-400">Within 24hrs</span>
              </div>
              <p className="text-2xl font-bold text-orange-400">
                {alertSummary.unactioned}
              </p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center">
                  <Bell className="w-5 h-5 text-gray-400" />
                </div>
                <span className="text-sm text-gray-400">
                  Total Needing Action
                </span>
              </div>
              <p className="text-2xl font-bold text-white">
                {alertSummary.total}
              </p>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-neutral-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold">
                    Unactioned Bookings
                  </h3>
                  <p className="text-sm text-gray-500 hidden sm:block">
                    Bookings without vendor assignment approaching trip date
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={bookingSearch}
                    onChange={(e) => setBookingSearch(e.target.value)}
                    placeholder="Search..."
                    className="pl-9 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm w-40 sm:w-48 focus:outline-none focus:border-red-500/50"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all", label: "All" },
                  { key: "overdue", label: "Overdue" },
                  { key: "critical", label: "Critical (<6h)" },
                  { key: "urgent", label: "Urgent (<12h)" },
                  { key: "warning", label: "Warning (<24h)" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setUrgencyFilter(f.key)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${urgencyFilter === f.key ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-neutral-800 text-gray-400 hover:text-white"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {isLoadingBookings ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-white font-medium">All clear!</p>
                <p className="text-sm text-gray-500">No unactioned bookings</p>
              </div>
            ) : (
              <>
                {/* Desktop */}
                <div className="overflow-x-auto hidden sm:block">
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-neutral-800/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Booking
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Trip
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Route
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Vehicle
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Urgency
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
                          className={`hover:bg-neutral-800/30 ${b.urgencyLevel === "OVERDUE" ? "bg-red-500/5" : b.urgencyLevel === "CRITICAL" ? "bg-red-500/5" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <p className="text-luxury-gold text-sm font-mono">
                              {b.bookingRef}
                            </p>
                            {b.partner && (
                              <p className="text-xs text-gray-500">
                                {b.partner.companyName}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-white text-sm">
                              {b.customerName}
                            </p>
                            {b.customerPhone && (
                              <p className="text-xs text-gray-500">
                                {b.customerPhone}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-white text-sm">
                              {new Date(b.tripDate).toLocaleDateString()}
                            </p>
                            {b.tripTime && (
                              <p className="text-xs text-gray-500">
                                {b.tripTime}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-white text-sm truncate max-w-[150px]">
                              {b.pickupAddress || "—"}
                            </p>
                            <p className="text-xs text-gray-500 truncate max-w-[150px]">
                              → {b.dropoffAddress || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">
                            {b.vehicleClass?.replace(/_/g, " ") || "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 text-xs rounded-full border ${getUrgencyColor(b.urgencyLevel)}`}
                            >
                              {getHoursDisplay(b)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleOpenAssign(b)}
                              className="px-3 py-1.5 bg-luxury-gold/20 text-luxury-gold text-xs rounded-lg hover:bg-luxury-gold/30 transition-colors"
                            >
                              Assign Vendor
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile */}
                <div className="sm:hidden space-y-3 p-4">
                  {bookings.map((b) => (
                    <div
                      key={b.id}
                      className={`rounded-xl p-4 border ${b.urgencyLevel === "OVERDUE" || b.urgencyLevel === "CRITICAL" ? "bg-red-500/5 border-red-500/30" : "bg-neutral-800 border-neutral-700"}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-luxury-gold text-sm font-mono">
                          {b.bookingRef}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs rounded-full border ${getUrgencyColor(b.urgencyLevel)}`}
                        >
                          {getHoursDisplay(b)}
                        </span>
                      </div>
                      <p className="text-white text-sm font-medium">
                        {b.customerName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(b.tripDate).toLocaleDateString()}{" "}
                        {b.tripTime || ""}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {b.pickupAddress} → {b.dropoffAddress}
                      </p>
                      <div className="mt-3 pt-3 border-t border-neutral-700 flex items-center justify-between">
                        <span className="text-xs text-gray-400">
                          {b.vehicleClass?.replace(/_/g, " ")}
                        </span>
                        <button
                          onClick={() => handleOpenAssign(b)}
                          className="px-3 py-1.5 bg-luxury-gold/20 text-luxury-gold text-xs rounded-lg"
                        >
                          Assign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Pagination */}
            {bookingPagination.total > 0 && (
              <div className="px-4 sm:px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Showing{" "}
                  {(bookingPagination.page - 1) * bookingPagination.limit + 1}–
                  {Math.min(
                    bookingPagination.page * bookingPagination.limit,
                    bookingPagination.total,
                  )}{" "}
                  of {bookingPagination.total}
                </p>
                {bookingPagination.totalPages > 1 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        fetchUnactionedBookings(
                          bookingPagination.page - 1,
                          bookingSearch,
                          urgencyFilter,
                        )
                      }
                      disabled={bookingPagination.page === 1}
                      className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() =>
                        fetchUnactionedBookings(
                          bookingPagination.page + 1,
                          bookingSearch,
                          urgencyFilter,
                        )
                      }
                      disabled={
                        bookingPagination.page >= bookingPagination.totalPages
                      }
                      className="px-3 py-1.5 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============== LOYALTY PROGRAM ============== */}
      {activeSection === "loyalty" && (
        <div className="space-y-6">
          {isLoadingLoyalty ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
            </div>
          ) : (
            loyaltyDraft && (
              <>
                {/* Tier Stats */}
                {loyaltyStats && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                      <Users className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-white">
                        {loyaltyStats.totalCustomers}
                      </p>
                      <p className="text-xs text-gray-500">Total</p>
                    </div>
                    {["BRONZE", "SILVER", "GOLD", "PLATINUM"].map((tier) => (
                      <div
                        key={tier}
                        className={`bg-neutral-900 border rounded-xl p-4 text-center ${tier === "GOLD" ? "border-luxury-gold/30" : tier === "PLATINUM" ? "border-purple-500/30" : tier === "SILVER" ? "border-gray-500/30" : "border-neutral-800"}`}
                      >
                        <Crown
                          className={`w-5 h-5 mx-auto mb-1 ${tier === "GOLD" ? "text-luxury-gold" : tier === "PLATINUM" ? "text-purple-400" : tier === "SILVER" ? "text-gray-300" : "text-orange-400"}`}
                        />
                        <p className="text-lg font-bold text-white">
                          {loyaltyStats.tierCounts[tier] || 0}
                        </p>
                        <p className="text-xs text-gray-500">
                          {tier.charAt(0) + tier.slice(1).toLowerCase()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Points Per SAR */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
                        <Star className="w-5 h-5 text-luxury-gold" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">
                          Points Per SAR Spent
                        </h3>
                        <p className="text-sm text-gray-500">
                          How many points customers earn per SAR
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setLoyaltyDraft((d) =>
                          d ? { ...d, isPointsEnabled: !d.isPointsEnabled } : d,
                        )
                      }
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${loyaltyDraft.isPointsEnabled ? "bg-green-500/20 text-green-400" : "bg-neutral-800 text-gray-400"}`}
                    >
                      {loyaltyDraft.isPointsEnabled ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                      {loyaltyDraft.isPointsEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={loyaltyDraft.pointsPerSar}
                      onChange={(e) =>
                        setLoyaltyDraft((d) =>
                          d
                            ? {
                                ...d,
                                pointsPerSar: parseFloat(e.target.value) || 0,
                              }
                            : d,
                        )
                      }
                      className="w-32 px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold"
                    />
                    <span className="text-sm text-gray-400">
                      points per 1 SAR spent
                    </span>
                  </div>
                </div>

                {/* Birthday Discount */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-pink-500/10 flex items-center justify-center">
                        <Gift className="w-5 h-5 text-pink-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">
                          Birthday Discount
                        </h3>
                        <p className="text-sm text-gray-500">
                          Special discount on customer's birthday
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setLoyaltyDraft((d) =>
                          d
                            ? {
                                ...d,
                                isBirthdayDiscountEnabled:
                                  !d.isBirthdayDiscountEnabled,
                              }
                            : d,
                        )
                      }
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${loyaltyDraft.isBirthdayDiscountEnabled ? "bg-green-500/20 text-green-400" : "bg-neutral-800 text-gray-400"}`}
                    >
                      {loyaltyDraft.isBirthdayDiscountEnabled ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={loyaltyDraft.birthdayDiscountPercent}
                      onChange={(e) =>
                        setLoyaltyDraft((d) =>
                          d
                            ? {
                                ...d,
                                birthdayDiscountPercent:
                                  parseInt(e.target.value) || 0,
                              }
                            : d,
                        )
                      }
                      className="w-32 px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold"
                    />
                    <span className="text-sm text-gray-400">% discount</span>
                  </div>
                </div>

                {/* Tier Thresholds */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Award className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">
                        Tier Thresholds
                      </h3>
                      <p className="text-sm text-gray-500">
                        Points needed to reach each tier
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {(["silver", "gold", "platinum"] as const).map((tier) => (
                      <div key={tier} className="flex items-center gap-3">
                        <Crown
                          className={`w-5 h-5 flex-shrink-0 ${tier === "gold" ? "text-luxury-gold" : tier === "platinum" ? "text-purple-400" : "text-gray-300"}`}
                        />
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 capitalize mb-1 block">
                            {tier}
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={loyaltyDraft.tierThresholds[tier]}
                            onChange={(e) =>
                              setLoyaltyDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      tierThresholds: {
                                        ...d.tierThresholds,
                                        [tier]: parseInt(e.target.value) || 0,
                                      },
                                    }
                                  : d,
                              )
                            }
                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Free Ride Redemption */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Car className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">
                        Free Ride Redemption
                      </h3>
                      <p className="text-sm text-gray-500">
                        Points needed for a free ride by vehicle class
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {(
                      [
                        { key: "economySedan", label: "Economy Sedan" },
                        { key: "businessSedan", label: "Business Sedan" },
                        { key: "firstClass", label: "First Class" },
                        { key: "businessSuv", label: "Business SUV" },
                      ] as const
                    ).map((v) => (
                      <div key={v.key}>
                        <label className="text-xs text-gray-500 mb-1 block">
                          {v.label}
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={loyaltyDraft.freeRideRedemption[v.key]}
                          onChange={(e) =>
                            setLoyaltyDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    freeRideRedemption: {
                                      ...d.freeRideRedemption,
                                      [v.key]: parseInt(e.target.value) || 0,
                                    },
                                  }
                                : d,
                            )
                          }
                          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold"
                        />
                        <p className="text-xs text-gray-600 mt-1">points</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveLoyalty}
                    disabled={isSavingLoyalty}
                    className="flex items-center gap-2 px-6 py-2.5 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 transition-colors disabled:opacity-50"
                  >
                    {isSavingLoyalty ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save Loyalty Settings
                  </button>
                </div>
              </>
            )
          )}
        </div>
      )}

      {/* ============== WHATSAPP TEMPLATE ============== */}
      {activeSection === "whatsapp" && (
        <div className="space-y-6">
          {isLoadingWa ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
            </div>
          ) : (
            <>
              {/* Toggle */}
              <div className="flex items-center justify-between p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">
                      WhatsApp Notifications
                    </h3>
                    <p className="text-sm text-gray-500">
                      Send booking confirmations via WhatsApp
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleWhatsApp}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${waEnabled ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-neutral-800 text-gray-400 border border-neutral-700"}`}
                >
                  {waEnabled ? (
                    <ToggleRight className="w-5 h-5" />
                  ) : (
                    <ToggleLeft className="w-5 h-5" />
                  )}
                  {waEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              {/* Template Editor */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-3">
                  Booking Confirmation Template
                </h3>
                <textarea
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm font-mono resize-y focus:outline-none focus:border-green-500/50"
                  placeholder="Enter your WhatsApp template..."
                />
                <p className="text-xs text-gray-500 mt-2">
                  {waTemplate.length}/2000 characters
                </p>
              </div>

              {/* Placeholders */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-3">
                  Available Placeholders
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {waPlaceholders.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setWaTemplate((t) => t + " " + p.key)}
                      className="flex items-center justify-between p-3 bg-neutral-800 rounded-lg hover:bg-neutral-700 transition-colors text-left"
                    >
                      <code className="text-green-400 text-sm">{p.key}</code>
                      <span className="text-xs text-gray-500 ml-2">
                        {p.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold">Preview</h3>
                  <button
                    onClick={handlePreviewWhatsApp}
                    className="px-3 py-1.5 bg-green-500/20 text-green-400 text-xs rounded-lg hover:bg-green-500/30"
                  >
                    <Eye className="w-3 h-3 inline mr-1" /> Generate Preview
                  </button>
                </div>
                {waPreview ? (
                  <div className="bg-green-900/20 border border-green-500/20 rounded-lg p-4">
                    <p className="text-sm text-green-300 whitespace-pre-wrap">
                      {waPreview}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Click "Generate Preview" to see your template with sample
                    data
                  </p>
                )}
              </div>

              {/* Save */}
              <div className="flex justify-end">
                <button
                  onClick={handleSaveWhatsApp}
                  disabled={isSavingWa}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                >
                  {isSavingWa ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Template
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ============== ASSIGN VENDOR MODAL ============== */}
      {assigningBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setAssigningBooking(null)}
          />
          <div className="relative w-full max-w-lg mx-4 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-10">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Assign Vendor
                </h3>
                <p className="text-sm text-luxury-gold font-mono">
                  {assigningBooking.bookingRef}
                </p>
              </div>
              <button
                onClick={() => setAssigningBooking(null)}
                className="p-1 hover:bg-neutral-800 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Booking Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Customer</p>
                  <p className="text-sm text-white">
                    {assigningBooking.customerName}
                  </p>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Trip Date</p>
                  <p className="text-sm text-white">
                    {new Date(assigningBooking.tripDate).toLocaleDateString()}{" "}
                    {assigningBooking.tripTime || ""}
                  </p>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Vehicle Class</p>
                  <p className="text-sm text-white">
                    {assigningBooking.vehicleClass?.replace(/_/g, " ") || "—"}
                  </p>
                </div>
                <div className="bg-neutral-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Urgency</p>
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full border ${getUrgencyColor(assigningBooking.urgencyLevel)}`}
                  >
                    {getHoursDisplay(assigningBooking)}
                  </span>
                </div>
              </div>

              {/* Vendor Selection */}
              {isLoadingVendors ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
                </div>
              ) : availableVendors.length === 0 ? (
                <div className="text-center py-6">
                  <AlertCircle className="w-10 h-10 text-yellow-400 mx-auto mb-2" />
                  <p className="text-white font-medium">
                    No matching vendors found
                  </p>
                  <p className="text-sm text-gray-500">
                    No approved vendors have{" "}
                    {assigningBooking.vehicleClass?.replace(/_/g, " ")} vehicles
                    available
                  </p>
                </div>
              ) : (
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">
                    Select Vendor
                  </label>
                  <div className="space-y-2">
                    {availableVendors.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setSelectedVendorId(v.id);
                          setSelectedVehicleId("");
                          setSelectedDriverId("");
                        }}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedVendorId === v.id ? "bg-luxury-gold/10 border-luxury-gold/30" : "bg-neutral-800 border-neutral-700 hover:border-neutral-600"}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white text-sm font-medium">
                              {v.companyName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {v.matchingVehicles.length} matching vehicle(s) ·{" "}
                              {v.totalBookings} total bookings
                            </p>
                          </div>
                          {v.rating && (
                            <span className="text-xs text-luxury-gold">
                              ★ {Number(v.rating).toFixed(1)}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Vehicle & Driver Selection */}
              {selectedVendor && selectedVendor.matchingVehicles.length > 0 && (
                <div>
                  <label className="text-sm text-gray-400 mb-2 block">
                    Select Vehicle (optional)
                  </label>
                  <div className="space-y-2">
                    {selectedVendor.matchingVehicles.map((veh) => (
                      <button
                        key={veh.id}
                        onClick={() => {
                          setSelectedVehicleId(veh.id);
                          setSelectedDriverId(veh.driver?.id || "");
                        }}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedVehicleId === veh.id ? "bg-blue-500/10 border-blue-500/30" : "bg-neutral-800 border-neutral-700 hover:border-neutral-600"}`}
                      >
                        <p className="text-white text-sm">
                          {veh.make} {veh.model} ({veh.year})
                        </p>
                        <p className="text-xs text-gray-500">
                          {veh.plateNumber}
                        </p>
                        {veh.driver && (
                          <p className="text-xs text-green-400 mt-1">
                            Driver: {veh.driver.firstName} {veh.driver.lastName}{" "}
                            ({veh.driver.phone})
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-neutral-800">
              <button
                onClick={() => setAssigningBooking(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignVendor}
                disabled={!selectedVendorId || isAssigning}
                className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-black font-semibold rounded-lg hover:bg-luxury-gold/90 disabled:opacity-50 transition-colors"
              >
                {isAssigning ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Assign Vendor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
