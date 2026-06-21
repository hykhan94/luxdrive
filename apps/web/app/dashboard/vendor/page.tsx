// ============================================
// !!! DESTINATION PATH: apps/web/app/dashboard/vendor/page.tsx
// ============================================
"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNotification } from "@/lib/notification-context";
import { vendorApi } from "@/lib/api";
import Link from "next/link";
import Logo, { LogoBadge } from "@/components/shared/logo";
import {
  LayoutDashboard,
  Car,
  CalendarDays,
  Building2,
  Users,
  Wallet,
  Loader2,
  LogOut,
  Home,
  X,
  User,
  Menu,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Bell,
  ShieldAlert,
  AlertCircle,
} from "lucide-react";
import VendorDashboardContent from "@/components/vendor/dashboard";
import VendorBookingsContent from "@/components/vendor/bookings";
import VendorFleetContent from "@/components/vendor/fleet";
import VendorDriversContent from "@/components/vendor/drivers";
import VendorReportsPanel from "@/components/vendor/reports";
import VendorNotificationsPanel from "@/components/vendor/notifications";
import VendorEarningsPanel from "@/components/vendor/earnings";
import VendorProfilePanel from "@/components/vendor/profile";

import { proxiedImageUrl } from "@/lib/image-url";
// ============== TYPES ==============

type TabType =
  | "dashboard"
  | "bookings"
  | "fleet"
  | "drivers"
  | "earnings"
  | "reports"
  | "notifications"
  | "profile";

interface SidebarBadges {
  notifications: number;
  bookings: number;
  fleet: number;
  // Drivers split out from fleet — counts driver-specific actionable
  // items (drivers in CHANGES_REQUESTED + unread driver notifications).
  // Without this entry the Driver Management sidebar item has no type-
  // safe badge key and both sidebar items end up reading from `fleet`.
  drivers: number;
  earnings: number;
  profile: number;
  isApproved: boolean;
  vendorStatus: string | null;
  logoUrl: string | null;
  // Required profile docs (CR / VAT / Chamber / Balady / National Address /
  // IBAN Letter) whose expiryDate has passed. Empty when nothing is expired.
  // Drives the "Document Expired" lockout UX across the portal.
  expiredRequiredDocs: Array<{
    type: string;
    label: string;
    expiryDate: string;
  }>;
  breakdown: {
    bookings: { newRequests: number; unreadNotifications: number };
    fleet: {
      pendingVehicleReviews: number;
      vehiclesChangesRequested: number;
      unreadVehicleNotifications: number;
    };
    drivers: {
      pendingDriverReviews: number;
      driversChangesRequested: number;
      unreadDriverNotifications: number;
    };
    earnings: {
      pendingReceipts: number;
      unreadPaymentConfirmedNotifications: number;
    };
  };
}

// ============== SIDEBAR CONFIG ==============

// Access control: minStatus determines minimum vendor status to see the tab
// "any" = always visible, "submitted" = PENDING_REVIEW/CHANGES_REQUESTED/APPROVED, "approved" = APPROVED only
const sidebarItems: Array<{
  id: TabType;
  label: string;
  icon: any;
  badgeKey?: keyof SidebarBadges;
  minStatus: "any" | "submitted" | "approved";
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    minStatus: "submitted",
  },
  {
    id: "bookings",
    label: "Bookings",
    icon: CalendarDays,
    badgeKey: "bookings",
    minStatus: "submitted",
  },
  {
    id: "fleet",
    label: "Fleet Management",
    icon: Car,
    badgeKey: "fleet",
    minStatus: "submitted",
  },
  {
    id: "drivers",
    label: "Driver Management",
    icon: Users,
    badgeKey: "drivers",
    minStatus: "submitted",
  },
  {
    id: "earnings",
    label: "Earnings & Payouts",
    icon: Wallet,
    badgeKey: "earnings",
    minStatus: "submitted",
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    icon: BarChart3,
    minStatus: "submitted",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    badgeKey: "notifications",
    minStatus: "any",
  },
  {
    id: "profile",
    label: "Company Profile",
    icon: Building2,
    badgeKey: "profile",
    minStatus: "any",
  },
];

// ============== ACCESS HELPERS ==============

