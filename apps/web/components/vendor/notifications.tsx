"use client";

import { useState, useEffect, useCallback } from "react";
import { vendorApi } from "@/lib/api";
import {
  Bell,
  CheckCircle,
  ChevronRight,
  Check,
  Filter,
  Loader2,
  ChevronLeft,
  Calendar,
  Users,
  Car,
  FileText,
  DollarSign,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";

// ============== TYPES ==============

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  data: any;
  createdAt: string;
}

interface DateGroup {
  label: string;
  notifications: NotificationItem[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface VendorNotificationsPanelProps {
  onTabChange?: (tab: string) => void;
  refreshBadges: () => void;
}

// ============== CONSTANTS ==============

const CATEGORIES = [
  { id: "all", label: "All", icon: Bell },
  { id: "bookings", label: "Bookings", icon: Calendar },
  { id: "drivers", label: "Drivers", icon: Users },
  { id: "vehicles", label: "Vehicles", icon: Car },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "payments", label: "Payments", icon: DollarSign },
];

// Map notification types to navigation tabs
const TYPE_TO_TAB: Record<string, string> = {
  BOOKING_ASSIGNED: "bookings",
  BOOKING_REASSIGNED: "bookings",
  BOOKING_CANCELLED: "bookings",
  BOOKING_UPDATED: "bookings",
  BOOKING_COMPLETED: "bookings",
  DRIVER_APPROVED: "drivers",
  DRIVER_REJECTED: "drivers",
  DRIVER_CHANGES_REQUESTED: "drivers",
  DRIVER_DOCUMENT_EXPIRING: "drivers",
  VEHICLE_APPROVED: "fleet",
  VEHICLE_REJECTED: "fleet",
  VEHICLE_CHANGES_REQUESTED: "fleet",
  VEHICLE_DOCUMENT_EXPIRING: "fleet",
  PROFILE_CHANGES_REQUESTED: "profile",
  PROFILE_APPROVED: "profile",
  MOU_EXPIRING: "profile",
  RECEIPT_GENERATED: "earnings",
  RECEIPT_OVERDUE: "earnings",
  PAYMENT_RECEIVED: "earnings",
};

// Severity based on notification type prefix
function getSeverityStyle(type: string) {
  if (
    type.includes("APPROVED") ||
    type.includes("COMPLETED") ||
    type.includes("PAID") ||
    type.includes("RECEIVED")
  )
    return {
      icon: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    };
  if (
    type.includes("EXPIRING") ||
    type.includes("CHANGES_REQUESTED") ||
    type.includes("OVERDUE")
  )
    return {
      icon: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    };
  if (
    type.includes("REJECTED") ||
    type.includes("EXPIRED") ||
    type.includes("CANCELLED") ||
    type.includes("DEACTIVATED")
  )
    return {
      icon: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    };
  return {
    icon: "text-luxury-gold",
    bg: "bg-luxury-gold/10",
    border: "border-luxury-gold/20",
  };
}

function getTypeIcon(type: string) {
  if (type.includes("BOOKING") || type.includes("TRIP")) return Calendar;
  if (type.includes("DRIVER")) return Users;
  if (type.includes("VEHICLE")) return Car;
  if (
    type.includes("DOCUMENT") ||
    type.includes("PROFILE") ||
    type.includes("MOU")
  )
    return FileText;
  if (
    type.includes("RECEIPT") ||
    type.includes("PAYMENT") ||
    type.includes("PAYOUT")
  )
    return DollarSign;
  return Bell;
}

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

// ============== MAIN COMPONENT ==============

export default function VendorNotificationsPanel({
  onTabChange,
  refreshBadges,
}: VendorNotificationsPanelProps) {
  const { showNotification } = useNotification();

  // State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>(
    {},
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const [activeCategory, setActiveCategory] = useState("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  // ============== FETCH ==============

  const fetchNotifications = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      try {
        const params: Record<string, any> = {
          category: activeCategory,
          page,
          limit: pagination.limit,
        };
        if (showUnreadOnly) params.unreadOnly = "true";

        const res = await vendorApi.getNotifications(params);
        if (res.success && res.data) {
          setNotifications(res.data.notifications || []);
          setDateGroups(res.data.dateGroups || []);
          setCategoryCounts(res.data.categoryCounts || {});
          setUnreadCount(res.data.unreadCount || 0);
          setPagination(
            res.data.pagination || {
              page: 1,
              limit: 20,
              total: 0,
              totalPages: 0,
            },
          );
        }
      } catch (err: any) {
        showNotification(
          "error",
          err.message || "Failed to load notifications",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeCategory, showUnreadOnly, pagination.limit],
  );

  useEffect(() => {
    fetchNotifications(1);
  }, [activeCategory, showUnreadOnly]);

  // ============== MARK AS READ ==============

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await vendorApi.markNotificationAsRead(notificationId);
      // Update local state immediately
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
      setDateGroups((prev) =>
        prev.map((group) => ({
          ...group,
          notifications: group.notifications.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n,
          ),
        })),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      refreshBadges();
    } catch {
      // Silent
    }
  };

