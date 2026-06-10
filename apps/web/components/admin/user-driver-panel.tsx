"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Search,
  X,
  ChevronRight,
  ChevronLeft,
  Award,
  Users,
  Loader2,
  UserX,
  RefreshCw,
} from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { useNotification } from "@/lib/notification-context";

// Types matching backend response
interface UserData {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  loyaltyTier: string;
  loyaltyPoints: number;
  successfulTrips: number;
  totalMoneySpent: number;
  upcomingTrips: number;
  authMethod: string;
  authMethods: string[];
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface UserDetail {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  dob: string | null;
  emailVerified: boolean;
  loyaltyTier: string;
  loyaltyPoints: number;
  isActive: boolean;
  authMethod: string;
  authMethods: string[];
  registeredAt: string;
  lastLoginAt: string | null;
  stats: {
    successfulTrips: number;
    totalMoneySpent: number;
    upcomingTrips: number;
    lastTripDate: string | null;
    lastBookingRef: string | null;
  };
  recentBookings: Array<{
    id: string;
    bookingRef: string;
    tripDate: string;
    tripTime: string | null;
    pickupAddress: string | null;
    dropoffAddress: string | null;
    vehicleClass: string;
    totalPrice: number;
    status: string;
    createdAt: string;
    completedAt: string | null;
    vendor: { companyName: string } | null;
  }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ADMIN_BASE = "/api/v1/admin";

export default function UserDriverPanel() {
  const { showNotification } = useNotification();

  // List state
  const [users, setUsers] = useState<UserData[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [tierCounts, setTierCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Detail state
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const tierColors: Record<string, string> = {
    BRONZE: "bg-amber-700/20 text-amber-600 border-amber-600/30",
    SILVER: "bg-gray-400/20 text-gray-300 border-gray-400/30",
    GOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    PLATINUM: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  };

  // Fetch users from backend
  const fetchUsers = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      try {
        const params: Record<string, string | number> = { page, limit: 10 };
        if (searchQuery) params.search = searchQuery;
        if (tierFilter !== "all") params.tier = tierFilter;
        if (statusFilter) params.status = statusFilter;

        const res = await api.get(`${ADMIN_BASE}/users`, params);
        if (res.success && res.data) {
          setUsers(res.data.users);
          setPagination(res.data.pagination);
          if (res.data.tierCounts) setTierCounts(res.data.tierCounts);
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load users");
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery, tierFilter, statusFilter, showNotification],
  );

  // Initial load and refetch on filter changes
  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch user detail
  const handleSelectUser = async (userId: string) => {
    setIsLoadingDetail(true);
    try {
      const res = await api.get(`${ADMIN_BASE}/users/${userId}`);
      if (res.success && res.data) {
        setSelectedUser(res.data);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load user details");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Deactivate user
  const handleDeactivate = async (userId: string) => {
    setIsDeactivating(true);
    try {
      const res = await api.patch(`${ADMIN_BASE}/users/${userId}/deactivate`, {
        reason: "Deactivated by admin",
      });
      if (res.success) {
        showNotification("success", res.message || "User deactivated");
        // Refresh the detail and list
        if (selectedUser?.id === userId) {
          handleSelectUser(userId);
        }
        fetchUsers(pagination.page);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to deactivate user");
    } finally {
      setIsDeactivating(false);
    }
  };

  // Reactivate user
  const handleReactivate = async (userId: string) => {
    setIsDeactivating(true);
    try {
      const res = await api.patch(`${ADMIN_BASE}/users/${userId}/reactivate`);
      if (res.success) {
        showNotification("success", res.message || "User reactivated");
        if (selectedUser?.id === userId) {
          handleSelectUser(userId);
        }
        fetchUsers(pagination.page);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to reactivate user");
    } finally {
      setIsDeactivating(false);
    }
  };

  const formatTier = (tier: string) =>
    tier.charAt(0) + tier.slice(1).toLowerCase();

  const showSidePanel = selectedUser;

  return (
    <div className="relative">
      <div
        className={`grid gap-6 transition-all duration-300 ${showSidePanel ? "lg:grid-cols-[1fr,400px]" : ""}`}
      >
        {/* Main Content */}
        <div className="space-y-6 min-w-0">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            {/* Header with search and filters */}
            <div className="p-4 border-b border-neutral-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white">
                    Customers
                  </h3>
                  <span className="text-sm text-gray-400">
                    {pagination.total} total
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search by name, email, phone..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="w-full sm:w-64 pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-luxury-gold"
                  />
                </div>
              </div>

              {/* Tier filter tabs */}
              <div className="flex flex-wrap gap-2">
                {["all", "BRONZE", "SILVER", "GOLD", "PLATINUM"].map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setTierFilter(tier)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      tierFilter === tier
                        ? "bg-luxury-gold text-black font-semibold"
                        : "bg-neutral-800 text-gray-400 hover:bg-neutral-700"
                    }`}
                  >
                    {tier === "all" ? "All" : formatTier(tier)}
                    {tierCounts[tier] !== undefined && (
                      <span className="ml-1 opacity-70">
                        ({tierCounts[tier]})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Loading state */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="p-12">
                <Empty>
                  <EmptyMedia>
                    <div className="w-20 h-20 bg-neutral-800 rounded-full flex items-center justify-center mb-4">
                      <Users className="w-10 h-10 text-gray-500" />
                    </div>
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle className="text-white">
                      No customers found
                    </EmptyTitle>
                    <EmptyDescription className="text-gray-400">
                      {searchQuery
                        ? "Try adjusting your search query"
                        : "No customers registered yet"}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-neutral-800/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Tier
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Points
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Trips
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Spent
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Upcoming
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Auth
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {users.map((user) => (
                        <tr
                          key={user.id}
                          onClick={() => handleSelectUser(user.id)}
                          className={`cursor-pointer hover:bg-neutral-800/50 ${selectedUser?.id === user.id ? "bg-luxury-gold/10" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-luxury-gold/20 flex items-center justify-center shrink-0">
                                <span className="text-luxury-gold font-medium text-sm">
                                  {user.name[0]?.toUpperCase() || "?"}
                                </span>
                              </div>
                              <div>
                                <p className="text-white text-sm font-medium">
                                  {user.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 text-xs rounded-full border ${tierColors[user.loyaltyTier] || "bg-neutral-800 text-gray-400"}`}
                            >
                              {formatTier(user.loyaltyTier)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-yellow-400 text-sm font-medium">
                            {user.loyaltyPoints.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-white text-sm">
                            {user.successfulTrips}
                          </td>
                          <td className="px-4 py-3 text-luxury-gold text-sm font-medium">
                            SAR {Number(user.totalMoneySpent).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            {user.upcomingTrips > 0 ? (
                              <span className="text-green-400 text-sm">
                                {user.upcomingTrips}
                              </span>
                            ) : (
                              <span className="text-gray-500 text-sm">
                                None
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-400 capitalize">
                              {user.authMethod}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 text-xs rounded-full border ${
                                user.isActive
                                  ? "bg-green-500/10 text-green-400 border-green-500/30"
                                  : "bg-gray-500/10 text-gray-400 border-gray-500/30"
                              }`}
                            >
                              {user.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-neutral-800">
                  {users.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleSelectUser(user.id)}
                      className={`w-full p-4 text-left hover:bg-neutral-800/50 ${selectedUser?.id === user.id ? "bg-luxury-gold/10" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-luxury-gold/20 flex items-center justify-center">
                            <span className="text-luxury-gold font-medium text-sm">
                              {user.name[0]?.toUpperCase() || "?"}
                            </span>
                          </div>
                          <div>
                            <p className="text-white font-medium text-sm">
                              {user.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs rounded-full border ${tierColors[user.loyaltyTier] || ""}`}
                        >
                          {formatTier(user.loyaltyTier)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                        <div className="bg-neutral-800 rounded-lg p-2">
                          <p className="text-white text-sm font-semibold">
                            {user.successfulTrips}
                          </p>
                          <p className="text-[10px] text-gray-500">Trips</p>
                        </div>
                        <div className="bg-neutral-800 rounded-lg p-2">
                          <p className="text-luxury-gold text-sm font-semibold">
                            {Number(user.totalMoneySpent) >= 1000
                              ? (Number(user.totalMoneySpent) / 1000).toFixed(
                                  1,
                                ) + "k"
                              : Number(user.totalMoneySpent)}
                          </p>
                          <p className="text-[10px] text-gray-500">Spent</p>
                        </div>
                        <div className="bg-neutral-800 rounded-lg p-2">
                          <p className="text-yellow-400 text-sm font-semibold">
                            {user.loyaltyPoints.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-gray-500">Points</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1}-
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total,
                  )}{" "}
                  of {pagination.total}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchUsers(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="p-1.5 bg-neutral-800 text-white rounded disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => fetchUsers(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="p-1.5 bg-neutral-800 text-white rounded disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side Panel — User Detail */}
        {showSidePanel && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl h-fit sticky top-24">
            {isLoadingDetail ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
              </div>
            ) : (
              selectedUser && (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-semibold text-white">
                      Customer Details
                    </h3>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="p-1 hover:bg-neutral-800 rounded"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  {/* Avatar & Name */}
                  <div className="text-center mb-5">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-luxury-gold to-luxury-gold/60 flex items-center justify-center mx-auto mb-3">
                      <span className="text-black text-2xl font-bold">
                        {selectedUser.name[0]?.toUpperCase() || "?"}
                      </span>
                    </div>
                    <h4 className="text-lg font-semibold text-white">
                      {selectedUser.name}
                    </h4>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <span
                        className={`px-2 py-1 text-xs rounded-full border ${tierColors[selectedUser.loyaltyTier] || ""}`}
                      >
                        {formatTier(selectedUser.loyaltyTier)}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs rounded-full border ${
                          selectedUser.isActive
                            ? "bg-green-500/10 text-green-400 border-green-500/30"
                            : "bg-gray-500/10 text-gray-400 border-gray-500/30"
                        }`}
                      >
                        {selectedUser.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Member since{" "}
                      {new Date(selectedUser.registeredAt).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          year: "numeric",
                        },
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">
                      Auth: {selectedUser.authMethod}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {/* Points */}
                    <div className="p-3 bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/20 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Award className="w-5 h-5 text-yellow-400" />
                          <span className="text-sm text-gray-300">
                            Points Balance
                          </span>
                        </div>
                        <p className="text-xl font-bold text-yellow-400">
                          {selectedUser.loyaltyPoints.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-neutral-800 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">
                          Email
                        </p>
                        <p className="text-white text-xs truncate">
                          {selectedUser.email}
                        </p>
                      </div>
                      <div className="p-3 bg-neutral-800 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase">
                          Phone
                        </p>
                        <p className="text-white text-xs">
                          {selectedUser.phone || "Not set"}
                        </p>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-neutral-800 rounded-lg text-center">
                        <p className="text-xl font-bold text-white">
                          {selectedUser.stats.successfulTrips}
                        </p>
                        <p className="text-[10px] text-gray-500">Total Trips</p>
                      </div>
                      <div className="p-3 bg-neutral-800 rounded-lg text-center">
                        <p className="text-xl font-bold text-luxury-gold">
                          SAR{" "}
                          {Number(selectedUser.stats.totalMoneySpent) >= 1000
                            ? (
                                Number(selectedUser.stats.totalMoneySpent) /
                                1000
                              ).toFixed(1) + "k"
                            : Number(selectedUser.stats.totalMoneySpent)}
                        </p>
                        <p className="text-[10px] text-gray-500">Total Spent</p>
                      </div>
                    </div>

                    {/* Upcoming & Last Trip */}
                    <div className="p-3 bg-neutral-800 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400">
                          Upcoming Trips
                        </span>
                        {selectedUser.stats.upcomingTrips > 0 ? (
                          <span className="text-green-400 font-semibold">
                            {selectedUser.stats.upcomingTrips}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-xs">
                            None scheduled
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Last Trip</span>
                        <span className="text-white text-xs">
                          {selectedUser.stats.lastTripDate
                            ? new Date(
                                selectedUser.stats.lastTripDate,
                              ).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "No trips yet"}
                        </span>
                      </div>
                    </div>

                    {/* Deactivate / Reactivate Button */}
                    <div className="pt-2">
                      {selectedUser.isActive ? (
                        <button
                          onClick={() => handleDeactivate(selectedUser.id)}
                          disabled={isDeactivating}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-medium disabled:opacity-50"
                        >
                          {isDeactivating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserX className="w-4 h-4" />
                          )}
                          Deactivate User
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(selectedUser.id)}
                          disabled={isDeactivating}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/20 transition-colors text-sm font-medium disabled:opacity-50"
                        >
                          {isDeactivating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          Reactivate User
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
