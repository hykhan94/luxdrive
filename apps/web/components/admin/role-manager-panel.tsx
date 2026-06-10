"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Users,
  Briefcase,
  HeadphonesIcon,
  Search,
  ChevronUp,
  ChevronDown,
  X,
  UserPlus,
  Shield,
  Clock,
  Loader2,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  ArrowRightLeft,
  Crown,
  Star,
  User,
} from "lucide-react";
import { useNotification } from "@/lib/notification-context";

const ADMIN_BASE = "/api/v1/admin/role-manager";

// Types matching backend
interface DashboardData {
  salesTeam: { total: number; positions: Record<string, number> };
  operationsTeam: { total: number; positions: Record<string, number> };
  totalCustomers: number;
  totalStaff: number;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  position: string | null;
  department: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface AllUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  role: string;
  team: string | null;
  designation: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  changes: any;
  performedBy: { id: string | null; name: string; role: string | null };
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function RoleManagerPanel() {
  const { showNotification } = useNotification();

  // Dashboard state
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [isDashLoading, setIsDashLoading] = useState(true);

  // Team layout state
  const [salesMembers, setSalesMembers] = useState<
    Record<string, TeamMember[]>
  >({ HEAD: [], SENIOR: [], EXECUTIVE: [] });
  const [opsMembers, setOpsMembers] = useState<Record<string, TeamMember[]>>({
    HEAD: [],
    SENIOR: [],
    EXECUTIVE: [],
  });
  const [isTeamLoading, setIsTeamLoading] = useState(true);

  // All users state
  const [allUsers, setAllUsers] = useState<AllUser[]>([]);
  const [userPagination, setUserPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [userSearch, setUserSearch] = useState("");
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [isUsersLoading, setIsUsersLoading] = useState(true);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditPagination, setAuditPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [isAuditLoading, setIsAuditLoading] = useState(false);

  // Modals
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "promote" | "demote" | "remove" | "transfer";
    member: TeamMember;
    team?: string;
  } | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [transferToTeam, setTransferToTeam] = useState("SALES");
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addToTeam, setAddToTeam] = useState<{
    team: string;
    position: string;
  } | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [managedUser, setManagedUser] = useState<AllUser | null>(null);
  const [manageTeam, setManageTeam] = useState("SALES");
  const [managePosition, setManagePosition] = useState("EXECUTIVE");

