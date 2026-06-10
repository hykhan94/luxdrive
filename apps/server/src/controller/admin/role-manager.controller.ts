// ============================================
// apps/server/src/controller/admin/role-manager.controller.ts
// Sections:
//   1. Dashboard (team counts, org structure, customer count)
//   2. Team Layout (Sales & Operations members by rank)
//   3. Add / Transfer / Promote / Demote / Remove team members
//   4. All Users list with team & designation (search + pagination)
//   5. Audit Log (actions summary + details)
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";

// Position hierarchy for promote/demote validation
const POSITION_HIERARCHY: Record<string, number> = {
  EXECUTIVE: 1,
  SENIOR: 2,
  HEAD: 3,
};

// ================================================================
// 1. DASHBOARD
//    Total sales team + position breakdown
//    Total operations team + position breakdown
//    Total registered customers
// ================================================================

/**
 * Get role manager dashboard stats
 */
export const getRoleManagerDashboard = asyncWrapper(
  async (req: Request, res: Response) => {
    const [
      // Sales team by position
      salesPositions,
      totalSales,
      // Operations team by position
      opsPositions,
      totalOps,
      // Total customers
      totalCustomers,
      // Total team members (all staff)
      totalStaff,
    ] = await Promise.all([
      prisma.user.groupBy({
        by: ["position"],
        where: { role: "SALES", department: "SALES", isActive: true },
        _count: { id: true },
      }),
      prisma.user.count({ where: { role: "SALES", isActive: true } }),
      prisma.user.groupBy({
        by: ["position"],
        where: { role: "OPERATIONS", department: "OPERATIONS", isActive: true },
        _count: { id: true },
      }),
      prisma.user.count({ where: { role: "OPERATIONS", isActive: true } }),
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.user.count({
        where: {
          role: { in: ["SALES", "OPERATIONS", "FINANCE", "ADMIN"] },
          isActive: true,
        },
      }),
    ]);

    // Build position breakdown
    const buildPositionBreakdown = (
      positions: Array<{ position: string | null; _count: { id: number } }>,
    ) => {
      const breakdown: Record<string, number> = {
        HEAD: 0,
        SENIOR: 0,
        EXECUTIVE: 0,
      };
      positions.forEach((p) => {
        if (p.position && breakdown.hasOwnProperty(p.position)) {
          breakdown[p.position] = p._count.id;
        }
      });
      return breakdown;
    };

    res.json({
      success: true,
      data: {
        salesTeam: {
          total: totalSales,
          positions: buildPositionBreakdown(salesPositions),
        },
        operationsTeam: {
          total: totalOps,
          positions: buildPositionBreakdown(opsPositions),
        },
        totalCustomers,
        totalStaff,
        organizationStructure: {
          admin: await prisma.user.count({
            where: { role: "ADMIN", isActive: true },
          }),
          sales: totalSales,
          operations: totalOps,
          finance: await prisma.user.count({
            where: { role: "FINANCE", isActive: true },
          }),
        },
      },
    });
  },
);

// ================================================================
// 2. TEAM LAYOUT
//    Get team members categorized by rank (HEAD → SENIOR → EXECUTIVE)
// ================================================================

/**
 * Get team members for a specific department (SALES or OPERATIONS)
 * Organized by position hierarchy
 */