function getAccessLevel(
  vendorStatus: string | null,
): "any" | "submitted" | "approved" {
  if (!vendorStatus) return "any";
  if (vendorStatus === "APPROVED") return "approved";
  if (["PENDING_REVIEW", "CHANGES_REQUESTED"].includes(vendorStatus))
    return "submitted";
  return "any"; // INVITED or unknown
}

function checkTabAccessible(
  minStatus: "any" | "submitted" | "approved",
  accessLevel: "any" | "submitted" | "approved",
): boolean {
  const levels = { any: 0, submitted: 1, approved: 2 };
  return levels[accessLevel] >= levels[minStatus];
}

// ============== MAIN COMPONENT ==============

// Inner component — wrapped in Suspense by the default export below
// because useSearchParams() triggers a CSR bailout that crashes the
// Next 15+/16 production build without a boundary.
function VendorDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const { showNotification } = useNotification();

  // Core state — honor ?tab=<id> if present so the invitation
  // acceptance flow can land newly-onboarded vendors directly on the
  // profile section (/dashboard/vendor?tab=profile). Falls back to
  // "dashboard" for normal navigation. Validated against the TabType
  // union since searchParams returns a raw string.
  const initialTab: TabType = (() => {
    const t = searchParams.get("tab");
    const valid: TabType[] = [
      "dashboard",
      "bookings",
      "fleet",
      "drivers",
      "earnings",
      "reports",
      "notifications",
      "profile",
    ];
    return valid.includes(t as TabType) ? (t as TabType) : "dashboard";
  })();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sidebar badges from API
  const [badges, setBadges] = useState<SidebarBadges>({
    notifications: 0,
    bookings: 0,
    fleet: 0,
    drivers: 0,
    earnings: 0,
    profile: 0,
    isApproved: false,
    vendorStatus: null,
    logoUrl: null,
    expiredRequiredDocs: [],
    breakdown: {
      bookings: { newRequests: 0, unreadNotifications: 0 },
      fleet: {
        pendingVehicleReviews: 0,
        vehiclesChangesRequested: 0,
        unreadVehicleNotifications: 0,
      },
      drivers: {
        pendingDriverReviews: 0,
        driversChangesRequested: 0,
        unreadDriverNotifications: 0,
      },
      earnings: {
        pendingReceipts: 0,
        unreadPaymentConfirmedNotifications: 0,
      },
    },
  });
  const [badgesLoaded, setBadgesLoaded] = useState(false);

  // Booking sub-tab. Set explicitly by the caller of onTabChange —
  // dashboard's New Requests banner passes "new", the Recent Bookings
  // "View all" link passes "all", calendar clicks bypass this via
  // setBookingsDateFilter (which lands the bookings panel on "all"
  // regardless). The default of "all" is the conservative pick when
  // there's no explicit caller signal: a fresh sidebar click on
  // "Bookings" should show everything, not the New Requests-only
  // queue, since that queue is already surfaced via the sidebar
  // badge and the dashboard banner.
  const [bookingSubTab, setBookingSubTab] = useState<
    "new" | "active" | "completed" | "all"
  >("all");
  const [bookingsDateFilter, setBookingsDateFilter] = useState<string | null>(
    null,
  );

  // ============== FETCH SIDEBAR BADGES ==============
  //
  // Polling stops on 401/403. Auth-level rejections won't recover
  // without a fresh login (logged out, wrong portal, account switched),
  // so continuing to poll every 30s just floods the server logs with
  // identical "Access denied" entries. Use a ref-tracked stop flag
  // because state updates here would re-run the effect and reset the
  // interval — defeating the point.

  const stopPollingRef = useRef(false);

  const refreshBadges = useCallback(async () => {
    if (stopPollingRef.current) return;
    try {
      const res = await vendorApi.getSidebarBadges();
      if (res.success && res.data) {
        setBadges(res.data);
        setBadgesLoaded(true);
      }
    } catch (err: any) {
      // Auth-level rejection: latch the flag and stop. A full page
      // reload (component re-mount) clears the ref and re-enables
      // polling.
      if (err?.status === 401 || err?.status === 403) {
        stopPollingRef.current = true;
      }
      // Sidebar badges are non-critical — let the UI render with
      // whatever state it has.
      setBadgesLoaded(true);
    }
  }, []);

  // Initial fetch + polling every 30s
  useEffect(() => {
    refreshBadges();
    const interval = setInterval(() => {
      if (stopPollingRef.current) {
        clearInterval(interval);
        return;
      }
      refreshBadges();
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshBadges]);

  // ============== ACCESS CONTROL ==============

  const accessLevel = getAccessLevel(badges.vendorStatus);

  // Doc-expiry lockout — separate axis from vendorStatus. A vendor can be
  // APPROVED but still locked out of write actions because one of their six
  // required profile documents has lapsed. We surface this as its own state
  // (red pill in header, banner in panels) so the vendor knows EXACTLY what
  // to fix vs. the generic "pending review" copy.
  const hasExpiredDocs = (badges.expiredRequiredDocs?.length ?? 0) > 0;

  // Redirect to profile if vendor is INVITED and tries to access restricted tabs
  const handleTabChange = (tab: string, subTab?: string) => {
    const t = tab as TabType;
    const item = sidebarItems.find((i) => i.id === t);

    if (item && !checkTabAccessible(item.minStatus, accessLevel)) {
      if (accessLevel === "any") {
        showNotification(
          "warning",
          "Complete your profile and submit for review to access this section.",
        );
        setActiveTab("profile");
      } else {
        showNotification(
          "warning",
          "Your profile is pending approval. This section will be available once approved.",
        );
      }
      return;
    }

    // Clear date filter when switching away from bookings
    if (t !== "bookings") setBookingsDateFilter(null);

    setActiveTab(t);
    if (subTab) setBookingSubTab(subTab as typeof bookingSubTab);
    setMobileMenuOpen(false);
  };

  const handleCalendarDateClick = (dateStr: string) => {
    setBookingsDateFilter(dateStr);
    setActiveTab("bookings");
    setMobileMenuOpen(false);
  };

  // ============== AUTH CHECK ==============

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  useEffect(() => {
    // Wait for the session check to complete before deciding to
    // redirect. On a page refresh, isAuthenticated is briefly false
    // while authApi.getSession() is in flight; redirecting on that
    // transient state would bounce the user to home every time they
    // hit refresh on a portal page. Same pattern is used in the
    // admin portal — replicated here.
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/");
    } else if (user?.role !== "VENDOR") {
      // If they're authenticated but it's the wrong portal for their
      // role, send them to the right one instead of home.
      router.push(`/dashboard/${user?.role?.toLowerCase()}`);
    }
  }, [isAuthenticated, isLoading, user, router]);

  // Auto-redirect INVITED vendors to profile (in an effect so we don't call
  // setState during render — which would log a React warning every cycle).
  // Notifications stays accessible because INVITED vendors should still see
  // welcome/onboarding messages.
  //
  // IMPORTANT: this effect MUST sit ABOVE the early auth-guard return below.
  // Hooks have to fire in the same order on every render, and an early
  // return between two hooks causes the post-return hook to be skipped
  // when the guard fires — React then errors with "change in the order of
  // Hooks called by VendorDashboard". Putting all useEffects above the
  // guard ensures every render runs the same hook sequence.
  useEffect(() => {
    if (
      badgesLoaded &&
      badges.vendorStatus === "INVITED" &&
      activeTab !== "profile" &&
      activeTab !== "notifications"
    ) {
      setActiveTab("profile");
    }
  }, [badgesLoaded, badges.vendorStatus, activeTab]);

  if (!isAuthenticated || user?.role !== "VENDOR") {
    return (
      <div className="min-h-screen bg-luxury-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  // ============== BADGE VALUE HELPER ==============

  const getBadgeValue = (item: (typeof sidebarItems)[0]): number => {
    if (!item.badgeKey) return 0;
    const val = badges[item.badgeKey];
    return typeof val === "number" ? val : 0;
  };

  // ============== SIDEBAR RENDERER ==============

  const renderSidebarItem = (
    item: (typeof sidebarItems)[0],
    collapsed: boolean,
  ) => {
    const Icon = item.icon;
    const badge = getBadgeValue(item);
    const isActive = activeTab === item.id;
    const isAccessible = checkTabAccessible(item.minStatus, accessLevel);

    // Tooltip text varies by state — disabled state explains the lock,
    // collapsed state shows the label. Always-on `title` ensures hover tooltip
    // fires both for screen readers and for sighted users (per D6).
    const lockReason =
      accessLevel === "any"
        ? "Complete and submit your profile to unlock"
        : "Available once your profile is approved";
    const tooltipText = !isAccessible
      ? `${item.label} — ${lockReason}`
      : collapsed
        ? item.label
        : undefined;

    return (
      <button
        key={item.id}
        onClick={() => handleTabChange(item.id)}
        title={tooltipText}
        disabled={!isAccessible}
        className={`group relative w-full flex items-center justify-between px-3 h-11 rounded-lg transition-colors ${
          isActive
            ? "bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/30"
            : isAccessible
              ? "text-gray-400 hover:text-white hover:bg-neutral-800"
              : "text-gray-600 cursor-not-allowed opacity-50"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm truncate">{item.label}</span>}
        </div>
        {!collapsed && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {badge > 0 && isAccessible && (
              <span className="px-2 py-0.5 bg-luxury-gold text-black text-xs rounded-full font-medium">
                {badge}
              </span>
            )}
            {!isAccessible && (
              <ShieldAlert className="w-3.5 h-3.5 text-gray-600" />
            )}
          </div>
        )}
        {collapsed && badge > 0 && isAccessible && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
        {collapsed && !isAccessible && (
          <ShieldAlert className="absolute top-1 right-1 w-3 h-3 text-gray-600" />
        )}
        {/* Hover tooltip — shown for both collapsed and disabled states.
            For locked tabs in expanded mode, this gives a richer tooltip than
            the native title attribute alone. */}
        {(collapsed || !isAccessible) && (
          <span className="absolute left-full ml-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 max-w-xs">
            {!isAccessible ? `${item.label} — ${lockReason}` : item.label}
          </span>
        )}
      </button>
    );
  };

  // ============== RENDER ==============

  const companyName =
    user?.name || (badges.vendorStatus ? "Vendor Portal" : "Loading...");

  return (
    <div className="min-h-screen bg-luxury-dark flex w-full max-w-full overflow-x-hidden">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide-in Drawer */}
      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-neutral-900 border-r border-neutral-800 z-50 transform transition-transform duration-300 lg:hidden ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex flex-col h-full">
          <div className="h-16 flex items-center justify-between border-b border-neutral-800 px-4">
            <Logo size="sm" showTagline={false} />
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b border-neutral-800">
            <p className="text-xs text-luxury-gold mb-1">Vendor Portal</p>
            <p className="text-sm font-medium text-white truncate">
              {companyName}
            </p>
            {badges.vendorStatus && badges.vendorStatus !== "APPROVED" && (
              <span className="inline-block mt-1 px-2 py-0.5 text-[10px] rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                {badges.vendorStatus.replace("_", " ")}
              </span>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              {sidebarItems.map((item) => renderSidebarItem(item, false))}
            </div>
          </nav>

          <div className="p-3 border-t border-neutral-800 space-y-1 pb-safe">
            <Link
              href="/"
              className="w-full flex items-center gap-3 px-3 h-12 rounded-lg text-gray-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Home className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Back to Home</span>
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 h-12 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col fixed left-0 top-0 h-full bg-neutral-900 border-r border-neutral-800 transition-all duration-300 z-40 ${sidebarOpen ? "w-56 xl:w-64" : "w-16"}`}
      >
        <div className="h-16 flex items-center justify-between border-b border-neutral-800 px-3">
          {sidebarOpen ? (
            <Logo size="sm" showTagline={false} />
          ) : (
            <LogoBadge size={36} />
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-neutral-800 rounded transition-colors"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>

        {sidebarOpen && (
          <div className="p-3 border-b border-neutral-800">
            <p className="text-xs text-luxury-gold mb-0.5">Vendor Portal</p>
            <p className="text-sm font-medium text-white truncate">
              {companyName}
            </p>
            {badges.vendorStatus && badges.vendorStatus !== "APPROVED" && (
              <span className="inline-block mt-1 px-2 py-0.5 text-[10px] rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                {badges.vendorStatus.replace("_", " ")}
              </span>
            )}
          </div>
        )}

        <nav className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {sidebarItems.map((item) => renderSidebarItem(item, !sidebarOpen))}
          </div>
        </nav>

        <div className="p-2 border-t border-neutral-800 space-y-1">
          <Link
            href="/"
            title={!sidebarOpen ? "Back to Home" : undefined}
            className="group relative w-full flex items-center gap-3 px-3 h-11 rounded-lg text-gray-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <Home className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">Back to Home</span>}
            {!sidebarOpen && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                Back to Home
              </span>
            )}
          </Link>
          <button
            onClick={handleLogout}
            title={!sidebarOpen ? "Logout" : undefined}
            className="group relative w-full flex items-center gap-3 px-3 h-11 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">Logout</span>}
            {!sidebarOpen && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                Logout
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 min-w-0 min-h-screen transition-all duration-300 ${sidebarOpen ? "lg:ml-56 xl:ml-64" : "lg:ml-16"}`}
      >
        {/* Top Header */}
        <header className="h-16 bg-neutral-900/80 backdrop-blur-sm border-b border-neutral-800 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-gray-400 hover:text-white lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-white">
              {sidebarItems.find((i) => i.id === activeTab)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Status pill — visible from any tab so the vendor always knows
                their state. Hidden once approved AND no docs expired (nothing
                to surface in that case). Doc-expired wins over status-based
                copy because it's the more actionable signal. */}
            {badgesLoaded &&
              (hasExpiredDocs ||
                (badges.vendorStatus && !badges.isApproved)) && (
                <span
                  title={
                    hasExpiredDocs
                      ? `Expired: ${badges.expiredRequiredDocs.map((d) => d.label).join(", ")}. Renew via the profile change-request flow.`
                      : badges.vendorStatus === "INVITED"
                        ? "Complete your profile to begin"
                        : badges.vendorStatus === "PENDING_REVIEW"
                          ? "Your profile is being reviewed by our team"
                          : badges.vendorStatus === "CHANGES_REQUESTED"
                            ? "Admin has requested changes — see your profile"
                            : badges.vendorStatus === "SUSPENDED"
                              ? "Your account is suspended"
                              : ""
                  }
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border ${
                    hasExpiredDocs
                      ? "bg-red-500/10 text-red-400 border-red-500/30"
                      : badges.vendorStatus === "INVITED"
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        : badges.vendorStatus === "PENDING_REVIEW"
                          ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                          : badges.vendorStatus === "CHANGES_REQUESTED"
                            ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {hasExpiredDocs
                    ? badges.expiredRequiredDocs.length === 1
                      ? `${badges.expiredRequiredDocs[0].label} Expired`
                      : `${badges.expiredRequiredDocs.length} Documents Expired`
                    : badges.vendorStatus === "INVITED"
                      ? "Profile Incomplete"
                      : badges.vendorStatus === "PENDING_REVIEW"
                        ? "Pending Approval"
                        : badges.vendorStatus === "CHANGES_REQUESTED"
                          ? "Changes Requested"
                          : badges.vendorStatus === "SUSPENDED"
                            ? "Suspended"
                            : (badges.vendorStatus || "").replace("_", " ")}
                </span>
              )}
            <span className="text-sm text-gray-400 hidden sm:block">
              {user?.email}
            </span>
            <div className="w-8 h-8 bg-luxury-gold/20 rounded-full flex items-center justify-center overflow-hidden">
              {badges.logoUrl ? (
                <img
                  src={proxiedImageUrl(badges.logoUrl, 96) ?? badges.logoUrl}
                  alt="Logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-4 h-4 text-luxury-gold" />
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 lg:p-6">
          {(() => {
            // Gate the visible panel by access level. This catches edge cases
            // where activeTab points to a tab the user can't actually access
            // (e.g. badges arrive late, status changes mid-session). The
            // backend also enforces this with 403s — this placeholder just
            // gives a cleaner UX than letting the panel render and break.
            const currentItem = sidebarItems.find((i) => i.id === activeTab);
            const currentAccessible = currentItem
              ? checkTabAccessible(currentItem.minStatus, accessLevel)
              : true;
            // Suspended is its own axis above access level. Short-
            // circuit BEFORE the access check so suspended vendors
            // see a clear "account suspended" message instead of a
            // generic "approval required" one. Notifications tab is
            // exempt so they can read the admin's suspension reason
            // (carried in the VENDOR_SUSPENDED notification). Every
            // other tab routes to this branch instead of mounting
            // its panel, which is what kills the toast spam — no
            // panel renders means no panel-level API calls fail.
            const isSuspended = badges.vendorStatus === "SUSPENDED";
            if (isSuspended && activeTab !== "notifications") {
              return (
                <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
                  <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                    <ShieldAlert className="w-10 h-10 text-red-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">
                    Account Suspended
                  </h3>
                  <p className="text-gray-400 mb-6 leading-relaxed">
                    Your LuxDrive vendor account has been suspended by admin.
                    You won&apos;t be able to access portal features until the
                    suspension is lifted. Open Notifications to see the reason,
                    or contact your LuxDrive admin to restore access.
                  </p>
                  <button
                    onClick={() => setActiveTab("notifications")}
                    className="flex items-center gap-2 px-6 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors"
                  >
                    <Bell className="w-5 h-5" /> View Notifications
                  </button>
                </div>
              );
            }

            if (badgesLoaded && currentItem && !currentAccessible) {
              return (
                <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
                  <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
                    <AlertCircle className="w-10 h-10 text-amber-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">
                    {accessLevel === "any"
                      ? "Complete Your Profile"
                      : "Approval Required"}
                  </h3>
                  <p className="text-gray-400 mb-6 leading-relaxed">
                    {accessLevel === "any"
                      ? "Complete your company profile, upload all required documents, and submit for review to unlock this section."
                      : badges.vendorStatus === "CHANGES_REQUESTED"
                        ? "Admin has requested changes to your profile. Update the highlighted fields and resubmit to regain access to this section."
                        : "Your profile is currently under review. Once approved, this section will become available."}
                  </p>
                  <button
                    onClick={() => setActiveTab("profile")}
                    className="flex items-center gap-2 px-6 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors"
                  >
                    <Building2 className="w-5 h-5" /> Go to Profile
                  </button>
                </div>
              );
            }

            return (
              <>
                {activeTab === "dashboard" && (
                  <VendorDashboardContent
                    onTabChange={handleTabChange}
                    onCalendarDateClick={handleCalendarDateClick}
                    refreshBadges={refreshBadges}
                  />
                )}

                {activeTab === "bookings" && (
                  <VendorBookingsContent
                    initialSubTab={bookingSubTab}
                    initialDateFilter={bookingsDateFilter}
                    refreshBadges={refreshBadges}
                    vendorStatus={badges.vendorStatus}
                    expiredRequiredDocs={badges.expiredRequiredDocs}
                  />
                )}

                {activeTab === "fleet" && (
                  <VendorFleetContent
                    refreshBadges={refreshBadges}
                    vendorStatus={badges.vendorStatus}
                    expiredRequiredDocs={badges.expiredRequiredDocs}
                  />
                )}

                {activeTab === "drivers" && (
                  <VendorDriversContent
                    refreshBadges={refreshBadges}
                    vendorStatus={badges.vendorStatus}
                    expiredRequiredDocs={badges.expiredRequiredDocs}
                  />
                )}

                {activeTab === "earnings" && (
                  <VendorEarningsPanel refreshBadges={refreshBadges} />
                )}

                {activeTab === "reports" && <VendorReportsPanel />}

                {activeTab === "notifications" && (
                  <VendorNotificationsPanel
                    onTabChange={handleTabChange}
                    refreshBadges={refreshBadges}
                  />
                )}

                {activeTab === "profile" && (
                  <VendorProfilePanel
                    refreshBadges={refreshBadges}
                    isApproved={badges.isApproved}
                  />
                )}
              </>
            );
          })()}
        </div>
      </main>
    </div>
  );
}

// Default export — Suspense wrapper for useSearchParams(). See the
// PartnerDashboard default export for the same pattern + rationale.
export default function VendorDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-luxury-black flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      }
    >
      <VendorDashboardInner />
    </Suspense>
  );
}
