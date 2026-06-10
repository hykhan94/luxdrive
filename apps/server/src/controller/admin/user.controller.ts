// ============================================
// apps/server/src/controller/admin/user.controller.ts
// Users section — customer management for admin portal
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";

// ============== SUMMARY ==============

/**
 * Get user summary cards
 * Cards: Total Users, Active Users, Tier Breakdown, Total Revenue from Users
 */
export const getUserSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const [totalUsers, activeUsers, tierCounts, totalRevenue] =
      await Promise.all([
        prisma.user.count({ where: { role: "CUSTOMER" } }),
        prisma.user.count({ where: { role: "CUSTOMER", isActive: true } }),
        prisma.user.groupBy({
          by: ["loyaltyTier"],
          where: { role: "CUSTOMER" },
          _count: { id: true },
        }),
        prisma.booking.aggregate({
          where: {
            customer: { role: "CUSTOMER" },
            status: "COMPLETED",
          },
          _sum: { totalPrice: true },
        }),
      ]);

    const tierCountsObj: Record<string, number> = {
      BRONZE: 0,
      SILVER: 0,
      GOLD: 0,
      PLATINUM: 0,
    };
    tierCounts.forEach((tc) => {
      tierCountsObj[tc.loyaltyTier] = tc._count.id;
    });

    res.json({
      success: true,
      data: {
        cards: {
          totalUsers,
          activeUsers,
          inactiveUsers: totalUsers - activeUsers,
          totalRevenue: totalRevenue._sum.totalPrice || 0,
        },
        tierBreakdown: tierCountsObj,
      },
    });
  },
);

// ============== LIST USERS ==============

/**
 * Get all customer users with search, filters, pagination
 * Columns: Name, Tier, Points Earned, Successful Trips,
 *          Total Money Spent, Upcoming Trips, Auth Method, Status
 */
