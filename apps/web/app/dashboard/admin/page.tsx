"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import OverviewPanel from "@/components/admin/overview-panel";
import BookingList from "@/components/admin/booking-list";
import PricingStrategyPanel from "@/components/admin/pricing-strategy-panel";
import AdminSettingsPanel from "@/components/admin/admin-settings-panel";
import CitiesPanel from "@/components/admin/cities-panel";
import PaymentsPanel from "@/components/admin/payments-panel";
import UserDriverPanel from "@/components/admin/user-driver-panel";
import RoleManagerPanel from "@/components/admin/role-manager-panel";
import PartnerManagementPanel from "@/components/admin/partner-management-panel";
import VendorManagementPanel from "@/components/admin/vendor-management-panel";
import Logo, { LogoBadge } from "@/components/shared/logo";
import {
  Users,
  DollarSign,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Bell,
  Shield,
  Building2,
  X,
  CalendarDays,
  Handshake,
  Home,
  LogOut,
  Menu,
  User,
  MapPin,
  CreditCard,
  Grid3X3,
} from "lucide-react";
import Link from "next/link";
import { useNotification } from "@/lib/notification-context";
import { api } from "@/lib/api";

type TabType =
  | "overview"
  | "bookings"
  | "pricing"
  | "cities"
  | "payments"
  | "partners"
  | "vendors"
  | "settings"
  | "users"
  | "roles";

