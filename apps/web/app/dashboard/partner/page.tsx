"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNotification } from "@/lib/notification-context";
import { partnerApi } from "@/lib/api";
import Link from "next/link";
import Logo, { LogoBadge } from "@/components/shared/logo";
import {
  LayoutDashboard,
  Car,
  CalendarDays,
  FileText,
  Building2,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  Home,
  LogOut,
  Menu,
  X,
  Loader2,
  AlertCircle,
  ShieldAlert,
  MessageCircle,
  Mail,
} from "lucide-react";

import DashboardPanel from "@/components/partner/dashboard-panel";
import BookRidePanel from "@/components/partner/book-ride-panel";
import BookingsPanel from "@/components/partner/bookings-panel";
import InvoicesPanel from "@/components/partner/invoices-panel";
import ProfilePanel from "@/components/partner/profile-panel";
import ReportsAnalyticsPanel from "@/components/partner/reports-analytics-panel";
import NotificationsPanel from "@/components/partner/notifications-panel";
import ProfileImage from "@/components/ui/profile-image";

type TabType =
  | "dashboard"
  | "book"
  | "bookings"
  | "invoices"
  | "profile"
  | "reports"
  | "notifications";

interface SidebarBadges {
  notifications: number;
  invoices: number;
  bookings: number;
  profile: number;
  isApproved: boolean;
  partnerStatus: string | null;
  logoUrl: string | null;
  /** True when the partner has at least one unresolved ADMIN_REJECTION
   *  comment. Distinguishes real "admin wants changes" state from partner-
   *  initiated edit windows for status-pill copy. */
  hasActiveRejections?: boolean;
  // Required profile docs (CR / VAT / Chamber / Balady / National Address /
  // IBAN Letter) whose expiryDate has passed. Empty when nothing is expired.
  // Drives the "Document Expired" lockout UX across the portal.
  expiredRequiredDocs: Array<{
    type: string;
    label: string;
    expiryDate: string;
  }>;
}

const sidebarItems: Array<{
  id: TabType;
  label: string;
  icon: any;
  minStatus: "any" | "submitted" | "approved";
}> = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    minStatus: "submitted",
  },
  { id: "book", label: "Book a Ride", icon: Car, minStatus: "approved" },
  {
    id: "bookings",
    label: "Bookings",
    icon: CalendarDays,
    minStatus: "submitted",
  },
  { id: "invoices", label: "Invoices", icon: FileText, minStatus: "submitted" },
  {
    id: "profile",
    label: "Company Profile",
    icon: Building2,
    minStatus: "any",
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    icon: BarChart3,
    minStatus: "submitted",
  },
  { id: "notifications", label: "Notifications", icon: Bell, minStatus: "any" },
];

const BADGE_KEYS: Partial<
  Record<
    TabType,
    keyof Omit<SidebarBadges, "isApproved" | "partnerStatus" | "logoUrl">
  >
> = {
  notifications: "notifications",
  invoices: "invoices",
  bookings: "bookings",
  profile: "profile",
};

// Access level helper — defined outside component so it's always available
function getAccessLevel(
  isApproved: boolean,
  partnerStatus: string | null,
): "any" | "submitted" | "approved" {
  if (isApproved) return "approved";
  if (partnerStatus !== null && partnerStatus !== "INVITED") return "submitted";
  return "any";
}

function checkTabAccessible(
  item: (typeof sidebarItems)[0],
  accessLevel: "any" | "submitted" | "approved",
): boolean {
  if (item.minStatus === "any") return true;
  if (
    item.minStatus === "submitted" &&
    (accessLevel === "submitted" || accessLevel === "approved")
  )
    return true;
  if (item.minStatus === "approved" && accessLevel === "approved") return true;
  return false;
}