export const getTeamLayout = asyncWrapper(
  async (req: Request, res: Response) => {
    const { team } = req.params; // "sales" or "operations"

    const department = team.toUpperCase();
    if (department !== "SALES" && department !== "OPERATIONS") {
      throw new BadRequestError("Team must be 'sales' or 'operations'");
    }

    const role = department as "SALES" | "OPERATIONS";

    const members = await prisma.user.findMany({
      where: { role, department, isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        image: true,
        position: true,
        department: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    // Group by position
    const grouped: Record<string, any[]> = {
      HEAD: [],
      SENIOR: [],
      EXECUTIVE: [],
    };

    members.forEach((member) => {
      const pos = member.position || "EXECUTIVE";
      if (grouped[pos]) {
        grouped[pos].push({
          id: member.id,
          name:
            member.name ||
            `${member.firstName || ""} ${member.lastName || ""}`.trim() ||
            "—",
          email: member.email,
          phone: member.phone,
          image: member.image,
          position: member.position,
          department: member.department,
          createdAt: member.createdAt,
          lastLoginAt: member.lastLoginAt,
        });
      }
    });

    res.json({
      success: true,
      data: {
        team: department,
        totalMembers: members.length,
        members: grouped,
      },
    });
  },
);

// ================================================================
// 3. TEAM MEMBER MANAGEMENT
//    Add to team, Transfer, Promote, Demote, Remove from team
// ================================================================

/**
 * Add a user to a team (assigns role + department + position)
 * Can also transfer an existing team member to another team
 */
export const addToTeam = asyncWrapper(async (req: Request, res: Response) => {
  const { userId, team, position } = req.body;

  if (!userId) {
    throw new BadRequestError("userId is required");
  }

  if (!team) {
    throw new BadRequestError("team is required (SALES or OPERATIONS)");
  }

  const department = team.toUpperCase();
  if (department !== "SALES" && department !== "OPERATIONS") {
    throw new BadRequestError("team must be SALES or OPERATIONS");
  }

  const pos = position ? position.toUpperCase() : "EXECUTIVE";
  if (!["HEAD", "SENIOR", "EXECUTIVE"].includes(pos)) {
    throw new BadRequestError("position must be HEAD, SENIOR, or EXECUTIVE");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new NotFoundError("User");
  }

  // Check if adding as HEAD — only 1 HEAD allowed per team
  if (pos === "HEAD") {
    const existingHead = await prisma.user.findFirst({
      where: {
        role: department as any,
        department: department as any,
        position: "HEAD",
        isActive: true,
      },
    });
    if (existingHead) {
      throw new BadRequestError(
        `${department} team already has a Head: ${existingHead.name || existingHead.email}. Demote or remove them first.`,
      );
    }
  }

  const previousRole = user.role;
  const previousDepartment = user.department;
  const previousPosition = user.position;
  const isTransfer = user.role === "SALES" || user.role === "OPERATIONS";

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      role: department as any,
      department: department as any,
      position: pos as any,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      action: isTransfer ? "TEAM_MEMBER_TRANSFERRED" : "TEAM_MEMBER_ADDED",
      entity: "User",
      entityId: userId,
      changes: {
        previousRole,
        previousDepartment,
        previousPosition,
        newRole: department,
        newDepartment: department,
        newPosition: pos,
        memberName: user.name || user.email,
      },
    },
  });

  res.json({
    success: true,
    message: isTransfer
      ? `${user.name || user.email} transferred to ${department} team as ${pos}`
      : `${user.name || user.email} added to ${department} team as ${pos}`,
    data: {
      id: updated.id,
      name: updated.name,
      role: updated.role,
      department: updated.department,
      position: updated.position,
    },
  });
});

/**
 * Transfer a team member to another team
 */
