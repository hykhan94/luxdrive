"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LEADS, BOOKINGS, CUSTOMERS } from "@/lib/dummy-data";
import BookingList from "@/components/admin/booking-list";
import {
  Users,
  TrendingUp,
  DollarSign,
  Calendar,
  Search,
  Loader2,
  AlertCircle,
  Gift,
  Plus,
  Minus,
  Award,
} from "lucide-react";
import DashboardHeader from "@/components/shared/dashboard-header";
import { useNotification } from "@/lib/notification-context";

// Mock unactioned bookings
const unactionedBookings = [
  {
    id: "BK-2024-007",
    customer: "Fatima Al-Saud",
    tripDate: "2026-03-31",
    tripTime: "10:00",
    createdAt: "2026-03-28T08:30:00",
    hoursAgo: 48,
  },
  {
    id: "BK-2024-008",
    customer: "Omar Khan",
    tripDate: "2026-03-31",
    tripTime: "15:00",
    createdAt: "2026-03-29T14:00:00",
    hoursAgo: 16,
  },
];

type TabType = "bookings" | "loyalty";

export default function SalesDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<TabType>("bookings");
  const [selectedCustomer, setSelectedCustomer] = useState<
    (typeof CUSTOMERS)[0] | null
  >(null);
  const [pointsAdjustment, setPointsAdjustment] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [loyaltySearchQuery, setLoyaltySearchQuery] = useState("");

  useEffect(() => {
    // Wait for session check before deciding to redirect. On refresh,
    // isAuthenticated is briefly false while the session loads — without
    // this guard the user gets bounced to home every time they refresh.
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/");
    } else if (user?.role !== "SALES") {
      router.push(`/dashboard/${user?.role?.toLowerCase()}`);
    }
  }, [isAuthenticated, isLoading, user, router]);

  if (isLoading || !isAuthenticated || user?.role !== "SALES") {
    return (
      <div className="min-h-screen bg-luxury-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
      </div>
    );
  }

  // Calculate metrics
  const totalLeads = LEADS.length;
  const convertedLeads = LEADS.filter((l) => l.status === "converted").length;
  const conversionRate = ((convertedLeads / totalLeads) * 100).toFixed(0);
  const totalPipeline = LEADS.filter(
    (l) => l.status !== "lost" && l.status !== "converted",
  ).reduce((sum, l) => sum + l.estimatedValue, 0);
  const recentBookings = BOOKINGS.filter(
    (b) => b.status === "confirmed",
  ).length;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `SAR ${(value / 1000).toFixed(0)}K`;
    }
    return `SAR ${value}`;
  };

  const getTimeSince = (dateStr: string) => {
    const created = new Date(dateStr);
    const now = new Date();
    const hours = Math.floor(
      (now.getTime() - created.getTime()) / (1000 * 60 * 60),
    );
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const handlePointsAdjustment = (type: "add" | "deduct") => {
    if (!selectedCustomer || pointsAdjustment <= 0) return;
    // In real app, this would call an API
    showNotification(
      "success",
      `${type === "add" ? "Added" : "Deducted"} ${pointsAdjustment} points ${type === "add" ? "to" : "from"} ${selectedCustomer.name}`,
    );
    setPointsAdjustment(0);
    setAdjustmentReason("");
  };

  return (
    <>
      <DashboardHeader
        title="Sales Dashboard"
        subtitle="Manage leads, bookings, and customer loyalty"
      />
      <div className="min-h-screen bg-luxury-dark pt-24 pb-8">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {/* Alert Badge for Unactioned Bookings */}
          {unactionedBookings.length > 0 && (
            <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Unactioned Bookings</p>
                  <p className="text-sm text-orange-300">
                    {unactionedBookings.length} bookings require attention
                    before their trip date
                  </p>
                </div>
              </div>
              <span className="px-4 py-2 bg-orange-500 text-white font-bold rounded-full">
                {unactionedBookings.length}
              </span>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-sm text-gray-400">Total Leads</span>
              </div>
              <p className="text-2xl font-bold text-white">{totalLeads}</p>
            </div>

            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-400" />
                </div>
                <span className="text-sm text-gray-400">Conversion Rate</span>
              </div>
              <p className="text-2xl font-bold text-white">{conversionRate}%</p>
            </div>

            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-luxury-gold/10 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-luxury-gold" />
                </div>
                <span className="text-sm text-gray-400">Pipeline Value</span>
              </div>
              <p className="text-2xl font-bold text-luxury-gold">
                {formatCurrency(totalPipeline)}
              </p>
            </div>

            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-purple-400" />
                </div>
                <span className="text-sm text-gray-400">New Bookings</span>
              </div>
              <p className="text-2xl font-bold text-white">{recentBookings}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
            {(["bookings", "loyalty"] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium capitalize whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? "bg-luxury-gold text-black"
                    : "bg-neutral-800 text-gray-400 hover:text-white"
                }`}
              >
                {tab === "loyalty" && <Gift className="w-4 h-4" />}
                {tab === "loyalty" ? "Loyalty Points" : tab}
              </button>
            ))}
          </div>

          {/* Bookings Tab */}
          {activeTab === "bookings" && <BookingList />}

          {/* Loyalty Points Tab */}
          {activeTab === "loyalty" && (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Customer List */}
              <div className="lg:col-span-2">
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-neutral-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <h3 className="font-semibold text-white">
                        Customer Loyalty Points
                      </h3>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                          type="text"
                          placeholder="Search customers..."
                          value={loyaltySearchQuery}
                          onChange={(e) =>
                            setLoyaltySearchQuery(e.target.value)
                          }
                          className="w-full sm:w-64 pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-luxury-gold"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-neutral-800">
                    {CUSTOMERS.filter(
                      (customer) =>
                        customer.name
                          .toLowerCase()
                          .includes(loyaltySearchQuery.toLowerCase()) ||
                        customer.email
                          .toLowerCase()
                          .includes(loyaltySearchQuery.toLowerCase()),
                    ).map((customer) => {
                      // Mock loyalty data
                      const points = Math.floor(customer.totalSpent / 10);
                      const tier =
                        points >= 3000
                          ? "Platinum"
                          : points >= 1500
                            ? "Gold"
                            : points >= 500
                              ? "Silver"
                              : "Bronze";
                      const tierColor =
                        tier === "Platinum"
                          ? "text-purple-400"
                          : tier === "Gold"
                            ? "text-yellow-400"
                            : tier === "Silver"
                              ? "text-gray-300"
                              : "text-orange-400";

                      return (
                        <button
                          key={customer.id}
                          onClick={() => setSelectedCustomer(customer)}
                          className={`w-full p-4 text-left hover:bg-neutral-800/50 transition-colors ${
                            selectedCustomer?.id === customer.id
                              ? "bg-neutral-800/50"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-luxury-gold/20 flex items-center justify-center">
                                <span className="text-luxury-gold font-medium">
                                  {customer.name[0]}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-white">
                                  {customer.name}
                                </p>
                                <p className="text-sm text-gray-400">
                                  {customer.email}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-2 justify-end mb-1">
                                <Award className={`w-4 h-4 ${tierColor}`} />
                                <span
                                  className={`text-sm font-medium ${tierColor}`}
                                >
                                  {tier}
                                </span>
                              </div>
                              <p className="text-lg font-bold text-luxury-gold">
                                {points.toLocaleString()} pts
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Points Adjustment Panel */}
              <div className="lg:col-span-1">
                {selectedCustomer ? (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 sticky top-24">
                    <h3 className="text-lg font-semibold text-white mb-4">
                      Adjust Points
                    </h3>

                    <div className="text-center mb-6 p-4 bg-neutral-800 rounded-lg">
                      <p className="text-sm text-gray-400 mb-1">
                        {selectedCustomer.name}
                      </p>
                      <p className="text-3xl font-bold text-luxury-gold">
                        {Math.floor(
                          selectedCustomer.totalSpent / 10,
                        ).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-400">Current Points</p>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Points Amount
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={pointsAdjustment}
                          onChange={(e) =>
                            setPointsAdjustment(parseInt(e.target.value) || 0)
                          }
                          className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-center text-xl font-bold focus:outline-none focus:border-luxury-gold"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-gray-400 mb-2">
                          Reason
                        </label>
                        <input
                          type="text"
                          value={adjustmentReason}
                          onChange={(e) => setAdjustmentReason(e.target.value)}
                          placeholder="e.g., Promotional bonus, Error correction"
                          className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:border-luxury-gold"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => handlePointsAdjustment("add")}
                          disabled={pointsAdjustment <= 0}
                          className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500/20 text-green-400 font-medium rounded-lg hover:bg-green-500/30 transition-colors disabled:opacity-50"
                        >
                          <Plus className="w-4 h-4" />
                          Add Points
                        </button>
                        <button
                          onClick={() => handlePointsAdjustment("deduct")}
                          disabled={pointsAdjustment <= 0}
                          className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500/20 text-red-400 font-medium rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
                        >
                          <Minus className="w-4 h-4" />
                          Deduct Points
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
                    <Gift className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">
                      Select a customer to adjust their loyalty points
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
