"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  UserCheck,
  IdCard,
  Navigation,
  Flag,
  Receipt,
  Clock,
  CalendarClock,
  CalendarX,
  UserPlus,
  UserX,
  Sparkles,
  Bell,
  User,
  Car,
  FileText,
  Users,
  BellOff,
  Loader2,
  Download,
  ChevronRight,
  X,
  RefreshCw,
  Trash2,
  ChevronDown,
  MapPin,
  CreditCard,
  Building2,
  Phone,
  Mail,
  Calendar,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";
import { partnerApi } from "@/lib/api";

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "alert-triangle": AlertTriangle,
  "check-circle": CheckCircle,
  "check-circle-2": CheckCircle2,
  "x-circle": XCircle,
  "message-square": MessageSquare,
  "user-check": UserCheck,
  "id-card": IdCard,
  navigation: Navigation,
  flag: Flag,
  receipt: Receipt,
  clock: Clock,
  "calendar-clock": CalendarClock,
  "calendar-x": CalendarX,
  "user-plus": UserPlus,
  "user-x": UserX,
  sparkles: Sparkles,
  bell: Bell,
};

// Category config
const categories = [
  { id: "all", label: "All", icon: Bell },
  { id: "PROFILE", label: "Profile", icon: User },
  { id: "BOOKING", label: "Bookings", icon: Car },
  { id: "INVOICE", label: "Invoices", icon: Receipt },
  { id: "MOU", label: "MOU", icon: FileText },
  { id: "TEAM", label: "Team", icon: Users },
  { id: "SYSTEM", label: "System", icon: Sparkles },
];

// Severity styles
const severityStyles: Record<
  string,
  { icon: string; bg: string; border: string }