export const transferTeamMember = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { targetTeam, position } = req.body;

    if (!targetTeam) {
      throw new BadRequestError("targetTeam is required (SALES or OPERATIONS)");
    }

    const department = targetTeam.toUpperCase();
    if (department !== "SALES" && department !== "OPERATIONS") {
      throw new BadRequestError("targetTeam must be SALES or OPERATIONS");
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.role !== "SALES" && user.role !== "OPERATIONS") {
      throw new BadRequestError(
        "User is not a team member. Use 'Add to Team' instead.",
      );
    }

    if (user.department === department) {
      throw new BadRequestError(`User is already in the ${department} team`);
    }

    const newPosition = position
      ? position.toUpperCase()
      : user.position || "EXECUTIVE";

    // Check HEAD constraint
    if (newPosition === "HEAD") {
      const existingHead = await prisma.user.findFirst({
        where: {
          role: department as any,
          department: department as any,
          position: "HEAD",
          isActive: true,
        },
      });
      if (existingHead) {
        throw new BadRequestError(
          `${department} team already has a Head. Demote or remove them first.`,
        );
      }
    }

    const previousRole = user.role;
    const previousDepartment = user.department;
    const previousPosition = user.position;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role: department as any,
        department: department as any,
        position: newPosition as any,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "TEAM_MEMBER_TRANSFERRED",
        entity: "User",
        entityId: id,
        changes: {
          previousRole,
          previousDepartment,
          previousPosition,
          newRole: department,
          newDepartment: department,
          newPosition,
          memberName: user.name || user.email,
        },
      },
    });

    res.json({
      success: true,
      message: `${user.name || user.email} transferred from ${previousDepartment} to ${department} as ${newPosition}`,
      data: {
        id: updated.id,
        name: updated.name,
        role: updated.role,
        department: updated.department,
        position: updated.position,
      },
    });
  },
);

/**
 * Promote a team member (EXECUTIVE → SENIOR → HEAD)
 */
export const promoteTeamMember = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.role !== "SALES" && user.role !== "OPERATIONS") {
      throw new BadRequestError("User is not a team member");
    }

    const currentPosition = user.position || "EXECUTIVE";
    const currentLevel = POSITION_HIERARCHY[currentPosition];

    if (currentLevel >= 3) {
      throw new BadRequestError(
        "User is already at the highest position (HEAD)",
      );
    }

    // Determine next position
    const nextLevel = currentLevel + 1;
    const nextPosition = Object.entries(POSITION_HIERARCHY).find(
      ([, level]) => level === nextLevel,
    )?.[0];

    if (!nextPosition) {
      throw new BadRequestError("Cannot determine next position");
    }

    // Check HEAD constraint
    if (nextPosition === "HEAD") {
      const existingHead = await prisma.user.findFirst({
        where: {
          role: user.role,
          department: user.department!,
          position: "HEAD",
          isActive: true,
          id: { not: id },
        },
      });
      if (existingHead) {
        throw new BadRequestError(
          `${user.department} team already has a Head: ${existingHead.name || existingHead.email}. Demote or remove them first.`,
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { position: nextPosition as any },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "TEAM_MEMBER_PROMOTED",
        entity: "User",
        entityId: id,
        changes: {
          previousPosition: currentPosition,
          newPosition: nextPosition,
          department: user.department,
          memberName: user.name || user.email,
        },
      },
    });

    res.json({
      success: true,
      message: `${user.name || user.email} promoted from ${currentPosition} to ${nextPosition}`,
      data: {
        id: updated.id,
        name: updated.name,
        position: updated.position,
        department: updated.department,
      },
    });
  },
);

/**
 * Demote a team member (HEAD → SENIOR → EXECUTIVE)
 */
export const demoteTeamMember = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.role !== "SALES" && user.role !== "OPERATIONS") {
      throw new BadRequestError("User is not a team member");
    }

    const currentPosition = user.position || "EXECUTIVE";
    const currentLevel = POSITION_HIERARCHY[currentPosition];

    if (currentLevel <= 1) {
      throw new BadRequestError(
        "User is already at the lowest position (EXECUTIVE)",
      );
    }

    const prevLevel = currentLevel - 1;
    const prevPosition = Object.entries(POSITION_HIERARCHY).find(
      ([, level]) => level === prevLevel,
    )?.[0];

    if (!prevPosition) {
      throw new BadRequestError("Cannot determine previous position");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { position: prevPosition as any },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "TEAM_MEMBER_DEMOTED",
        entity: "User",
        entityId: id,
        changes: {
          previousPosition: currentPosition,
          newPosition: prevPosition,
          department: user.department,
          memberName: user.name || user.email,
        },
      },
    });

    res.json({
      success: true,
      message: `${user.name || user.email} demoted from ${currentPosition} to ${prevPosition}`,
      data: {
        id: updated.id,
        name: updated.name,
        position: updated.position,
        department: updated.department,
      },
    });
  },
);