export const getUsers = asyncWrapper(async (req: Request, res: Response) => {
  const {
    search,
    tier, // "BRONZE" | "SILVER" | "GOLD" | "PLATINUM"
    status, // "active" | "inactive"
    authMethod, // "credential" | "google" | "facebook" etc.
    page = "1",
    limit = "10",
    sortBy = "createdAt", // "createdAt" | "name" | "loyaltyPoints" | "loyaltyTier"
    sortOrder = "desc",
  } = req.query;

  const where: any = { role: "CUSTOMER" };

  // Search by name, email, phone
  if (search) {
    const searchStr = search as string;
    where.OR = [
      { name: { contains: searchStr, mode: "insensitive" } },
      { firstName: { contains: searchStr, mode: "insensitive" } },
      { lastName: { contains: searchStr, mode: "insensitive" } },
      { email: { contains: searchStr, mode: "insensitive" } },
      { phone: { contains: searchStr, mode: "insensitive" } },
    ];
  }

  // Tier filter
  if (tier && tier !== "all") {
    where.loyaltyTier = tier;
  }

  // Status filter
  if (status === "active") {
    where.isActive = true;
  } else if (status === "inactive") {
    where.isActive = false;
  }

  // Auth method filter — requires join with Account
  if (authMethod && authMethod !== "all") {
    where.accounts = {
      some: { providerId: authMethod as string },
    };
  }

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

  // Build orderBy
  let orderBy: any;
  switch (sortBy) {
    case "name":
      orderBy = { name: sortOrder === "asc" ? "asc" : "desc" };
      break;
    case "loyaltyPoints":
      orderBy = { loyaltyPoints: sortOrder === "asc" ? "asc" : "desc" };
      break;
    case "loyaltyTier":
      orderBy = { loyaltyTier: sortOrder === "asc" ? "asc" : "desc" };
      break;
    case "createdAt":
    default:
      orderBy = { createdAt: sortOrder === "asc" ? "asc" : "desc" };
      break;
  }

  const [users, total, tierFilterCounts] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: parseInt(limit as string),
      orderBy,
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        image: true,
        loyaltyTier: true,
        loyaltyPoints: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        accounts: {
          select: { providerId: true },
        },
      },
    }),
    prisma.user.count({ where }),
    // Tier counts for filter badges
    prisma.user.groupBy({
      by: ["loyaltyTier"],
      where: { role: "CUSTOMER" },
      _count: { id: true },
    }),
  ]);

  // Get booking stats for each user in a single query
  const userIds = users.map((u) => u.id);

  const [completedBookings, upcomingBookings, totalSpent] = await Promise.all([
    // Completed trips per user
    prisma.booking.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: userIds },
        status: "COMPLETED",
      },
      _count: { id: true },
    }),
    // Upcoming trips per user (tripDate >= now, not cancelled/completed)
    prisma.booking.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: userIds },
        tripDate: { gte: new Date() },
        status: {
          in: [
            "PENDING",
            "ASSIGNMENT_OFFERED",
            "ASSIGNMENT_RE_OFFERED",
            "CONFIRMED",
            "IN_PROGRESS",
          ],
        },
      },
      _count: { id: true },
    }),
    // Total money spent per user
    prisma.booking.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: userIds },
        status: "COMPLETED",
      },
      _sum: { totalPrice: true },
    }),
  ]);

  const completedMap = new Map(
    completedBookings.map((b) => [b.customerId, b._count!.id]),
  );
  const upcomingMap = new Map(
    upcomingBookings.map((b) => [b.customerId, b._count!.id]),
  );
  const spentMap = new Map(
    totalSpent.map((b) => [b.customerId, b._sum.totalPrice]),
  );

  const formattedUsers = users.map((user) => {
    // Determine auth method from accounts
    const authMethods = [...new Set(user.accounts.map((a) => a.providerId))];

    return {
      id: user.id,
      name:
        user.name ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        "—",
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      image: user.image,
      loyaltyTier: user.loyaltyTier,
      loyaltyPoints: user.loyaltyPoints,
      successfulTrips: completedMap.get(user.id) || 0,
      totalMoneySpent: spentMap.get(user.id) || 0,
      upcomingTrips: upcomingMap.get(user.id) || 0,
      authMethod: authMethods.length > 0 ? authMethods[0] : "credential",
      authMethods,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  });

  // Build tier filter counts
  const tierCountsObj: Record<string, number> = {
    all: 0,
    BRONZE: 0,
    SILVER: 0,
    GOLD: 0,
    PLATINUM: 0,
  };
  tierFilterCounts.forEach((tc) => {
    tierCountsObj[tc.loyaltyTier] = tc._count.id;
  });
  tierCountsObj.all = Object.entries(tierCountsObj)
    .filter(([key]) => key !== "all")
    .reduce((sum, [, count]) => sum + count, 0);

  res.json({
    success: true,
    data: {
      users: formattedUsers,
      tierCounts: tierCountsObj,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    },
  });
});

// ============== USER DETAILS ==============

/**
 * Get single user detail
 * Shows: name, email, phone, points earned, total money spent,
 *        upcoming trips count, last trip date, auth method, tier, status
 */