  // ============== MARK ALL AS READ ==============

  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    try {
      const category = activeCategory !== "all" ? activeCategory : undefined;
      await vendorApi.markAllNotificationsAsRead(category);
      // Refresh
      fetchNotifications(pagination.page);
      refreshBadges();
      showNotification("success", "All notifications marked as read");
    } catch (err: any) {
      showNotification("error", err.message || "Failed");
    } finally {
      setIsMarkingAll(false);
    }
  };

  // ============== ACTION HANDLER ==============

  const handleAction = (notification: NotificationItem) => {
    handleMarkAsRead(notification.id);
    const tab = TYPE_TO_TAB[notification.type];
    if (tab && onTabChange) {
      onTabChange(tab);
    }
  };

  // Get action label based on type
  const getActionLabel = (type: string): string | null => {
    const tab = TYPE_TO_TAB[type];
    if (!tab) return null;
    const labels: Record<string, string> = {
      bookings: "View Booking",
      drivers: "View Driver",
      fleet: "View Fleet",
      profile: "View Profile",
      earnings: "View Earnings",
    };
    return labels[tab] || null;
  };

  // ============== RENDER ==============

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Notifications</h2>
          <p className="text-sm text-gray-400">
            {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              showUnreadOnly
                ? "bg-luxury-gold text-black font-medium"
                : "bg-neutral-800 text-gray-400 hover:bg-neutral-700"
            }`}
          >
            <Filter className="w-4 h-4" />
            Unread Only
          </button>
          <button
            onClick={handleMarkAllAsRead}
            disabled={isMarkingAll || unreadCount === 0}
            className="flex items-center gap-2 px-3 py-2 bg-neutral-800 text-gray-400 rounded-lg hover:bg-neutral-700 transition-colors text-sm disabled:opacity-50"
          >
            {isMarkingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Mark All Read
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const count = categoryCounts[cat.id] || 0;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? "bg-luxury-gold text-black"
                  : "bg-neutral-800 text-gray-400 hover:bg-neutral-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {cat.label}
              {count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-xs ${
                    activeCategory === cat.id
                      ? "bg-black/20"
                      : "bg-luxury-gold/20 text-luxury-gold"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      ) : dateGroups.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center">
          <Bell className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-white font-medium mb-2">No notifications</h3>
          <p className="text-gray-400 text-sm">
            {showUnreadOnly
              ? "No unread notifications"
              : "You're all caught up!"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {dateGroups.map((group) => (
            <div key={group.label}>
              <h3 className="text-sm font-medium text-gray-500 mb-3">
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.notifications.map((notification) => {
                  const Icon = getTypeIcon(notification.type);
                  const style = getSeverityStyle(notification.type);
                  const actionLabel = getActionLabel(notification.type);

                  return (
                    <div
                      key={notification.id}
                      className={`bg-neutral-900 border rounded-xl p-4 transition-all hover:border-neutral-700 ${
                        notification.isRead
                          ? "border-neutral-800 opacity-70"
                          : "border-neutral-700"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}
                        >
                          <Icon className={`w-5 h-5 ${style.icon}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-white font-medium">
                                  {notification.title}
                                </h4>
                                {!notification.isRead && (
                                  <span className="w-2 h-2 rounded-full bg-luxury-gold flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-gray-400 text-sm mt-1">
                                {notification.message}
                              </p>
                            </div>
                            <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
                              {formatTime(notification.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-3">
                            {actionLabel && (
                              <button
                                onClick={() => handleAction(notification)}
                                className="flex items-center gap-1 text-sm text-luxury-gold hover:text-luxury-gold/80 transition-colors"
                              >
                                {actionLabel}
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                            {!notification.isRead && (
                              <button
                                onClick={() =>
                                  handleMarkAsRead(notification.id)
                                }
                                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-400 transition-colors"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Mark as read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchNotifications(pagination.page - 1)}
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
                onClick={() => fetchNotifications(page)}
                className={`w-8 h-8 rounded-lg text-sm ${
                  pagination.page === page
                    ? "bg-luxury-gold text-black font-medium"
                    : "bg-neutral-800 text-gray-400 hover:bg-neutral-700"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => fetchNotifications(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 bg-neutral-800 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