/**
 * Remove from team — reverts user back to CUSTOMER role
 */
export const removeFromTeam = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.role !== "SALES" && user.role !== "OPERATIONS") {
      throw new BadRequestError("User is not a team member");
    }

    const previousRole = user.role;
    const previousDepartment = user.department;
    const previousPosition = user.position;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role: "CUSTOMER",
        department: null,
        position: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "TEAM_MEMBER_REMOVED",
        entity: "User",
        entityId: id,
        changes: {
          previousRole,
          previousDepartment,
          previousPosition,
          newRole: "CUSTOMER",
          memberName: user.name || user.email,
          reason: reason || null,
        },
      },
    });

    res.json({
      success: true,
      message: `${user.name || user.email} removed from ${previousDepartment} team and reverted to CUSTOMER`,
      data: {
        id: updated.id,
        name: updated.name,
        role: updated.role,
        department: updated.department,
        position: updated.position,
      },
    });
  },
);

// ================================================================
// 4. ALL USERS LIST
//    All registered users with team assignment + designation
//    Search by name + pagination
// ================================================================

/**
 * Get all users with their team and designation
 * Columns: Name, Email, Role/Team, Position/Designation, Status
 */
export const getAllUsersForRoleManager = asyncWrapper(
  async (req: Request, res: Response) => {
    const {
      search,
      role, // "CUSTOMER" | "SALES" | "OPERATIONS" | "ADMIN" | "all"
      page = "1",
      limit = "10",
    } = req.query;

    const where: any = {
      // Exclude PARTNER and VENDOR roles — they have their own sections
      role: { notIn: ["PARTNER", "VENDOR"] },
    };

    // Search by name
    if (search) {
      const searchStr = search as string;
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { name: { contains: searchStr, mode: "insensitive" } },
            { firstName: { contains: searchStr, mode: "insensitive" } },
            { lastName: { contains: searchStr, mode: "insensitive" } },
            { email: { contains: searchStr, mode: "insensitive" } },
          ],
        },
      ];
    }

    // Role filter
    if (role && role !== "all") {
      where.role = role;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [users, total, roleCounts] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: [
          { role: "asc" },
          { department: "asc" },
          { position: "asc" },
          { name: "asc" },
        ],
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          image: true,
          role: true,
          department: true,
          position: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      prisma.user.count({ where }),
      // Role counts for filter tabs
      prisma.user.groupBy({
        by: ["role"],
        where: { role: { notIn: ["PARTNER", "VENDOR"] } },
        _count: { id: true },
      }),
    ]);

    const formattedUsers = users.map((user) => ({
      id: user.id,
      name:
        user.name ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        "—",
      email: user.email,
      phone: user.phone,
      image: user.image,
      role: user.role,
      team: user.department || null,
      designation: user.position || null,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));

    // Build role counts
    const roleCountsObj: Record<string, number> = {
      all: 0,
      CUSTOMER: 0,
      ADMIN: 0,
      SALES: 0,
      OPERATIONS: 0,
      FINANCE: 0,
    };
    roleCounts.forEach((rc) => {
      if (roleCountsObj.hasOwnProperty(rc.role)) {
        roleCountsObj[rc.role] = rc._count.id;
      }
    });
    roleCountsObj.all = Object.entries(roleCountsObj)
      .filter(([key]) => key !== "all")
      .reduce((sum, [, count]) => sum + count, 0);

    res.json({
      success: true,
      data: {
        users: formattedUsers,
        roleCounts: roleCountsObj,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

// ================================================================
// 5. AUDIT LOG
//    Actions performed, summary + details
// ================================================================

/**
 * Get audit log summary — counts per action type
 */
export const getAuditLogSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const { period = "30" } = req.query; // Days to look back

    const since = new Date();
    since.setDate(since.getDate() - parseInt(period as string));

    const [totalLogs, actionCounts, recentActivity] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      prisma.auditLog.groupBy({
        by: ["action"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      // Most recent 5 actions for quick view
      prisma.auditLog.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          userId: true,
          createdAt: true,
        },
      }),
    ]);

    // Get admin names for recent activity
    const adminIds = [
      ...new Set(recentActivity.map((a) => a.userId).filter(Boolean)),
    ] as string[];
    const admins = await prisma.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true, email: true },
    });
    const adminMap = new Map(admins.map((a) => [a.id, a.name || a.email]));

    res.json({
      success: true,
      data: {
        period: parseInt(period as string),
        totalLogs,
        actionBreakdown: actionCounts.map((ac) => ({
          action: ac.action,
          count: ac._count.id,
        })),
        recentActivity: recentActivity.map((log) => ({
          id: log.id,
          action: log.action,
          entity: log.entity,
          entityId: log.entityId,
          performedBy: log.userId
            ? adminMap.get(log.userId) || log.userId
            : "System",
          createdAt: log.createdAt,
        })),
      },
    });
  },
);