export const getUserDetails = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        image: true,
        dob: true,
        loyaltyTier: true,
        loyaltyPoints: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        registrationIp: true,
        role: true,
        accounts: {
          select: { providerId: true, createdAt: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.role !== "CUSTOMER") {
      throw new BadRequestError("This endpoint is for customer users only");
    }

    // Get booking stats
    const now = new Date();

    const [
      completedTrips,
      totalSpent,
      upcomingTrips,
      lastCompletedBooking,
      recentBookings,
    ] = await Promise.all([
      // Total successful trips
      prisma.booking.count({
        where: { customerId: id, status: "COMPLETED" },
      }),
      // Total money spent
      prisma.booking.aggregate({
        where: { customerId: id, status: "COMPLETED" },
        _sum: { totalPrice: true },
      }),
      // Upcoming trips
      prisma.booking.count({
        where: {
          customerId: id,
          tripDate: { gte: now },
          status: {
            in: [
              "PENDING",
              "ASSIGNMENT_OFFERED",
              "ASSIGNMENT_RE_OFFERED",
              "CONFIRMED",
              "IN_PROGRESS",
            ],
          },
        },
      }),
      // Last trip date
      prisma.booking.findFirst({
        where: { customerId: id, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        select: {
          id: true,
          bookingRef: true,
          tripDate: true,
          completedAt: true,
        },
      }),
      // Recent 5 bookings (all statuses)
      prisma.booking.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          bookingRef: true,
          tripDate: true,
          tripTime: true,
          pickupAddress: true,
          dropoffAddress: true,
          vehicleClass: true,
          totalPrice: true,
          status: true,
          createdAt: true,
          completedAt: true,
          vendor: { select: { companyName: true } },
        },
      }),
    ]);

    // Determine auth methods
    const authMethods = [...new Set(user.accounts.map((a) => a.providerId))];

    res.json({
      success: true,
      data: {
        id: user.id,
        name:
          user.name ||
          `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
          "—",
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        image: user.image,
        dob: user.dob,
        emailVerified: user.emailVerified,
        loyaltyTier: user.loyaltyTier,
        loyaltyPoints: user.loyaltyPoints,
        isActive: user.isActive,
        authMethod: authMethods.length > 0 ? authMethods[0] : "credential",
        authMethods,
        registeredAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        stats: {
          successfulTrips: completedTrips,
          totalMoneySpent: totalSpent._sum.totalPrice || 0,
          upcomingTrips,
          lastTripDate:
            lastCompletedBooking?.completedAt ||
            lastCompletedBooking?.tripDate ||
            null,
          lastBookingRef: lastCompletedBooking?.bookingRef || null,
        },
        recentBookings,
      },
    });
  },
);

// ============== DEACTIVATE / REACTIVATE USER ==============

/**
 * Deactivate a customer user
 */
export const deactivateUser = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.role !== "CUSTOMER") {
      throw new BadRequestError(
        "Can only deactivate customer users from this endpoint",
      );
    }

    if (!user.isActive) {
      throw new BadRequestError("User is already deactivated");
    }

    // Check for active bookings
    const activeBookings = await prisma.booking.count({
      where: {
        customerId: id,
        status: {
          in: [
            "PENDING",
            "ASSIGNMENT_OFFERED",
            "ASSIGNMENT_RE_OFFERED",
            "CONFIRMED",
            "IN_PROGRESS",
          ],
        },
      },
    });

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    // Invalidate all active sessions
    await prisma.session.deleteMany({
      where: { userId: id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "USER_DEACTIVATED",
        entity: "User",
        entityId: id,
        changes: {
          reason: reason || "No reason provided",
          hadActiveBookings: activeBookings > 0,
          activeBookingsCount: activeBookings,
        },
      },
    });

    res.json({
      success: true,
      message: "User deactivated",
      data: {
        id: updated.id,
        isActive: updated.isActive,
        warning:
          activeBookings > 0
            ? `User has ${activeBookings} active booking(s) that may need attention`
            : null,
      },
    });
  },
);

/**
 * Reactivate a deactivated customer user
 */
export const reactivateUser = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundError("User");
    }

    if (user.role !== "CUSTOMER") {
      throw new BadRequestError(
        "Can only reactivate customer users from this endpoint",
      );
    }

    if (user.isActive) {
      throw new BadRequestError("User is already active");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "USER_REACTIVATED",
        entity: "User",
        entityId: id,
      },
    });

    res.json({
      success: true,
      message: "User reactivated",
      data: {
        id: updated.id,
        isActive: updated.isActive,
      },
    });
  },
);

// ============== USER BOOKINGS ==============

/**
 * Get bookings for a specific user (with pagination)
 */
export const getUserBookings = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, page = "1", limit = "10" } = req.query;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundError("User");
    }

    const where: any = { customerId: id };
    if (status && status !== "all") {
      where.status = status;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          bookingRef: true,
          tripDate: true,
          tripTime: true,
          pickupAddress: true,
          dropoffAddress: true,
          vehicleClass: true,
          totalPrice: true,
          status: true,
          createdAt: true,
          completedAt: true,
          vendor: { select: { companyName: true } },
          driver: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        bookings,
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