> = {
  success: {
    icon: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  warning: {
    icon: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  danger: {
    icon: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
  },
  info: {
    icon: "text-luxury-gold",
    bg: "bg-luxury-gold/10",
    border: "border-luxury-gold/20",
  },
};

// Time formatter
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Date grouping
function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  return "Earlier";
}

interface Notification {
  id: string;
  type: string;
  category: string;
  icon: string;
  severity: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data: Record<string, unknown>;
  cta: { label: string; route: string } | null;
}

interface CategoryCounts {
  PROFILE: number;
  BOOKING: number;
  INVOICE: number;
  MOU: number;
  TEAM: number;
  SYSTEM: number;
  all: number;
}

// Demo booking data
const demoBookingDetails = {
  id: "BK-2024-0892",
  status: "confirmed",
  guestName: "Mohammed Al-Faisal",
  guestPhone: "+966 50 123 4567",
  guestEmail: "mfaisal@acmecorp.sa",
  vehicle: "Mercedes S-Class",
  driver: "Ahmed Hassan",
  driverPhone: "+966 55 987 6543",
  pickupLocation: "King Khalid International Airport, Terminal 5",
  dropoffLocation: "Four Seasons Hotel, Riyadh",
  date: "2024-05-15",
  time: "09:00",
  fare: 450,
  reference: "ACME-REF-2024-0156",
};

// Demo invoice data
const demoInvoiceDetails = {
  id: "INV-2024-04",
  period: "April 2024",
  issueDate: "2024-05-01",
  dueDate: "2024-05-15",
  status: "pending",
  totalBookings: 42,
  subtotal: 43200,
  vat: 2400,
  total: 45600,
  bankDetails: {
    bankName: "Saudi National Bank",
    accountName: "LuxDrive Transportation LLC",
    iban: "SA44 2000 0001 2345 6789 0123",
    swift: "NCBKSAJE",
  },
  lineItems: [
    { description: "Business Sedan (28 trips)", amount: 25200 },
    { description: "First Class (8 trips)", amount: 12000 },
    { description: "Business SUV (6 trips)", amount: 6000 },
  ],
};

interface NotificationsPanelProps {
  onTabChange?: (
    tab:
      | "dashboard"
      | "book"
      | "bookings"
      | "invoices"
      | "profile"
      | "reports"
      | "notifications",
  ) => void;
  refreshBadges: () => void;
}

export default function NotificationsPanel({
  onTabChange,
  refreshBadges,
}: NotificationsPanelProps) {
  const { showNotification } = useNotification();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "read">(
    "all",
  );
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCounts>({
    PROFILE: 0,
    BOOKING: 0,
    INVOICE: 0,
    MOU: 0,
    TEAM: 0,
    SYSTEM: 0,
    all: 0,
  });

  // Modal states
  const [bookingModal, setBookingModal] = useState<{
    open: boolean;
    data: typeof demoBookingDetails | null;
  }>({ open: false, data: null });
  const [invoiceModal, setInvoiceModal] = useState<{
    open: boolean;
    data: typeof demoInvoiceDetails | null;
  }>({ open: false, data: null });
  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    invoiceId: string;
    amount: number;
    dueDate: string;
  }>({ open: false, invoiceId: "", amount: 0, dueDate: "" });

  // Load notifications
  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = { page: 1, limit: 50 };
      if (activeCategory !== "all") params.category = activeCategory;
      if (statusFilter !== "all") params.status = statusFilter;

      const res = await partnerApi.getNotifications(params);
      if (res.data) {
        setNotifications(res.data.notifications || []);
        setCategoryCounts(
          res.data.categoryCounts || {
            PROFILE: 0,
            BOOKING: 0,
            INVOICE: 0,
            MOU: 0,
            TEAM: 0,
            SYSTEM: 0,
            all: 0,
          },
        );
      }
    } catch {
      showNotification("error", "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [activeCategory, statusFilter, showNotification]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Mark as read
  const markAsRead = async (id: string) => {
    try {
      await partnerApi.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      // Decrement local counts
      const notif = notifications.find((n) => n.id === id);
      if (notif && !notif.isRead) {
        setCategoryCounts((prev) => ({
          ...prev,
          [notif.category]: Math.max(
            0,
            (prev[notif.category as keyof CategoryCounts] as number) - 1,
          ),
          all: Math.max(0, prev.all - 1),
        }));
      }
      refreshBadges();
    } catch {}
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      const body =
        activeCategory !== "all" ? { category: activeCategory } : undefined;
      await partnerApi.markAllNotificationsAsRead(body);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setCategoryCounts({
        PROFILE: 0,
        BOOKING: 0,
        INVOICE: 0,
        MOU: 0,
        TEAM: 0,
        SYSTEM: 0,
        all: 0,
      });
      showNotification("success", "All notifications marked as read");
      refreshBadges();
    } catch {
      showNotification("error", "Failed to mark all as read");
    }
  };

  // Dismiss notification
  const dismissNotification = async (id: string) => {
    try {
      await partnerApi.dismissNotification(id);
      const notif = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (notif && !notif.isRead) {
        setCategoryCounts((prev) => ({
          ...prev,
          [notif.category]: Math.max(
            0,
            (prev[notif.category as keyof CategoryCounts] as number) - 1,
          ),
          all: Math.max(0, prev.all - 1),
        }));
      }
      refreshBadges();
    } catch {}
  };

  // Handle CTA click
  const handleCtaClick = (notif: Notification) => {
    markAsRead(notif.id);
    if (!notif.cta || !onTabChange) return;

    // Backend returns routes like "/partner/bookings", "/partner/profile", "/partner/invoices/xxx"
    // Extract the tab name from the route
    const route = notif.cta.route;

    if (route.includes("/bookings")) {
      onTabChange("bookings");
    } else if (route.includes("/invoices")) {
      onTabChange("invoices");
    } else if (route.includes("/profile")) {
      onTabChange("profile");
    } else if (route.includes("/dashboard")) {
      onTabChange("dashboard");
    }
  };

  const clearAllRead = async () => {
    try {
      await partnerApi.clearReadNotifications();
      setNotifications((prev) => prev.filter((n) => !n.isRead));
      showNotification("success", "Read notifications cleared");
      refreshBadges();
    } catch {
      showNotification("error", "Failed to clear notifications");
    }
  };

  // Download invoice
  const downloadInvoice = () => {
    showNotification("success", "Invoice download started");
  };

  // Group notifications by date
  const groupedNotifications = notifications.reduce<
    Record<string, Notification[]>
  >((acc, n) => {
    const group = getDateGroup(n.createdAt);
    if (!acc[group]) acc[group] = [];
    acc[group].push(n);
    return acc;
  }, {});

  const groupOrder = ["Today", "Yesterday", "This Week", "Earlier"];
  const totalUnread = categoryCounts.all;
  const activeCat = categories.find((c) => c.id === activeCategory);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-white">Notifications</h1>
          {totalUnread > 0 && (
            <span className="px-2.5 py-1 bg-luxury-gold text-black text-xs font-semibold rounded-full">
              {totalUnread} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={markAllAsRead}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Mark all read
          </button>
          <button
            onClick={clearAllRead}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Clear read
          </button>
          <button
            onClick={() => loadNotifications()}
            className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-neutral-900 border border-neutral-800 rounded-xl">
        {/* Category dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
            className="flex items-center gap-2 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white hover:border-neutral-600 transition-colors"
          >
            {activeCat && (
              <activeCat.icon className="w-4 h-4 text-luxury-gold" />
            )}
            <span>{activeCat?.label || "All"}</span>
            {activeCategory !== "all" &&
              categoryCounts[activeCategory as keyof CategoryCounts] > 0 && (
                <span className="px-1.5 py-0.5 bg-luxury-gold/20 text-luxury-gold text-xs rounded">
                  {categoryCounts[activeCategory as keyof CategoryCounts]}
                </span>
              )}
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {showCategoryDropdown && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowCategoryDropdown(false)}
              />
              <div className="absolute top-full left-0 mt-2 w-48 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-20 py-1">
                {categories.map((cat) => {
                  const count =
                    cat.id === "all"
                      ? categoryCounts.all
                      : categoryCounts[cat.id as keyof CategoryCounts];
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setActiveCategory(cat.id);
                        setShowCategoryDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
                        activeCategory === cat.id
                          ? "bg-luxury-gold/10 text-luxury-gold"
                          : "text-gray-300 hover:bg-neutral-800 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <cat.icon className="w-4 h-4" />
                        {cat.label}
                      </span>
                      {count > 0 && (
                        <span className="text-xs text-gray-500">{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-neutral-700" />

        {/* Status filters */}
        <div className="flex items-center gap-1">
          {(["all", "unread", "read"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                statusFilter === status
                  ? "bg-luxury-gold text-black font-medium"
                  : "text-gray-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && notifications.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-neutral-900 border border-neutral-800 rounded-xl">
          <BellOff className="w-16 h-16 text-luxury-gold/30 mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">All caught up</h3>
          <p className="text-gray-400">
            No{" "}
            {activeCategory === "all"
              ? ""
              : activeCat?.label.toLowerCase() + " "}
            notifications right now.
          </p>
        </div>
      )}

      {/* Notification feed */}
      {!loading && notifications.length > 0 && (
        <div className="space-y-6">
          {groupOrder.map((group) => {
            const items = groupedNotifications[group];
            if (!items?.length) return null;

            return (
              <div key={group}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-medium text-luxury-gold uppercase tracking-wider">
                    {group}
                  </span>
                  <div className="flex-1 h-px bg-neutral-800" />
                </div>

                <div className="space-y-3">
                  {items.map((notif) => {
                    const Icon = iconMap[notif.icon] || Bell;
                    const severity =
                      severityStyles[notif.severity] || severityStyles.info;

                    return (
                      <div
                        key={notif.id}
                        className={`group rounded-xl border p-4 sm:p-5 transition-all duration-200 hover:border-luxury-gold/30 ${
                          notif.isRead
                            ? "bg-neutral-900 border-neutral-800"
                            : "bg-luxury-gold/5 border-l-4 border-l-luxury-gold border-t border-r border-b border-neutral-800"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${severity.bg} ${severity.border} border`}
                          >
                            <Icon className={`w-5 h-5 ${severity.icon}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-medium text-white">
                                {notif.title}
                              </h4>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {!notif.isRead && (
                                  <span className="w-2 h-2 bg-luxury-gold rounded-full" />
                                )}
                                <span className="text-xs text-gray-500">
                                  {formatTime(notif.createdAt)}
                                </span>
                              </div>
                            </div>
                            <p className="text-gray-400 text-sm mb-3">
                              {notif.message}
                            </p>

                            <div className="flex flex-wrap items-center justify-between gap-3">
                              {notif.cta && (
                                <button
                                  onClick={() => handleCtaClick(notif)}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-luxury-gold text-black text-sm font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors"
                                >
                                  {notif.cta.label}
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              )}
                              <div className="flex items-center gap-3 ml-auto">
                                {!notif.isRead && (
                                  <button
                                    onClick={() => markAsRead(notif.id)}
                                    className="text-xs text-gray-500 hover:text-white transition-colors"
                                  >
                                    Mark read
                                  </button>
                                )}
                                <button
                                  onClick={() => dismissNotification(notif.id)}
                                  className="text-xs text-gray-500 hover:text-white transition-colors"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Booking Details Modal */}
      {bookingModal.open && bookingModal.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Booking Details
                </h2>
                <p className="text-sm text-luxury-gold">
                  #{bookingModal.data.id}
                </p>
              </div>
              <button
                onClick={() => setBookingModal({ open: false, data: null })}
                className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-400 font-medium">
                  Confirmed
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Date
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-luxury-gold" />
                    {bookingModal.data.date}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Time
                  </p>
                  <p className="text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-luxury-gold" />
                    {bookingModal.data.time}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider">
                  Vehicle
                </p>
                <p className="text-white flex items-center gap-2">
                  <Car className="w-4 h-4 text-luxury-gold" />
                  {bookingModal.data.vehicle}
                </p>
              </div>

              <div className="p-4 bg-neutral-800/50 rounded-lg space-y-3">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Pickup
                  </p>
                  <p className="text-white text-sm flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    {bookingModal.data.pickupLocation}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Dropoff
                  </p>
                  <p className="text-white text-sm flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    {bookingModal.data.dropoffLocation}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-neutral-800/50 rounded-lg">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Guest
                  </p>
                  <p className="text-white text-sm">
                    {bookingModal.data.guestName}
                  </p>
                  <p className="text-gray-400 text-xs flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {bookingModal.data.guestPhone}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Driver
                  </p>
                  <p className="text-white text-sm">
                    {bookingModal.data.driver}
                  </p>
                  <p className="text-gray-400 text-xs flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {bookingModal.data.driverPhone}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-luxury-gold/10 border border-luxury-gold/20 rounded-lg">
                <span className="text-gray-300">Total Fare</span>
                <span className="text-xl font-semibold text-luxury-gold">
                  SAR {bookingModal.data.fare.toLocaleString()}
                </span>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Reference: {bookingModal.data.reference}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Details Modal */}
      {invoiceModal.open && invoiceModal.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <div>
                <h2 className="text-lg font-semibold text-white">Invoice</h2>
                <p className="text-sm text-luxury-gold">
                  #{invoiceModal.data.id}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadInvoice}
                  className="flex items-center gap-2 px-3 py-1.5 bg-luxury-gold text-black text-sm font-medium rounded-lg hover:bg-luxury-gold/90"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => setInvoiceModal({ open: false, data: null })}
                  className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Period
                  </p>
                  <p className="text-white">{invoiceModal.data.period}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Issue Date
                  </p>
                  <p className="text-white">{invoiceModal.data.issueDate}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    Due Date
                  </p>
                  <p className="text-white">{invoiceModal.data.dueDate}</p>
                </div>
              </div>

              <div className="border border-neutral-800 rounded-lg overflow-hidden">
                <div className="p-3 bg-neutral-800/50 text-xs text-gray-400 uppercase tracking-wider font-medium">
                  Line Items ({invoiceModal.data.totalBookings} bookings)
                </div>
                <div className="divide-y divide-neutral-800">
                  {invoiceModal.data.lineItems.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3"
                    >
                      <span className="text-sm text-gray-300">
                        {item.description}
                      </span>
                      <span className="text-sm text-white">
                        SAR {item.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 p-4 bg-neutral-800/50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="text-white">
                    SAR {invoiceModal.data.subtotal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">VAT (15%)</span>
                  <span className="text-white">
                    SAR {invoiceModal.data.vat.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-neutral-700">
                  <span className="text-white font-medium">Total</span>
                  <span className="text-xl font-semibold text-luxury-gold">
                    SAR {invoiceModal.data.total.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-luxury-gold/5 border border-luxury-gold/20 rounded-lg space-y-2">
                <p className="text-sm font-medium text-luxury-gold flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Bank Transfer Details
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">Bank</p>
                    <p className="text-white">
                      {invoiceModal.data.bankDetails.bankName}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Account Name</p>
                    <p className="text-white">
                      {invoiceModal.data.bankDetails.accountName}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-gray-500 text-xs">IBAN</p>
                    <p className="text-white font-mono text-xs">
                      {invoiceModal.data.bankDetails.iban}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">SWIFT</p>
                    <p className="text-white font-mono">
                      {invoiceModal.data.bankDetails.swift}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Details Modal (for overdue invoices) */}
      {paymentModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Payment Required
                </h2>
                <p className="text-sm text-red-400">
                  Invoice #{paymentModal.invoiceId}
                </p>
              </div>
              <button
                onClick={() =>
                  setPaymentModal({
                    open: false,
                    invoiceId: "",
                    amount: 0,
                    dueDate: "",
                  })
                }
                className="p-2 text-gray-400 hover:text-white hover:bg-neutral-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-red-400 font-medium">Payment Overdue</p>
                  <p className="text-sm text-gray-400">
                    Due date was {paymentModal.dueDate}
                  </p>
                </div>
              </div>

              <div className="text-center py-4">
                <p className="text-gray-400 text-sm mb-1">Amount Due</p>
                <p className="text-3xl font-bold text-white">
                  SAR {paymentModal.amount.toLocaleString()}
                </p>
              </div>

              <div className="p-4 bg-luxury-gold/5 border border-luxury-gold/20 rounded-lg space-y-3">
                <p className="text-sm font-medium text-luxury-gold flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Bank Transfer Details
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Bank</span>
                    <span className="text-white">Saudi National Bank</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Account Name</span>
                    <span className="text-white">
                      LuxDrive Transportation LLC
                    </span>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">IBAN</p>
                    <p className="text-white font-mono text-xs bg-neutral-800 px-2 py-1 rounded">
                      SA44 2000 0001 2345 6789 0123
                    </p>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">SWIFT</span>
                    <span className="text-white font-mono">NCBKSAJE</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Reference</span>
                    <span className="text-luxury-gold font-mono">
                      {paymentModal.invoiceId}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-neutral-800/50 rounded-lg">
                <Mail className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-400">
                  After making the transfer, please email your payment
                  confirmation to{" "}
                  <span className="text-luxury-gold">finance@luxdrive.sa</span>{" "}
                  with invoice number as reference.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