// Sidebar items for admin portal
const adminSidebarItems = [
  { id: "overview" as TabType, label: "Overview", icon: Grid3X3 },
  { id: "bookings" as TabType, label: "Bookings", icon: CalendarDays },
  { id: "pricing" as TabType, label: "Pricing Strategy", icon: DollarSign },
  { id: "cities" as TabType, label: "Cities", icon: MapPin },
  { id: "payments" as TabType, label: "Payments", icon: CreditCard },
  { id: "partners" as TabType, label: "Partners", icon: Handshake },
  { id: "vendors" as TabType, label: "Vendors", icon: Building2 },
  { id: "settings" as TabType, label: "Alerts & Settings", icon: Bell },
  { id: "users" as TabType, label: "Users", icon: Users },
  { id: "roles" as TabType, label: "Role Manager", icon: Shield },
];

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [customerSearch, setCustomerSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  // Add state near the top of AdminDashboard
  const [sidebarBadges, setSidebarBadges] = useState<Record<string, number>>(
    {},
  );

  // ============== DEEP-LINK STATE ==============
  // When the overview banner opens a popover row, the user gets
  // sent to the relevant management panel (vendors / partners /
  // bookings) AND that panel is expected to auto-open the specific
  // entity. We stash the id here; the destination panel reads it
  // via a prop, consumes it once, then clears (so navigating away
  // and back doesn't re-open the same entity).
  //
  // Using nullable single-slot state per entity type rather than a
  // single union — keeps the consuming panels' prop typing simple.
  const [pendingVendorId, setPendingVendorId] = useState<string | null>(null);
  const [pendingPartnerId, setPendingPartnerId] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);

  //badge fetch to a named function (not just inside useEffect)
  const fetchSidebarBadges = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/admin/sidebar-badges");
      if (res.success && res.data) {
        setSidebarBadges(res.data);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchSidebarBadges();
    const interval = setInterval(fetchSidebarBadges, 60000);
    return () => clearInterval(interval);
  }, [fetchSidebarBadges]);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/");
    } else if (user?.role !== "ADMIN") {
      router.push(`/dashboard/${user?.role?.toLowerCase()}`);
    }
  }, [isAuthenticated, isLoading, user, router]);

  if (isLoading || !isAuthenticated || user?.role !== "ADMIN") {
    return (
      <div className="min-h-screen bg-luxury-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-neutral-900 border-r border-neutral-800 flex flex-col">
            {/* Mobile Header */}
            <div className="h-16 flex items-center justify-between border-b border-neutral-800 px-4">
              <Logo size="sm" showTagline={false} />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Portal Label */}
            <div className="p-3 border-b border-neutral-800">
              <p className="text-xs text-luxury-gold mb-0.5">Admin Portal</p>
              <p className="text-sm font-medium text-white truncate">
                System Administrator
              </p>
            </div>

            {/* Mobile Navigation */}
            <nav className="flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {adminSidebarItems.map((item) => {
                  const Icon = item.icon;
                  const badgeCount =
                    sidebarBadges[
                      item.id === "settings" ? "alertsSettings" : item.id
                    ] || 0;
                  const showBadge = badgeCount > 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 h-12 rounded-lg transition-colors ${
                        activeTab === item.id
                          ? "bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/30"
                          : "text-gray-400 hover:text-white hover:bg-neutral-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm">{item.label}</span>
                      </div>
                      {showBadge && (
                        <span className="px-2 py-0.5 bg-luxury-gold text-black text-xs rounded-full font-medium">
                          {badgeCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Mobile Bottom Actions */}
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
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col fixed left-0 top-0 h-full bg-neutral-900 border-r border-neutral-800 transition-all duration-300 z-40 ${sidebarOpen ? "w-56 xl:w-64" : "w-16"}`}
      >
        {/* Header with Toggle */}
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

        {/* Portal Label */}
        {sidebarOpen && (
          <div className="p-3 border-b border-neutral-800">
            <p className="text-xs text-luxury-gold mb-0.5">Admin Portal</p>
            <p className="text-sm font-medium text-white truncate">
              System Administrator
            </p>
          </div>
        )}

        {/* Desktop Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {adminSidebarItems.map((item) => {
              const Icon = item.icon;
              const badgeCount =
                sidebarBadges[
                  item.id === "settings" ? "alertsSettings" : item.id
                ] || 0;
              const showBadge = badgeCount > 0;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={!sidebarOpen ? item.label : undefined}
                  className={`group relative w-full flex items-center justify-between px-3 h-11 rounded-lg transition-colors ${
                    activeTab === item.id
                      ? "bg-luxury-gold/10 text-luxury-gold border border-luxury-gold/30"
                      : "text-gray-400 hover:text-white hover:bg-neutral-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {sidebarOpen && (
                      <span className="text-sm truncate">{item.label}</span>
                    )}
                  </div>
                  {sidebarOpen && showBadge && (
                    <span className="px-2 py-0.5 bg-luxury-gold text-black text-xs rounded-full font-medium">
                      {badgeCount}
                    </span>
                  )}
                  {!sidebarOpen && showBadge && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-luxury-gold rounded-full" />
                  )}
                  {!sidebarOpen && (
                    <span className="absolute left-full ml-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Desktop Bottom Actions */}
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
        className={`flex-1 min-h-screen transition-all duration-300 overflow-x-hidden ${sidebarOpen ? "lg:ml-56 xl:ml-64" : "lg:ml-16"}`}
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
              {adminSidebarItems.find((i) => i.id === activeTab)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 hidden sm:block">
              {user?.email}
            </span>
            <div className="w-8 h-8 bg-luxury-gold/20 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-luxury-gold" />
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 lg:p-6">
          {/* Dashboard Tab */}
          {activeTab === "overview" && (
            <OverviewPanel
              onTabChange={(tab, deepLink) => {
                // Stash the deep-link target *before* switching tab
                // so the destination panel sees the prop on its
                // very first render rather than racing the change.
                if (deepLink?.openVendorId) {
                  setPendingVendorId(deepLink.openVendorId);
                }
                if (deepLink?.openPartnerId) {
                  setPendingPartnerId(deepLink.openPartnerId);
                }
                if (deepLink?.openBookingId) {
                  setPendingBookingId(deepLink.openBookingId);
                }
                setActiveTab(tab as TabType);
              }}
            />
          )}

          {/* Vendors Tab */}
          {activeTab === "vendors" && (
            <VendorManagementPanel
              initialOpenVendorId={pendingVendorId}
              onInitialOpenConsumed={() => setPendingVendorId(null)}
            />
          )}

          {/* Partners Tab */}
          {activeTab === "partners" && (
            <PartnerManagementPanel
              initialOpenPartnerId={pendingPartnerId}
              onInitialOpenConsumed={() => setPendingPartnerId(null)}
            />
          )}

          {/* Bookings Tab */}
          {activeTab === "bookings" && (
            <BookingList
              showSourceFilter={true}
              initialOpenBookingId={pendingBookingId}
              onInitialOpenConsumed={() => setPendingBookingId(null)}
            />
          )}

          {/* Pricing Strategy Tab */}
          {activeTab === "pricing" && <PricingStrategyPanel />}

          {/* Cities Tab */}
          {activeTab === "cities" && <CitiesPanel />}

          {/* Payments Tab */}
          {activeTab === "payments" && (
            <PaymentsPanel onBadgeUpdate={fetchSidebarBadges} />
          )}

          {/* Users Tab */}
          {activeTab === "users" && <UserDriverPanel />}

          {/* Role Manager Tab */}
          {activeTab === "roles" && <RoleManagerPanel />}

          {/* Alerts & Settings Tab */}
          {activeTab === "settings" && <AdminSettingsPanel />}
        </div>
      </main>
    </div>
  );
}