  // Fetch dashboard
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get(`${ADMIN_BASE}/dashboard`);
      if (res.success) setDashboard(res.data);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load dashboard");
    } finally {
      setIsDashLoading(false);
    }
  }, [showNotification]);

  // Fetch team layouts
  const fetchTeams = useCallback(async () => {
    setIsTeamLoading(true);
    try {
      const [salesRes, opsRes] = await Promise.all([
        api.get(`${ADMIN_BASE}/teams/sales`),
        api.get(`${ADMIN_BASE}/teams/operations`),
      ]);
      if (salesRes.success) setSalesMembers(salesRes.data.members);
      if (opsRes.success) setOpsMembers(opsRes.data.members);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to load teams");
    } finally {
      setIsTeamLoading(false);
    }
  }, [showNotification]);

  // Fetch all users
  const fetchUsers = useCallback(
    async (page = 1) => {
      setIsUsersLoading(true);
      try {
        const params: Record<string, string | number> = { page, limit: 10 };
        if (userSearch) params.search = userSearch;
        if (userRoleFilter !== "all") params.role = userRoleFilter;
        const res = await api.get(`${ADMIN_BASE}/users`, params);
        if (res.success && res.data) {
          setAllUsers(res.data.users);
          setUserPagination(res.data.pagination);
          if (res.data.roleCounts) setRoleCounts(res.data.roleCounts);
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load users");
      } finally {
        setIsUsersLoading(false);
      }
    },
    [userSearch, userRoleFilter, showNotification],
  );

  // Fetch audit logs
  const fetchAuditLogs = useCallback(
    async (page = 1) => {
      setIsAuditLoading(true);
      try {
        const res = await api.get(`${ADMIN_BASE}/audit-logs`, {
          page,
          limit: 10,
        });
        if (res.success && res.data) {
          setAuditLogs(res.data.logs);
          setAuditPagination(res.data.pagination);
        }
      } catch (err: any) {
        showNotification("error", err.message || "Failed to load audit logs");
      } finally {
        setIsAuditLoading(false);
      }
    },
    [showNotification],
  );

  // Initial load
  useEffect(() => {
    fetchDashboard();
    fetchTeams();
  }, [fetchDashboard, fetchTeams]);
  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setUserSearch(userSearchInput), 400);
    return () => clearTimeout(timer);
  }, [userSearchInput]);

  // Load audit logs when expanded
  useEffect(() => {
    if (showAuditLog && auditLogs.length === 0) fetchAuditLogs(1);
  }, [showAuditLog, auditLogs.length, fetchAuditLogs]);

  // Refresh all data
  const refreshAll = () => {
    fetchDashboard();
    fetchTeams();
    fetchUsers(userPagination.page);
  };

  // ============== ACTIONS ==============

  const handlePromote = async (member: TeamMember) => {
    setIsLoading(true);
    try {
      const res = await api.patch(`${ADMIN_BASE}/members/${member.id}/promote`);
      if (res.success) {
        showNotification("success", res.message || "Member promoted");
        refreshAll();
        if (showAuditLog) fetchAuditLogs(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to promote");
    } finally {
      setIsLoading(false);
      setShowConfirmModal(false);
      setConfirmAction(null);
    }
  };

  const handleDemote = async (member: TeamMember) => {
    setIsLoading(true);
    try {
      const res = await api.patch(`${ADMIN_BASE}/members/${member.id}/demote`);
      if (res.success) {
        showNotification("success", res.message || "Member demoted");
        refreshAll();
        if (showAuditLog) fetchAuditLogs(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to demote");
    } finally {
      setIsLoading(false);
      setShowConfirmModal(false);
      setConfirmAction(null);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    setIsLoading(true);
    try {
      const res = await api.patch(`${ADMIN_BASE}/members/${member.id}/remove`);
      if (res.success) {
        showNotification("success", res.message || "Member removed from team");
        refreshAll();
        if (showAuditLog) fetchAuditLogs(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to remove");
    } finally {
      setIsLoading(false);
      setShowConfirmModal(false);
      setConfirmAction(null);
    }
  };

  const handleTransfer = async () => {
    if (!selectedMember) return;
    setIsLoading(true);
    try {
      const res = await api.patch(
        `${ADMIN_BASE}/members/${selectedMember.id}/transfer`,
        {
          targetTeam: transferToTeam,
        },
      );
      if (res.success) {
        showNotification("success", res.message || "Member transferred");
        refreshAll();
        if (showAuditLog) fetchAuditLogs(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to transfer");
    } finally {
      setIsLoading(false);
      setShowTransferModal(false);
      setSelectedMember(null);
    }
  };

  const handleAddToTeam = async (userId: string) => {
    if (!addToTeam) return;
    setIsLoading(true);
    try {
      const res = await api.post(`${ADMIN_BASE}/teams/add`, {
        userId,
        team: addToTeam.team,
        position: addToTeam.position,
      });
      if (res.success) {
        showNotification("success", res.message || "Member added to team");
        refreshAll();
        if (showAuditLog) fetchAuditLogs(1);
      }
    } catch (err: any) {
      showNotification("error", err.message || "Failed to add member");
    } finally {
      setIsLoading(false);
      setShowAddMemberModal(false);
      setAddToTeam(null);
    }
  };

  const handleManageSave = async () => {
    if (!managedUser) return;
    setIsLoading(true);
    try {
      if (manageTeam === "CUSTOMER") {
        // Remove from team
        const res = await api.patch(
          `${ADMIN_BASE}/members/${managedUser.id}/remove`,
        );
        if (res.success)
          showNotification("success", res.message || "Removed from team");
      } else if (managedUser.team && managedUser.team !== manageTeam) {
        // Transfer
        const res = await api.patch(
          `${ADMIN_BASE}/members/${managedUser.id}/transfer`,
          {
            targetTeam: manageTeam,
            position: managePosition,
          },
        );
        if (res.success)
          showNotification("success", res.message || "Transferred");
      } else {
        // Add to team
        const res = await api.post(`${ADMIN_BASE}/teams/add`, {
          userId: managedUser.id,
          team: manageTeam,
          position: managePosition,
        });
        if (res.success)
          showNotification("success", res.message || "Role updated");
      }
      refreshAll();
      if (showAuditLog) fetchAuditLogs(1);
    } catch (err: any) {
      showNotification("error", err.message || "Failed to update role");
    } finally {
      setIsLoading(false);
      setShowManageModal(false);
      setManagedUser(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, member } = confirmAction;
    if (type === "promote") await handlePromote(member);
    else if (type === "demote") await handleDemote(member);
    else if (type === "remove") await handleRemove(member);
  };

  // ============== HELPERS ==============

  const positionLabel = (pos: string | null) =>
    pos === "EXECUTIVE"
      ? "Executive"
      : pos === "SENIOR"
        ? "Senior"
        : pos === "HEAD"
          ? "Head"
          : "—";

  const roleLabel = (role: string) =>
    role === "SALES"
      ? "Sales"
      : role === "OPERATIONS"
        ? "Operations"
        : role === "ADMIN"
          ? "Admin"
          : role === "FINANCE"
            ? "Finance"
            : "Customer";

  const roleColor = (role: string) =>
    role === "SALES"
      ? "bg-blue-500/20 text-blue-400"
      : role === "OPERATIONS"
        ? "bg-purple-500/20 text-purple-400"
        : role === "ADMIN"
          ? "bg-luxury-gold/20 text-luxury-gold"
          : role === "FINANCE"
            ? "bg-orange-500/20 text-orange-400"
            : "bg-green-500/20 text-green-400";

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatDateTime = (d: string) =>
    new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // ============== RENDER ==============

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {isDashLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-8 h-8 text-luxury-gold animate-spin" />
        </div>
      ) : (
        dashboard && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-sm text-gray-400">Sales Team</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {dashboard.salesTeam.total}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {dashboard.salesTeam.positions.HEAD} Head,{" "}
                {dashboard.salesTeam.positions.SENIOR} Senior,{" "}
                {dashboard.salesTeam.positions.EXECUTIVE} Exec
              </p>
            </div>
            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <HeadphonesIcon className="w-5 h-5 text-purple-400" />
                </div>
                <span className="text-sm text-gray-400">Operations Team</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {dashboard.operationsTeam.total}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {dashboard.operationsTeam.positions.HEAD} Head,{" "}
                {dashboard.operationsTeam.positions.SENIOR} Senior,{" "}
                {dashboard.operationsTeam.positions.EXECUTIVE} Exec
              </p>
            </div>
            <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-green-400" />
                </div>
                <span className="text-sm text-gray-400">Customers</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {dashboard.totalCustomers}
              </p>
            </div>
          </div>
        )
      )}

      {/* Org Chart */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">
          Organization Structure
        </h3>
        {isTeamLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-4">
            {/* Sales Team */}
            <div className="flex-1">
              <div className="text-center mb-4">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
                  <Briefcase className="w-4 h-4" /> Sales Team
                </span>
              </div>
              <div className="flex flex-col items-center">
                {/* HEAD */}
                {salesMembers.HEAD.length > 0 ? (
                  salesMembers.HEAD.map((m) => (
                    <OrgChartCard
                      key={m.id}
                      member={m}
                      level="head"
                      color="blue"
                      onPromote={() => {}}
                      onDemote={() => {
                        setConfirmAction({ type: "demote", member: m });
                        setShowConfirmModal(true);
                      }}
                      onRemove={() => {
                        setConfirmAction({ type: "remove", member: m });
                        setShowConfirmModal(true);
                      }}
                      onTransfer={() => {
                        setSelectedMember(m);
                        setTransferToTeam("OPERATIONS");
                        setShowTransferModal(true);
                      }}
                      canPromote={false}
                      canDemote={true}
                    />
                  ))
                ) : (
                  <AddSlot
                    onClick={() => {
                      setAddToTeam({ team: "SALES", position: "HEAD" });
                      setShowAddMemberModal(true);
                    }}
                    label="Add Head"
                  />
                )}
                <div className="w-px h-6 bg-neutral-700" />
                {/* SENIOR */}
                <div className="flex flex-wrap justify-center gap-3">
                  {salesMembers.SENIOR.map((m) => (
                    <OrgChartCard
                      key={m.id}
                      member={m}
                      level="senior"
                      color="blue"
                      onPromote={() => {
                        setConfirmAction({ type: "promote", member: m });
                        setShowConfirmModal(true);
                      }}
                      onDemote={() => {
                        setConfirmAction({ type: "demote", member: m });
                        setShowConfirmModal(true);
                      }}
                      onRemove={() => {
                        setConfirmAction({ type: "remove", member: m });
                        setShowConfirmModal(true);
                      }}
                      onTransfer={() => {
                        setSelectedMember(m);
                        setTransferToTeam("OPERATIONS");
                        setShowTransferModal(true);
                      }}
                      canPromote={true}
                      canDemote={true}
                    />
                  ))}
                  <AddSlot
                    onClick={() => {
                      setAddToTeam({ team: "SALES", position: "SENIOR" });
                      setShowAddMemberModal(true);
                    }}
                    label="+"
                    small
                  />
                </div>
                <div className="w-px h-6 bg-neutral-700" />
                {/* EXECUTIVE */}
                <div className="flex flex-wrap justify-center gap-2">
                  {salesMembers.EXECUTIVE.map((m) => (
                    <OrgChartCard
                      key={m.id}
                      member={m}
                      level="exec"
                      color="blue"
                      onPromote={() => {
                        setConfirmAction({ type: "promote", member: m });
                        setShowConfirmModal(true);
                      }}
                      onDemote={() => {}}
                      onRemove={() => {
                        setConfirmAction({ type: "remove", member: m });
                        setShowConfirmModal(true);
                      }}
                      onTransfer={() => {
                        setSelectedMember(m);
                        setTransferToTeam("OPERATIONS");
                        setShowTransferModal(true);
                      }}
                      canPromote={true}
                      canDemote={false}
                    />
                  ))}
                  <AddSlot
                    onClick={() => {
                      setAddToTeam({ team: "SALES", position: "EXECUTIVE" });
                      setShowAddMemberModal(true);
                    }}
                    label="+"
                    small
                  />
                </div>
              </div>
            </div>

            <div className="hidden lg:flex flex-col items-center justify-center">
              <div className="w-px h-full bg-neutral-700" />
            </div>

            {/* Operations Team */}
            <div className="flex-1">
              <div className="text-center mb-4">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium">
                  <HeadphonesIcon className="w-4 h-4" /> Operations Team
                </span>
              </div>
              <div className="flex flex-col items-center">
                {opsMembers.HEAD.length > 0 ? (
                  opsMembers.HEAD.map((m) => (
                    <OrgChartCard
                      key={m.id}
                      member={m}
                      level="head"
                      color="purple"
                      onPromote={() => {}}
                      onDemote={() => {
                        setConfirmAction({ type: "demote", member: m });
                        setShowConfirmModal(true);
                      }}
                      onRemove={() => {
                        setConfirmAction({ type: "remove", member: m });
                        setShowConfirmModal(true);
                      }}
                      onTransfer={() => {
                        setSelectedMember(m);
                        setTransferToTeam("SALES");
                        setShowTransferModal(true);
                      }}
                      canPromote={false}
                      canDemote={true}
                    />
                  ))
                ) : (
                  <AddSlot
                    onClick={() => {
                      setAddToTeam({ team: "OPERATIONS", position: "HEAD" });
                      setShowAddMemberModal(true);
                    }}
                    label="Add Head"
                  />
                )}
                <div className="w-px h-6 bg-neutral-700" />
                <div className="flex flex-wrap justify-center gap-3">
                  {opsMembers.SENIOR.map((m) => (
                    <OrgChartCard
                      key={m.id}
                      member={m}
                      level="senior"
                      color="purple"
                      onPromote={() => {
                        setConfirmAction({ type: "promote", member: m });
                        setShowConfirmModal(true);
                      }}
                      onDemote={() => {
                        setConfirmAction({ type: "demote", member: m });
                        setShowConfirmModal(true);
                      }}
                      onRemove={() => {
                        setConfirmAction({ type: "remove", member: m });
                        setShowConfirmModal(true);
                      }}
                      onTransfer={() => {
                        setSelectedMember(m);
                        setTransferToTeam("SALES");
                        setShowTransferModal(true);
                      }}
                      canPromote={true}
                      canDemote={true}
                    />
                  ))}
                  <AddSlot
                    onClick={() => {
                      setAddToTeam({ team: "OPERATIONS", position: "SENIOR" });
                      setShowAddMemberModal(true);
                    }}
                    label="+"
                    small
                  />
                </div>
                <div className="w-px h-6 bg-neutral-700" />
                <div className="flex flex-wrap justify-center gap-2">
                  {opsMembers.EXECUTIVE.map((m) => (
                    <OrgChartCard
                      key={m.id}
                      member={m}
                      level="exec"
                      color="purple"
                      onPromote={() => {
                        setConfirmAction({ type: "promote", member: m });
                        setShowConfirmModal(true);
                      }}
                      onDemote={() => {}}
                      onRemove={() => {
                        setConfirmAction({ type: "remove", member: m });
                        setShowConfirmModal(true);
                      }}
                      onTransfer={() => {
                        setSelectedMember(m);
                        setTransferToTeam("SALES");
                        setShowTransferModal(true);
                      }}
                      canPromote={true}
                      canDemote={false}
                    />
                  ))}
                  <AddSlot
                    onClick={() => {
                      setAddToTeam({
                        team: "OPERATIONS",
                        position: "EXECUTIVE",
                      });
                      setShowAddMemberModal(true);
                    }}
                    label="+"
                    small
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* All Users Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-lg font-semibold text-white">All Users</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={userSearchInput}
              onChange={(e) => setUserSearchInput(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-luxury-gold"
            />
          </div>
        </div>

        {/* Role filter */}
        <div className="px-4 py-2 border-b border-neutral-800 flex flex-wrap gap-2">
          {["all", "CUSTOMER", "SALES", "OPERATIONS", "ADMIN"].map((role) => (
            <button
              key={role}
              onClick={() => setUserRoleFilter(role)}
              className={`px-3 py-1 text-xs rounded-lg ${userRoleFilter === role ? "bg-luxury-gold text-black font-semibold" : "bg-neutral-800 text-gray-400 hover:bg-neutral-700"}`}
            >
              {role === "all" ? "All" : roleLabel(role)}{" "}
              {roleCounts[role] !== undefined && `(${roleCounts[role]})`}
            </button>
          ))}
        </div>

        {isUsersLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
          </div>
        ) : allUsers.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                    Position
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {allUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-luxury-gold/20 border border-luxury-gold/50 flex items-center justify-center">
                          <span className="text-luxury-gold font-medium text-sm">
                            {user.name[0]?.toUpperCase() || "?"}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{user.name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 rounded text-xs font-medium ${roleColor(user.role)}`}
                      >
                        {roleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {positionLabel(user.designation)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs rounded-full border ${user.isActive ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-gray-500/10 text-gray-400 border-gray-500/30"}`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setManagedUser(user);
                          setManageTeam(user.team || "CUSTOMER");
                          setManagePosition(user.designation || "EXECUTIVE");
                          setShowManageModal(true);
                        }}
                        className="px-3 py-1.5 bg-luxury-gold/20 text-luxury-gold rounded-lg text-sm font-medium hover:bg-luxury-gold/30"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {userPagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Showing {(userPagination.page - 1) * userPagination.limit + 1}-
              {Math.min(
                userPagination.page * userPagination.limit,
                userPagination.total,
              )}{" "}
              of {userPagination.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchUsers(userPagination.page - 1)}
                disabled={userPagination.page === 1}
                className="p-1.5 bg-neutral-800 text-white rounded disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => fetchUsers(userPagination.page + 1)}
                disabled={userPagination.page >= userPagination.totalPages}
                className="p-1.5 bg-neutral-800 text-white rounded disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Audit Log */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowAuditLog(!showAuditLog)}
          className="w-full p-4 flex items-center justify-between hover:bg-neutral-800/50"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-white">Audit Log</h3>
          </div>
          <ChevronRight
            className={`w-5 h-5 text-gray-400 transition-transform ${showAuditLog ? "rotate-90" : ""}`}
          />
        </button>
        {showAuditLog && (
          <div className="border-t border-neutral-800">
            {isAuditLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 text-luxury-gold animate-spin" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No audit logs found
              </div>
            ) : (
              <>
                <div className="divide-y divide-neutral-800">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="px-4 py-3 flex items-start gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0">
                        <Shield className="w-4 h-4 text-luxury-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">
                          <span className="text-luxury-gold font-medium">
                            {log.performedBy.name}
                          </span>{" "}
                          <span className="text-gray-400">
                            {log.action.toLowerCase().replace(/_/g, " ")}
                          </span>{" "}
                          {log.changes?.memberName && (
                            <span className="text-white font-medium">
                              {log.changes.memberName}
                            </span>
                          )}
                          {log.changes?.previousDepartment &&
                            log.changes?.newDepartment && (
                              <span className="text-gray-400">
                                {" "}
                                from {log.changes.previousDepartment} to{" "}
                                {log.changes.newDepartment}
                              </span>
                            )}
                          {log.changes?.previousPosition &&
                            log.changes?.newPosition &&
                            !log.changes?.previousDepartment && (
                              <span className="text-gray-400">
                                {" "}
                                from {log.changes.previousPosition} to{" "}
                                {log.changes.newPosition}
                              </span>
                            )}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatDateTime(log.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {auditPagination.totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-neutral-800 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      Page {auditPagination.page} of{" "}
                      {auditPagination.totalPages}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchAuditLogs(auditPagination.page - 1)}
                        disabled={auditPagination.page === 1}
                        className="p-1.5 bg-neutral-800 text-white rounded disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => fetchAuditLogs(auditPagination.page + 1)}
                        disabled={
                          auditPagination.page >= auditPagination.totalPages
                        }
                        className="p-1.5 bg-neutral-800 text-white rounded disabled:opacity-50"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ============== MODALS ============== */}

      {/* Confirm Promote/Demote/Remove Modal */}
      {showConfirmModal && confirmAction && (
        <Modal
          onClose={() => {
            setShowConfirmModal(false);
            setConfirmAction(null);
          }}
          title=""
          small
        >
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              {confirmAction.type === "promote"
                ? "Promote"
                : confirmAction.type === "demote"
                  ? "Demote"
                  : "Remove"}{" "}
              {confirmAction.member.name}?
            </h3>
            <p className="text-sm text-gray-400">
              {confirmAction.type === "promote" && `Promote to next level?`}
              {confirmAction.type === "demote" && `Demote to previous level?`}
              {confirmAction.type === "remove" &&
                `Remove from team? They will become a Customer.`}
            </p>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => {
                setShowConfirmModal(false);
                setConfirmAction(null);
              }}
              className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAction}
              disabled={isLoading}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2 ${
                confirmAction.type === "remove"
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : "bg-luxury-gold text-black hover:bg-luxury-gold/90"
              }`}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}{" "}
              Confirm
            </button>
          </div>
        </Modal>
      )}

      {/* Transfer Modal */}
      {showTransferModal && selectedMember && (
        <Modal
          onClose={() => {
            setShowTransferModal(false);
            setSelectedMember(null);
          }}
          title="Transfer to Team"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 bg-neutral-800 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-luxury-gold/20 border border-luxury-gold/50 flex items-center justify-center">
                <span className="text-luxury-gold font-medium">
                  {selectedMember.name[0]?.toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-white font-medium">{selectedMember.name}</p>
                <p className="text-sm text-gray-400">{selectedMember.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 py-4">
              <div
                className={`px-4 py-2 rounded-lg ${selectedMember.department === "SALES" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}
              >
                {selectedMember.department || "Current"}
              </div>
              <ArrowRightLeft className="w-5 h-5 text-luxury-gold" />
              <div
                className={`px-4 py-2 rounded-lg ${transferToTeam === "SALES" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}
              >
                {transferToTeam}
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => {
                setShowTransferModal(false);
                setSelectedMember(null);
              }}
              className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              onClick={handleTransfer}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-luxury-gold text-black rounded-lg font-medium hover:bg-luxury-gold/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}{" "}
              Transfer
            </button>
          </div>
        </Modal>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && addToTeam && (
        <Modal
          onClose={() => {
            setShowAddMemberModal(false);
            setAddToTeam(null);
          }}
          title={`Add ${positionLabel(addToTeam.position)} to ${addToTeam.team}`}
        >
          <p className="text-sm text-gray-400 mb-3">
            Select a customer or team member to add:
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allUsers.filter(
              (u) =>
                u.role === "CUSTOMER" || (u.team && u.team !== addToTeam.team),
            ).length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No available members. Try searching in the users list.
              </p>
            ) : (
              allUsers
                .filter(
                  (u) =>
                    u.role === "CUSTOMER" ||
                    (u.team && u.team !== addToTeam.team),
                )
                .map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleAddToTeam(user.id)}
                    disabled={isLoading}
                    className="w-full p-3 flex items-center gap-3 rounded-lg hover:bg-neutral-800 disabled:opacity-50"
                  >
                    <div className="w-10 h-10 rounded-full bg-luxury-gold/20 border border-luxury-gold/50 flex items-center justify-center">
                      <span className="text-luxury-gold font-medium">
                        {user.name[0]?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">{user.name}</p>
                      <p className="text-xs text-gray-400">
                        {user.team
                          ? `${user.team} ${positionLabel(user.designation)}`
                          : "Customer"}
                      </p>
                    </div>
                    {user.team && (
                      <span className="text-xs px-2 py-1 rounded bg-amber-500/20 text-amber-400">
                        Transfer
                      </span>
                    )}
                  </button>
                ))
            )}
          </div>
        </Modal>
      )}

      {/* Manage User Modal */}
      {showManageModal && managedUser && (
        <Modal
          onClose={() => {
            setShowManageModal(false);
            setManagedUser(null);
          }}
          title="Manage Role"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 bg-neutral-800 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-luxury-gold/20 border border-luxury-gold/50 flex items-center justify-center">
                <span className="text-luxury-gold font-medium">
                  {managedUser.name[0]?.toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-white font-medium">{managedUser.name}</p>
                <p className="text-sm text-gray-400">{managedUser.email}</p>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              Current:{" "}
              <span className="text-white">
                {managedUser.team
                  ? `${managedUser.team} ${positionLabel(managedUser.designation)}`
                  : "Customer"}
              </span>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Team</label>
              <select
                value={manageTeam}
                onChange={(e) => setManageTeam(e.target.value)}
                className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold"
              >
                <option value="CUSTOMER">Customer (Remove from team)</option>
                <option value="SALES">Sales</option>
                <option value="OPERATIONS">Operations</option>
              </select>
            </div>
            {manageTeam !== "CUSTOMER" && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Position
                </label>
                <select
                  value={managePosition}
                  onChange={(e) => setManagePosition(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-luxury-gold"
                >
                  <option value="EXECUTIVE">Executive</option>
                  <option value="SENIOR">Senior</option>
                  <option value="HEAD">Head</option>
                </select>
              </div>
            )}
          </div>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => {
                setShowManageModal(false);
                setManagedUser(null);
              }}
              className="flex-1 px-4 py-2.5 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              onClick={handleManageSave}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-luxury-gold text-black rounded-lg font-medium hover:bg-luxury-gold/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============== SUB-COMPONENTS ==============

function Modal({
  onClose,
  title,
  children,
  small,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`bg-neutral-900 border border-neutral-800 rounded-xl w-full ${small ? "max-w-sm" : "max-w-md"}`}
      >
        {title && (
          <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function OrgChartCard({
  member,
  level,
  color,
  onPromote,
  onDemote,
  onRemove,
  onTransfer,
  canPromote,
  canDemote,
}: {
  member: TeamMember;
  level: "head" | "senior" | "exec";
  color: "blue" | "purple";
  onPromote: () => void;
  onDemote: () => void;
  onRemove: () => void;
  onTransfer: () => void;
  canPromote: boolean;
  canDemote: boolean;
}) {
  const sizeClass =
    level === "head" ? "w-40" : level === "senior" ? "w-36" : "w-32";
  const iconClass =
    level === "head" ? "w-10 h-10" : level === "senior" ? "w-9 h-9" : "w-8 h-8";
  const LevelIcon = level === "head" ? Crown : level === "senior" ? Star : User;
  const borderColor =
    color === "blue"
      ? "border-blue-500/50 hover:border-blue-400"
      : "border-purple-500/50 hover:border-purple-400";
  const iconBg = color === "blue" ? "bg-blue-500/20" : "bg-purple-500/20";
  const iconColor = color === "blue" ? "text-blue-400" : "text-purple-400";

  return (
    <div
      className={`group relative ${sizeClass} p-3 bg-neutral-800 border ${borderColor} rounded-xl mb-2 transition-colors`}
    >
      <div className="flex flex-col items-center text-center">
        <div
          className={`${iconClass} rounded-full ${iconBg} flex items-center justify-center mb-2 relative`}
        >
          <span className={`${iconColor} font-bold text-sm`}>
            {member.name[0]?.toUpperCase() || "?"}
          </span>
          <div
            className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${iconBg} flex items-center justify-center`}
          >
            <LevelIcon className={`w-2.5 h-2.5 ${iconColor}`} />
          </div>
        </div>
        <p className="text-white text-sm font-medium truncate w-full">
          {member.name}
        </p>
        <p className="text-gray-500 text-xs">
          {level === "head"
            ? "Head"
            : level === "senior"
              ? "Senior"
              : "Executive"}
        </p>
      </div>
      <div className="absolute -top-2 -right-2 hidden group-hover:flex items-center gap-1 bg-neutral-900 rounded-lg p-1 border border-neutral-700 shadow-lg">
        {canPromote && (
          <button
            onClick={onPromote}
            className="p-1 text-green-400 hover:bg-green-500/20 rounded"
            title="Promote"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        )}
        {canDemote && (
          <button
            onClick={onDemote}
            className="p-1 text-amber-400 hover:bg-amber-500/20 rounded"
            title="Demote"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onTransfer}
          className="p-1 text-blue-400 hover:bg-blue-500/20 rounded"
          title="Transfer"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-red-400 hover:bg-red-500/20 rounded"
          title="Remove"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddSlot({
  onClick,
  label,
  small,
}: {
  onClick: () => void;
  label: string;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`${small ? "w-10 h-10" : "w-32 h-16"} border border-dashed border-neutral-700 rounded-xl text-gray-500 flex items-center justify-center gap-1 hover:border-luxury-gold hover:text-luxury-gold transition-colors mb-2`}
    >
      <UserPlus className="w-4 h-4" />
      {!small && <span className="text-xs">{label}</span>}
    </button>
  );
}