// Inner component holds the actual dashboard. Has to live behind a
// Suspense boundary because `useSearchParams()` triggers a CSR
// bailout during prerender on Next 15+/16 — without the boundary the
// production build fails with "useSearchParams() should be wrapped
// in a suspense boundary". See the default export below for the
// wrapper.
function PartnerDashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const { showNotification } = useNotification();
  // Honor ?tab=<id> if present (set by the invitation acceptance flow
  // so freshly-onboarded partners land on /dashboard/partner?tab=profile).
  // Falls back to "dashboard" for normal navigation. Validated against
  // the union below since searchParams returns a raw string.
  const initialTab: TabType = (() => {
    const t = searchParams.get("tab");
    const valid: TabType[] = [
      "dashboard",
      "book",
      "bookings",
      "invoices",
      "profile",
      "reports",
      "notifications",
    ];
    return valid.includes(t as TabType) ? (t as TabType) : "dashboard";
  })();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [badges, setBadges] = useState<SidebarBadges>({
    notifications: 0,
    invoices: 0,
    bookings: 0,
    profile: 0,
    isApproved: false,
    partnerStatus: null,
    logoUrl: null,
    expiredRequiredDocs: [],
  });
  const [badgesLoaded, setBadgesLoaded] = useState(false);
  const [bookingsDateFilter, setBookingsDateFilter] = useState<string | null>(
    null,
  );

  // Derived values — computed every render, available everywhere
  const isApproved = badges.isApproved;
  const accessLevel = getAccessLevel(isApproved, badges.partnerStatus);
  // Suspended is its own axis — admin pulled the partner's access
  // entirely. Different from "not approved yet" (amber, pending) and
  // different from "doc expired" (red, but partner can self-serve by
  // renewing). When suspended, the only useful screen is a status
  // banner pointing them at notifications (admin attached the reason
  // there) + a "contact admin" CTA. Mounting the regular panels in
  // this state spams toasts because every API call 400s with
  // "Complete your profile..." from the backend gate.
  // Fallback flag: if sidebar-badges 403s with PARTNER_SUSPENDED (older
  // backend where sidebar-badges is still gated by isActivePartner), we
  // still want the frontend to render the suspended screen. Flipping this
  // here means isSuspended (derived below) is true regardless of whether
  // the badges response ever succeeded.
  const [suspendedByError, setSuspendedByError] = useState(false);
  const isSuspended = badges.partnerStatus === "SUSPENDED" || suspendedByError;

  // Suspension info — reason, timestamp, WhatsApp contact — fetched lazily
  // when we detect isSuspended. Kept separate from `badges` because those
  // are polled every 30s and refetching this on every tick is wasteful; a
  // suspension reason doesn't change during a session.
  const [suspensionInfo, setSuspensionInfo] = useState<{
    reason: string | null;
    suspendedAt: string | null;
    support: {
      whatsapp: string;
      whatsappUrl: string;
      email: string;
    };
  } | null>(null);
  useEffect(() => {
    if (!isSuspended) return;
    if (suspensionInfo) return;
    (async () => {
      try {
        const res = await partnerApi.getSuspensionInfo();
        if (res.success && res.data) {
          setSuspensionInfo({
            reason: res.data.reason,
            suspendedAt: res.data.suspendedAt,
            support: res.data.support,
          });
        }
      } catch {
        // Silently fall through; render will use generic copy if data
        // never loads (partner still sees WhatsApp fallback below).
      }
    })();
  }, [isSuspended, suspensionInfo]);
  // Doc-expiry is its own axis on top of partnerStatus. A partner can be
  // APPROVED but still locked out of write actions (book ride, generate
  // custom invoice) because one of their six required profile documents
  // has lapsed. We surface this as its own state — red pill, locked button —
  // so the partner knows EXACTLY what to fix rather than seeing generic
  // "pending review" copy.
  const hasExpiredDocs = (badges.expiredRequiredDocs?.length ?? 0) > 0;
  const isTabAccessible = useCallback(
    (item: (typeof sidebarItems)[0]) => checkTabAccessible(item, accessLevel),
    [accessLevel],
  );
  const getBadge = (id: TabType) => {
    const k = BADGE_KEYS[id];
    return k ? (badges[k] as number) || 0 : 0;
  };

  // Poll sidebar badges every 30s.
  //
  // Stops polling on 401/403 — once the session role doesn't match this
  // route (logged out, wrong portal opened, account switched), there's
  // no point in continuing to hammer the endpoint every 30s. The errors
  // were filling the server logs with hundreds of identical "Access
  // denied. Required role: PARTNER" entries that drowned real bugs.
  // A full page reload (which re-mounts this component) re-enables the
  // polling, so the user just needs to navigate to the right portal
  // for their role.

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const fetchBadges = async () => {
      try {
        const res = await partnerApi.getSidebarBadges();
        if (cancelled) return;
        if (res.data) {
          setBadges(res.data);
          setBadgesLoaded(true);
        }
        timeoutId = setTimeout(fetchBadges, 30000);
      } catch (err: any) {
        if (cancelled) return;
        // Hard stop: auth-level rejection won't change without a fresh
        // login. Polling further just adds noise.
        if (err?.status === 401 || err?.status === 403) {
          // If the 403 carries PARTNER_SUSPENDED, the correct action is
          // to render the account-suspended screen. We flip the fallback
          // flag AND treat badges as loaded so the render can proceed.
          const code =
            err?.code ??
            err?.data?.code ??
            err?.response?.data?.code ??
            err?.body?.code;
          if (code === "PARTNER_SUSPENDED") {
            setSuspendedByError(true);
            setBadgesLoaded(true);
          }
          return;
        }
        // Soft retry for transient network errors etc.
        timeoutId = setTimeout(fetchBadges, 30000);
      }
    };
    fetchBadges();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Auto-redirect to profile if current tab is inaccessible
  useEffect(() => {
    if (!badgesLoaded) return;
    const currentItem = sidebarItems.find((i) => i.id === activeTab);
    if (currentItem && !isTabAccessible(currentItem)) {
      setActiveTab("profile");
    }
  }, [badgesLoaded, isTabAccessible, activeTab]);

  const refreshBadges = async () => {
    try {
      const res = await partnerApi.getSidebarBadges();
      if (res.data) setBadges(res.data);
    } catch {}
  };

  const handleTabChange = (tab: string) => {
    const t = tab as TabType;
    const targetItem = sidebarItems.find((i) => i.id === t);
    if (targetItem && !isTabAccessible(targetItem)) {
      if (accessLevel === "any") {
        showNotification(
          "warning",
          "Complete your profile and submit for review to access this section.",
        );
      } else if (t === "book") {
        showNotification(
          "warning",
          "Booking requires profile approval. Your profile is currently under review.",
        );
      } else {
        showNotification("warning", "This section is not yet available.");
      }
      return;
    }
    if (t !== "bookings") setBookingsDateFilter(null);
    setActiveTab(t);
    setMobileMenuOpen(false);
  };

  const handleCalendarDateClick = (dateStr: string) => {
    setBookingsDateFilter(dateStr);
    setActiveTab("bookings" as TabType);
    setMobileMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // Auth guard. Same pattern as the other portals: wait for the
  // session check (isLoading) before deciding to redirect, otherwise
  // a refresh briefly sees isAuthenticated=false and bounces the user
  // to home before the session restores.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/");
    } else if (user?.role !== "PARTNER") {
      router.push(`/dashboard/${user?.role?.toLowerCase()}`);
    }
  }, [isAuthenticated, isLoading, user, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-luxury-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  const SidebarBtn = ({
    item,
    mobile,
  }: {
    item: (typeof sidebarItems)[0];
    mobile: boolean;
  }) => {
    const Icon = item.icon;
    const badge = getBadge(item.id);
    const disabled = !isTabAccessible(item);
    const active = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleTabChange(item.id)}
        title={!sidebarOpen && !mobile ? item.label : undefined}
        className={`group relative w-full flex items-center gap-3 px-3 ${mobile ? "h-12" : "h-11"} rounded-lg transition-colors ${disabled ? "text-gray-600 cursor-not-allowed opacity-50" : active ? "bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/30" : "text-gray-400 hover:text-white hover:bg-neutral-800"}`}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {(mobile || sidebarOpen) && (
          <>
            <span className="text-sm truncate flex-1 text-left">
              {item.label}
            </span>
            {badge > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-luxury-gold text-black rounded-full font-semibold min-w-[20px] text-center">
                {badge}
              </span>
            )}
            {disabled && <ShieldAlert className="w-3.5 h-3.5 text-gray-600" />}
          </>
        )}
        {!mobile && !sidebarOpen && badge > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] bg-luxury-gold text-black rounded-full font-semibold flex items-center justify-center">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
        {!mobile && !sidebarOpen && (
          <span className="absolute left-full ml-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            {item.label}
            {badge > 0 ? ` (${badge})` : ""}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-luxury-dark flex w-full max-w-full overflow-x-hidden">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
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
            <p className="text-xs text-gray-500 mb-1">Partner Portal</p>
            <p className="text-sm font-medium text-white truncate">
              {user?.name || "Partner"}
            </p>
            {!isApproved &&
              badgesLoaded &&
              (() => {
                const isPartnerEditingSelfRequest =
                  badges.partnerStatus === "CHANGES_REQUESTED" &&
                  badges.hasActiveRejections === false;
                const label =
                  accessLevel === "any"
                    ? "Profile Incomplete"
                    : isPartnerEditingSelfRequest
                      ? "Editing"
                      : "Pending Approval";
                const cls = isPartnerEditingSelfRequest
                  ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20";
                return (
                  <span
                    className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs rounded border ${cls}`}
                  >
                    <ShieldAlert className="w-3 h-3" />
                    {label}
                  </span>
                );
              })()}
          </div>
          <nav className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              {sidebarItems.map((i) => (
                <SidebarBtn key={i.id} item={i} mobile />
              ))}
            </div>
          </nav>
          <div className="p-3 border-t border-neutral-800 space-y-1 pb-safe">
            <Link
              href="/"
              className="w-full flex items-center gap-3 px-3 h-12 rounded-lg text-gray-400 hover:text-white hover:bg-neutral-800 transition-colors"
            >
              <Home className="w-5 h-5" />
              <span className="text-sm">Back to Home</span>
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 h-12 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-5 h-5" />
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
            <p className="text-xs text-gray-500 mb-0.5">Partner Portal</p>
            <p className="text-sm font-medium text-white truncate">
              {user?.name || "Partner"}
            </p>
            {!isApproved &&
              badgesLoaded &&
              (() => {
                const isPartnerEditingSelfRequest =
                  badges.partnerStatus === "CHANGES_REQUESTED" &&
                  badges.hasActiveRejections === false;
                const label =
                  accessLevel === "any"
                    ? "Profile Incomplete"
                    : isPartnerEditingSelfRequest
                      ? "Editing"
                      : "Pending Approval";
                const cls = isPartnerEditingSelfRequest
                  ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20";
                return (
                  <span
                    className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs rounded border ${cls}`}
                  >
                    <ShieldAlert className="w-3 h-3" />
                    {label}
                  </span>
                );
              })()}
          </div>
        )}
        <nav className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {sidebarItems.map((i) => (
              <SidebarBtn key={i.id} item={i} mobile={false} />
            ))}
          </div>
        </nav>
        <div className="p-2 border-t border-neutral-800 space-y-1">
          <Link
            href="/"
            title={!sidebarOpen ? "Back to Home" : undefined}
            className="group relative w-full flex items-center gap-3 px-3 h-11 rounded-lg text-gray-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <Home className="w-5 h-5" />
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
            <LogOut className="w-5 h-5" />
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
        className={`flex-1 min-w-0 w-full transition-all duration-300 ${sidebarOpen ? "lg:ml-56 xl:ml-64" : "lg:ml-16"}`}
      >
        <header className="lg:hidden h-16 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 sticky top-0 z-30">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 text-gray-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <p className="text-sm font-medium text-white">
            {sidebarItems.find((i) => i.id === activeTab)?.label}
          </p>
          <div className="relative">
            <ProfileImage
              src={badges.logoUrl}
              alt={user?.name || "Partner"}
              size="xs"
              variant="partner"
              shape="circle"
              fallbackText={user?.name || undefined}
              border={false}
            />
            {badges.notifications > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] bg-luxury-gold text-black rounded-full font-bold flex items-center justify-center">
                {badges.notifications > 9 ? "9+" : badges.notifications}
              </span>
            )}
          </div>
        </header>
        <header className="hidden lg:flex h-16 bg-neutral-900/50 backdrop-blur-sm border-b border-neutral-800 items-center justify-between px-6 sticky top-0 z-30">
          <div>
            <h1 className="text-lg font-semibold text-white">
              {sidebarItems.find((i) => i.id === activeTab)?.label}
            </h1>
            <p className="text-xs text-gray-500">
              Welcome back, {user?.name || "Partner"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Status pill — visible from any tab so the partner always knows
                their state. Precedence (highest first):
                1. Suspended → red "Account Suspended" — admin pulled access
                2. Doc expired → red, specific to the doc
                3. Partner in CHANGES_REQUESTED with no admin rejections
                   (all outstanding items are partner-requested edits) →
                   sky "Editing your profile" — not a corrective state
                4. Not approved yet → amber "Profile Pending Approval"
                Suspended wins because it's the broadest block — the partner
                shouldn't see "Profile Pending Approval" if admin has fully
                pulled their access. */}
            {badgesLoaded &&
              (isSuspended || hasExpiredDocs || !isApproved) &&
              (() => {
                const isPartnerEditingSelfRequest =
                  !isSuspended &&
                  !hasExpiredDocs &&
                  !isApproved &&
                  badges.partnerStatus === "CHANGES_REQUESTED" &&
                  badges.hasActiveRejections === false;
                return (
                  <span
                    title={
                      isSuspended
                        ? "Your account has been suspended. Open Notifications to see the reason and contact admin."
                        : hasExpiredDocs
                          ? `Expired: ${badges.expiredRequiredDocs.map((d) => d.label).join(", ")}. Renew via the profile change-request flow.`
                          : isPartnerEditingSelfRequest
                            ? "You asked to edit your profile — make your changes and resubmit."
                            : accessLevel === "any"
                              ? "Complete your profile to begin"
                              : "Your profile is being reviewed by our team"
                    }
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border ${
                      isSuspended || hasExpiredDocs
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : isPartnerEditingSelfRequest
                          ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    {isSuspended
                      ? "Account Suspended"
                      : hasExpiredDocs
                        ? badges.expiredRequiredDocs.length === 1
                          ? `${badges.expiredRequiredDocs[0].label} Expired`
                          : `${badges.expiredRequiredDocs.length} Documents Expired`
                        : isPartnerEditingSelfRequest
                          ? "Editing Your Profile"
                          : accessLevel === "any"
                            ? "Profile Incomplete"
                            : "Profile Pending Approval"}
                  </span>
                );
              })()}
            <div className="text-right">
              <p className="text-sm font-medium text-white">{user?.name}</p>
              <p className="text-xs text-luxury-gold">{user?.email}</p>
            </div>
            <ProfileImage
              src={badges.logoUrl}
              alt={user?.name || "Partner"}
              size="sm"
              variant="partner"
              shape="circle"
              fallbackText={user?.name || undefined}
            />
          </div>
        </header>

        <div className="p-4 lg:p-6 w-full max-w-full overflow-x-hidden">
          {/* Suspended takes precedence over every other render branch
              EXCEPT notifications — the partner needs to read the
              suspension notification (which carries the admin's
              reason) to understand what happened and what to do
              next. We let them stay on that single tab; every other
              tab routes here instead of mounting its panel, which
              prevents the toast spam that would otherwise fire on
              every panel's failed API call. */}
          {isSuspended ? (
            <div className="flex flex-col items-center justify-center py-16 text-center max-w-lg mx-auto">
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                <ShieldAlert className="w-10 h-10 text-red-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-3">
                Account Suspended
              </h3>
              <p className="text-gray-400 mb-5 leading-relaxed">
                Your LuxDrive partner account has been suspended by the admin.
                Portal access is disabled until the suspension is lifted.
              </p>
              {/* Reason panel — verbatim from admin. Falls back to a generic
                  line if the API hasn't returned yet or omitted a reason. */}
              <div className="w-full mb-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-left">
                <p className="text-xs uppercase tracking-wider text-red-400 font-semibold mb-1.5">
                  Reason
                </p>
                <p className="text-sm text-red-100 whitespace-pre-wrap break-words">
                  {suspensionInfo?.reason ??
                    "Contact your admin to see the reason for suspension."}
                </p>
                {suspensionInfo?.suspendedAt && (
                  <p className="mt-2 text-[11px] text-red-400/70">
                    Suspended on{" "}
                    {new Date(suspensionInfo.suspendedAt).toLocaleDateString(
                      undefined,
                      { year: "numeric", month: "short", day: "numeric" },
                    )}
                  </p>
                )}
              </div>
              {/* Support contact CTAs. WhatsApp is the primary — deep-links
                  to a chat pre-filled with the partner's company context.
                  Email is a secondary fallback. */}
              <div className="w-full flex flex-col sm:flex-row gap-3">
                <a
                  href={
                    suspensionInfo?.support.whatsappUrl ??
                    "https://wa.me/966545559510"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-400 transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  Contact Admin on WhatsApp
                </a>
                <a
                  href={`mailto:${suspensionInfo?.support.email ?? "info@luxdriveksa.com"}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-neutral-800 text-white font-medium rounded-lg hover:bg-neutral-700 transition-colors border border-neutral-700"
                >
                  <Mail className="w-5 h-5" />
                  Email Admin
                </a>
              </div>
              {suspensionInfo?.support.whatsapp && (
                <p className="mt-4 text-xs text-gray-500">
                  Support line: {suspensionInfo.support.whatsapp}
                </p>
              )}
            </div>
          ) : badgesLoaded &&
            sidebarItems.find((i) => i.id === activeTab) &&
            !isTabAccessible(sidebarItems.find((i) => i.id === activeTab)!) ? (
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
                  : "Your profile is currently under review. Once approved, you'll be able to book rides."}
              </p>
              <button
                onClick={() => setActiveTab("profile")}
                className="flex items-center gap-2 px-6 py-3 bg-luxury-gold text-black font-medium rounded-lg hover:bg-luxury-gold/90 transition-colors"
              >
                <Building2 className="w-5 h-5" /> Go to Profile
              </button>
            </div>
          ) : (
            <>
              {activeTab === "dashboard" && (
                <DashboardPanel
                  onTabChange={handleTabChange}
                  onCalendarDateClick={handleCalendarDateClick}
                  refreshBadges={refreshBadges}
                />
              )}
              {activeTab === "book" && (
                <BookRidePanel
                  onSuccess={() => {
                    handleTabChange("bookings");
                    refreshBadges();
                  }}
                  partnerStatus={badges.partnerStatus}
                  expiredRequiredDocs={badges.expiredRequiredDocs}
                />
              )}
              {activeTab === "bookings" && (
                <BookingsPanel
                  refreshBadges={refreshBadges}
                  initialDateFilter={bookingsDateFilter}
                />
              )}
              {activeTab === "invoices" && (
                <InvoicesPanel
                  refreshBadges={refreshBadges}
                  partnerStatus={badges.partnerStatus}
                  expiredRequiredDocs={badges.expiredRequiredDocs}
                />
              )}
              {activeTab === "profile" && (
                <ProfilePanel
                  refreshBadges={refreshBadges}
                  isApproved={isApproved}
                  sidebarOpen={sidebarOpen}
                />
              )}
              {activeTab === "reports" && <ReportsAnalyticsPanel />}
              {activeTab === "notifications" && (
                <NotificationsPanel
                  onTabChange={handleTabChange}
                  refreshBadges={refreshBadges}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// Default export — wraps the dashboard in a Suspense boundary so that
// useSearchParams() inside doesn't crash the production build. The
// fallback shows the same full-screen Loader2 that other parts of the
// portal use during initial hydration, so the transition feels
// continuous with the rest of the loading states. In practice this
// fallback flashes for a frame or two at most before the inner tree
// mounts.
export default function PartnerDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-luxury-black flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      }
    >
      <PartnerDashboardInner />
    </Suspense>
  );
}