/**
 * Get audit log entries with filters, search, pagination
 */
export const getAuditLogs = asyncWrapper(
  async (req: Request, res: Response) => {
    const {
      search,
      action, // Filter by specific action type
      entity, // Filter by entity type (User, Vendor, Partner, Booking, etc.)
      userId, // Filter by who performed the action
      startDate,
      endDate,
      page = "1",
      limit = "20",
    } = req.query;

    const where: any = {};

    // Action filter
    if (action && action !== "all") {
      where.action = action as string;
    }

    // Entity filter
    if (entity && entity !== "all") {
      where.entity = entity as string;
    }

    // Performed by filter
    if (userId) {
      where.userId = userId as string;
    }

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    // Search in action name or entity
    if (search) {
      const searchStr = search as string;
      where.OR = [
        { action: { contains: searchStr, mode: "insensitive" } },
        { entity: { contains: searchStr, mode: "insensitive" } },
        { entityId: { contains: searchStr, mode: "insensitive" } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Get user names for performed-by
    const performerIds = [
      ...new Set(logs.map((l) => l.userId).filter(Boolean)),
    ] as string[];
    const performers = await prisma.user.findMany({
      where: { id: { in: performerIds } },
      select: { id: true, name: true, email: true, role: true },
    });
    const performerMap = new Map(
      performers.map((p) => [p.id, { name: p.name || p.email, role: p.role }]),
    );

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      changes: log.changes,
      performedBy: log.userId
        ? {
            id: log.userId,
            name: performerMap.get(log.userId)?.name || log.userId,
            role: performerMap.get(log.userId)?.role || null,
          }
        : { id: null, name: "System", role: null },
      ip: log.ip,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
    }));

    // Get available action types and entity types for filter dropdowns
    const [actionTypes, entityTypes] = await Promise.all([
      prisma.auditLog.findMany({
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
      }),
      prisma.auditLog.findMany({
        distinct: ["entity"],
        select: { entity: true },
        orderBy: { entity: "asc" },
      }),
    ]);

    res.json({
      success: true,
      data: {
        logs: formattedLogs,
        filters: {
          actionTypes: actionTypes.map((a) => a.action),
          entityTypes: entityTypes.map((e) => e.entity),
        },
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  },
);

/**
 * Get single audit log entry detail
 */
export const getAuditLogDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const log = await prisma.auditLog.findUnique({ where: { id } });

    if (!log) {
      throw new NotFoundError("Audit log entry");
    }

    // Get performer info
    let performer = null;
    if (log.userId) {
      performer = await prisma.user.findUnique({
        where: { id: log.userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
          position: true,
        },
      });
    }

    res.json({
      success: true,
      data: {
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        changes: log.changes,
        performedBy: performer
          ? {
              id: performer.id,
              name: performer.name || performer.email,
              email: performer.email,
              role: performer.role,
              department: performer.department,
              position: performer.position,
            }
          : { id: log.userId, name: "System" },
        ip: log.ip,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      },
    });
  },
);
