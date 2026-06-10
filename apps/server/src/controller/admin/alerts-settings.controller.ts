// ============================================
// apps/server/src/controller/admin/alerts-settings.controller.ts
// Sections:
//   1. Unactioned Bookings Alert (< 24hrs, no vendor assigned)
//   2. Loyalty Program Settings
//   3. WhatsApp Message Template
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";

// ================================================================
// 1. UNACTIONED BOOKINGS ALERT
//    Bookings where tripDate is within 24 hours AND no vendor assigned
//    With search bar and pagination
// ================================================================

/**
 * Get summary counts for the alerts page header
 */
export const getAlertsSummary = asyncWrapper(
  async (req: Request, res: Response) => {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(
      now.getTime() + 24 * 60 * 60 * 1000,
    );

    // Unactioned bookings: tripDate within 24hrs, no vendor accepted yet,
    // not cancelled/completed. Under the new offer model an unactioned
    // booking is one in PENDING (admin hasn't offered to any vendor) or
    // sitting in an outstanding offer state (ASSIGNMENT_OFFERED /
    // ASSIGNMENT_RE_OFFERED) with the trip date imminent.
    const unactionedCount = await prisma.booking.count({
      where: {
        vendorId: null,
        tripDate: { lte: twentyFourHoursFromNow, gte: now },
        status: {
          in: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
        },
      },
    });

    // Also count bookings that are PAST tripDate and still unassigned (overdue)
    const overdueCount = await prisma.booking.count({
      where: {
        vendorId: null,
        tripDate: { lt: now },
        status: {
          in: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
        },
      },
    });

    res.json({
      success: true,
      data: {
        unactionedBookings: unactionedCount,
        overdueBookings: overdueCount,
        totalNeedingAction: unactionedCount + overdueCount,
      },
    });
  },
);

/**
 * Get unactioned bookings (< 24 hours left, no vendor assigned)
 * With search, pagination, and time urgency sorting
 *
 * Columns from the doc:
 *   Booking ID, Customer Name, Trip Date & Time, Pickup, Dropoff,
 *   Vehicle Class, Hours Left, Action (Assign Vendor)
 */
export const getUnactionedBookings = asyncWrapper(
  async (req: Request, res: Response) => {
    const {
      search,
      urgency, // "critical" (<6hrs), "urgent" (<12hrs), "warning" (<24hrs), "overdue", "all"
      page = "1",
      limit = "10",
      sortBy = "hoursLeft", // "hoursLeft" | "tripDate" | "createdAt"
      sortOrder = "asc", // "asc" (most urgent first) | "desc"
    } = req.query;

    const now = new Date();
    const twentyFourHoursFromNow = new Date(
      now.getTime() + 24 * 60 * 60 * 1000,
    );

    const where: any = {
      vendorId: null,
      status: {
        in: ["PENDING", "ASSIGNMENT_OFFERED", "ASSIGNMENT_RE_OFFERED"],
      },
    };

    // Urgency filter
    switch (urgency) {
      case "critical": // < 6 hours
        where.tripDate = {
          lte: new Date(now.getTime() + 6 * 60 * 60 * 1000),
          gte: now,
        };
        break;
      case "urgent": // < 12 hours
        where.tripDate = {
          lte: new Date(now.getTime() + 12 * 60 * 60 * 1000),
          gte: now,
        };
        break;
      case "warning": // < 24 hours
        where.tripDate = {
          lte: twentyFourHoursFromNow,
          gte: now,
        };
        break;
      case "overdue": // Past trip date
        where.tripDate = { lt: now };
        break;
      default: // "all" — within 24hrs + overdue
        where.tripDate = { lte: twentyFourHoursFromNow };
        break;
    }

    // Search filter
    if (search) {
      const searchStr = search as string;
      where.AND = [
        // Keep the existing urgency/date filter intact
        ...(where.AND || []),
        {
          OR: [
            { bookingRef: { contains: searchStr, mode: "insensitive" } },
            { guestName: { contains: searchStr, mode: "insensitive" } },
            { guestPhone: { contains: searchStr, mode: "insensitive" } },
            { pickupAddress: { contains: searchStr, mode: "insensitive" } },
            { dropoffAddress: { contains: searchStr, mode: "insensitive" } },
            {
              customer: { name: { contains: searchStr, mode: "insensitive" } },
            },
            {
              customer: { email: { contains: searchStr, mode: "insensitive" } },
            },
            {
              customer: { phone: { contains: searchStr, mode: "insensitive" } },
            },
          ],
        },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Build orderBy
    let orderBy: any;
    switch (sortBy) {
      case "createdAt":
        orderBy = { createdAt: sortOrder === "desc" ? "desc" : "asc" };
        break;
      case "tripDate":
      case "hoursLeft":
      default:
        // Sort by tripDate ascending = most urgent first
        orderBy = { tripDate: sortOrder === "desc" ? "desc" : "asc" };
        break;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy,
        select: {
          id: true,
          bookingRef: true,
          guestName: true,
          guestPhone: true,
          guestEmail: true,
          tripDate: true,
          tripTime: true,
          pickupAddress: true,
          dropoffAddress: true,
          vehicleClass: true,
          passengers: true,
          totalPrice: true,
          status: true,
          source: true,
          city: true,
          tripType: true,
          createdAt: true,
          needsAttention: true,
          attentionReason: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              firstName: true,
              lastName: true,
            },
          },
          partner: {
            select: { id: true, companyName: true },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    // Calculate hours left and urgency level for each booking
    const formattedBookings = bookings.map((booking) => {
      const tripDateTime = new Date(booking.tripDate);
      const hoursLeft =
        (tripDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const minutesLeft =
        (tripDateTime.getTime() - now.getTime()) / (1000 * 60);

      let urgencyLevel: "OVERDUE" | "CRITICAL" | "URGENT" | "WARNING";
      if (hoursLeft < 0) {
        urgencyLevel = "OVERDUE";
      } else if (hoursLeft < 6) {
        urgencyLevel = "CRITICAL";
      } else if (hoursLeft < 12) {
        urgencyLevel = "URGENT";
      } else {
        urgencyLevel = "WARNING";
      }

      return {
        id: booking.id,
        bookingRef: booking.bookingRef,
        customerName:
          booking.guestName ||
          booking.customer?.name ||
          `${booking.customer?.firstName || ""} ${booking.customer?.lastName || ""}`.trim() ||
          "Guest",
        customerPhone: booking.guestPhone || booking.customer?.phone,
        customerEmail: booking.guestEmail || booking.customer?.email,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        vehicleClass: booking.vehicleClass,
        passengers: booking.passengers,
        totalPrice: booking.totalPrice,
        status: booking.status,
        source: booking.source,
        city: booking.city,
        tripType: booking.tripType,
        partner: booking.partner,
        createdAt: booking.createdAt,
        // Urgency info
        hoursLeft: Math.round(hoursLeft * 10) / 10, // 1 decimal place
        minutesLeft: Math.round(minutesLeft),
        urgencyLevel,
        needsAttention: booking.needsAttention,
        attentionReason: booking.attentionReason,
      };
    });

    // Urgency breakdown counts
    const urgencyCounts = {
      overdue: formattedBookings.filter((b) => b.urgencyLevel === "OVERDUE")
        .length,
      critical: formattedBookings.filter((b) => b.urgencyLevel === "CRITICAL")
        .length,
      urgent: formattedBookings.filter((b) => b.urgencyLevel === "URGENT")
        .length,
      warning: formattedBookings.filter((b) => b.urgencyLevel === "WARNING")
        .length,
    };

    res.json({
      success: true,
      data: {
        bookings: formattedBookings,
        urgencyCounts,
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
 * Get available vendors for a specific unactioned booking
 * (Same pattern as bookings section but scoped for this alert context)
 */
export const getAvailableVendorsForAlert = asyncWrapper(
  async (req: Request, res: Response) => {
    const { bookingId } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        bookingRef: true,
        vehicleClass: true,
        city: true,
        tripDate: true,
        tripTime: true,
        vendorId: true,
      },
    });

    if (!booking) {
      throw new NotFoundError("Booking");
    }

    if (booking.vendorId) {
      throw new BadRequestError("This booking already has a vendor assigned");
    }

    // Find approved vendors who have vehicles matching the required class
    const vendors = await prisma.vendor.findMany({
      where: {
        status: "APPROVED",
        vehicles: {
          some: {
            category: booking.vehicleClass,
            isActive: true,
            status: "APPROVED",
          },
        },
      },
      select: {
        id: true,
        companyName: true,
        rating: true,
        contactPerson: true,
        contactPhone: true,
        user: { select: { email: true } },
        vehicles: {
          where: {
            category: booking.vehicleClass,
            isActive: true,
            status: "APPROVED",
          },
          select: {
            id: true,
            make: true,
            model: true,
            plateNumber: true,
            year: true,
            driver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                rating: true,
              },
            },
          },
        },
        _count: { select: { bookings: true } },
      },
      orderBy: { rating: "desc" },
    });

    res.json({
      success: true,
      data: {
        booking: {
          id: booking.id,
          bookingRef: booking.bookingRef,
          vehicleClass: booking.vehicleClass,
          city: booking.city,
          tripDate: booking.tripDate,
          tripTime: booking.tripTime,
        },
        vendors: vendors.map((v) => ({
          id: v.id,
          companyName: v.companyName,
          rating: v.rating,
          contactPerson: v.contactPerson,
          contactPhone: v.contactPhone,
          email: v.user?.email,
          matchingVehicles: v.vehicles,
          totalBookings: v._count.bookings,
        })),
      },
    });
  },
);

/**
 * Assign vendor to an unactioned booking (from the Alerts page)
 * After assignment, booking disappears from alerts
 */
export const assignVendorFromAlert = asyncWrapper(
  async (req: Request, res: Response) => {
    const { bookingId } = req.params;
    const { vendorId, vehicleId, driverId, notes } = req.body;

    if (!vendorId) {
      throw new BadRequestError("vendorId is required");
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundError("Booking");
    }

    if (booking.vendorId) {
      throw new BadRequestError("This booking already has a vendor assigned");
    }

    // Verify the vendor exists and is approved
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, status: true, companyName: true, userId: true },
    });

    if (!vendor) {
      throw new NotFoundError("Vendor");
    }

    if (vendor.status !== "APPROVED") {
      throw new BadRequestError("Vendor is not approved");
    }

    // Verify vehicle if provided
    if (vehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, vendorId, isActive: true },
      });
      if (!vehicle) {
        throw new BadRequestError(
          "Vehicle not found or not active for this vendor",
        );
      }
    }

    // Verify driver if provided
    if (driverId) {
      const driver = await prisma.driver.findFirst({
        where: { id: driverId, vendorId, isActive: true },
      });
      if (!driver) {
        throw new BadRequestError(
          "Driver not found or not active for this vendor",
        );
      }
    }

    // Update booking. Under the new offer model, this manual-assign path
    // from the alerts page transitions to ASSIGNMENT_OFFERED — the offer
    // is now outstanding to the named vendor. The full offer entry flow
    // (with payout amount input) is rebuilt properly in Stage 3B; this
    // path mirrors the old semantics for now: admin picks vendor + driver
    // + vehicle directly, no per-offer payout entered.
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        vendorId,
        vehicleId: vehicleId || null,
        driverId: driverId || null,
        status: "ASSIGNMENT_OFFERED",
        notes: notes
          ? `${booking.notes ? booking.notes + "\n" : ""}[Alert Assignment] ${notes}`
          : booking.notes,
        needsAttention: false,
        attentionReason: null,
      },
    });

    // Notify the vendor
    await prisma.notification.create({
      data: {
        userId: vendor.userId,
        title: "New Booking Assignment",
        message: `Booking ${booking.bookingRef} has been assigned to you. Trip date: ${booking.tripDate}. Please confirm.`,
        type: "BOOKING_ASSIGNED",
        data: {
          bookingId: booking.id,
          bookingRef: booking.bookingRef,
          assignedFrom: "ALERTS",
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "BOOKING_ASSIGNED_FROM_ALERT",
        entity: "Booking",
        entityId: bookingId,
        changes: {
          vendorId,
          vehicleId: vehicleId || null,
          driverId: driverId || null,
          previousStatus: booking.status,
          newStatus: "AWAITING_VENDOR",
        },
      },
    });

    res.json({
      success: true,
      message: `Booking ${booking.bookingRef} assigned to ${vendor.companyName}`,
      data: {
        id: updated.id,
        bookingRef: updated.bookingRef,
        status: updated.status,
        vendorId: updated.vendorId,
      },
    });
  },
);

// ================================================================
// 2. LOYALTY PROGRAM SETTINGS
//    Single-row config: Points Per SAR, Birthday Discount,
//    Tier Thresholds, Free Ride Redemption
// ================================================================

/**
 * Get loyalty program configuration
 */
export const getLoyaltyConfig = asyncWrapper(
  async (req: Request, res: Response) => {
    // Get or create default config (single row)
    let config = await prisma.loyaltyConfig.findFirst();

    if (!config) {
      config = await prisma.loyaltyConfig.create({
        data: {}, // Uses all @default values from schema
      });
    }

    // Get some stats for context
    const [totalCustomers, tierCounts] = await Promise.all([
      prisma.user.count({ where: { role: "CUSTOMER", isActive: true } }),
      prisma.user.groupBy({
        by: ["loyaltyTier"],
        where: { role: "CUSTOMER", isActive: true },
        _count: { id: true },
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
        config: {
          // Points Per SAR Spent
          pointsPerSar: config.pointsPerSar,
          isPointsEnabled: config.isPointsEnabled,

          // Birthday Discount
          birthdayDiscountPercent: config.birthdayDiscountPercent,
          isBirthdayDiscountEnabled: config.isBirthdayDiscountEnabled,

          // Tier Thresholds
          tierThresholds: {
            silver: config.silverThreshold,
            gold: config.goldThreshold,
            platinum: config.platinumThreshold,
          },

          // Free Ride Redemption
          freeRideRedemption: {
            economySedan: config.freeRideEconomy,
            businessSedan: config.freeRideBusiness,
            firstClass: config.freeRideFirstClass,
            businessSuv: config.freeRideBusinessSuv,
          },
        },
        stats: {
          totalCustomers,
          tierCounts: tierCountsObj,
        },
        lastUpdated: config.updatedAt,
        lastUpdatedBy: config.updatedBy,
      },
    });
  },
);

/**
 * Update Points Per SAR Spent configuration
 */
export const updatePointsPerSar = asyncWrapper(
  async (req: Request, res: Response) => {
    const { pointsPerSar, isPointsEnabled } = req.body;

    if (
      pointsPerSar !== undefined &&
      (typeof pointsPerSar !== "number" || pointsPerSar < 0)
    ) {
      throw new BadRequestError("pointsPerSar must be a non-negative number");
    }

    let config = await prisma.loyaltyConfig.findFirst();
    if (!config) {
      config = await prisma.loyaltyConfig.create({ data: {} });
    }

    const previousValues = {
      pointsPerSar: config.pointsPerSar,
      isPointsEnabled: config.isPointsEnabled,
    };

    const updateData: any = { updatedBy: req.user!.id };
    if (pointsPerSar !== undefined) updateData.pointsPerSar = pointsPerSar;
    if (isPointsEnabled !== undefined)
      updateData.isPointsEnabled = isPointsEnabled;

    const updated = await prisma.loyaltyConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "LOYALTY_POINTS_UPDATED",
        entity: "LoyaltyConfig",
        entityId: config.id,
        changes: { previousValues, newValues: updateData },
      },
    });

    res.json({
      success: true,
      message: "Points per SAR configuration updated",
      data: {
        pointsPerSar: updated.pointsPerSar,
        isPointsEnabled: updated.isPointsEnabled,
      },
    });
  },
);

/**
 * Update Birthday Discount configuration
 */
export const updateBirthdayDiscount = asyncWrapper(
  async (req: Request, res: Response) => {
    const { birthdayDiscountPercent, isBirthdayDiscountEnabled } = req.body;

    if (birthdayDiscountPercent !== undefined) {
      if (
        typeof birthdayDiscountPercent !== "number" ||
        birthdayDiscountPercent < 0 ||
        birthdayDiscountPercent > 100
      ) {
        throw new BadRequestError(
          "birthdayDiscountPercent must be between 0 and 100",
        );
      }
    }

    let config = await prisma.loyaltyConfig.findFirst();
    if (!config) {
      config = await prisma.loyaltyConfig.create({ data: {} });
    }

    const previousValues = {
      birthdayDiscountPercent: config.birthdayDiscountPercent,
      isBirthdayDiscountEnabled: config.isBirthdayDiscountEnabled,
    };

    const updateData: any = { updatedBy: req.user!.id };
    if (birthdayDiscountPercent !== undefined)
      updateData.birthdayDiscountPercent = birthdayDiscountPercent;
    if (isBirthdayDiscountEnabled !== undefined)
      updateData.isBirthdayDiscountEnabled = isBirthdayDiscountEnabled;

    const updated = await prisma.loyaltyConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "LOYALTY_BIRTHDAY_UPDATED",
        entity: "LoyaltyConfig",
        entityId: config.id,
        changes: { previousValues, newValues: updateData },
      },
    });

    res.json({
      success: true,
      message: "Birthday discount configuration updated",
      data: {
        birthdayDiscountPercent: updated.birthdayDiscountPercent,
        isBirthdayDiscountEnabled: updated.isBirthdayDiscountEnabled,
      },
    });
  },
);

/**
 * Update Tier Thresholds configuration
 */
export const updateTierThresholds = asyncWrapper(
  async (req: Request, res: Response) => {
    const { silver, gold, platinum } = req.body;

    // Validate that thresholds are in ascending order
    const s = silver ?? 0;
    const g = gold ?? 0;
    const p = platinum ?? 0;

    if (silver !== undefined && gold !== undefined && silver >= gold) {
      throw new BadRequestError("Silver threshold must be less than Gold");
    }
    if (gold !== undefined && platinum !== undefined && gold >= platinum) {
      throw new BadRequestError("Gold threshold must be less than Platinum");
    }
    if (silver !== undefined && platinum !== undefined && silver >= platinum) {
      throw new BadRequestError("Silver threshold must be less than Platinum");
    }

    let config = await prisma.loyaltyConfig.findFirst();
    if (!config) {
      config = await prisma.loyaltyConfig.create({ data: {} });
    }

    // Full ascending order validation against existing values
    const finalSilver = silver ?? config.silverThreshold;
    const finalGold = gold ?? config.goldThreshold;
    const finalPlatinum = platinum ?? config.platinumThreshold;

    if (finalSilver >= finalGold || finalGold >= finalPlatinum) {
      throw new BadRequestError(
        `Thresholds must be in ascending order: Silver (${finalSilver}) < Gold (${finalGold}) < Platinum (${finalPlatinum})`,
      );
    }

    const previousValues = {
      silverThreshold: config.silverThreshold,
      goldThreshold: config.goldThreshold,
      platinumThreshold: config.platinumThreshold,
    };

    const updateData: any = { updatedBy: req.user!.id };
    if (silver !== undefined) updateData.silverThreshold = silver;
    if (gold !== undefined) updateData.goldThreshold = gold;
    if (platinum !== undefined) updateData.platinumThreshold = platinum;

    const updated = await prisma.loyaltyConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "LOYALTY_TIERS_UPDATED",
        entity: "LoyaltyConfig",
        entityId: config.id,
        changes: { previousValues, newValues: updateData },
      },
    });

    res.json({
      success: true,
      message: "Tier thresholds updated",
      data: {
        silver: updated.silverThreshold,
        gold: updated.goldThreshold,
        platinum: updated.platinumThreshold,
      },
    });
  },
);

/**
 * Update Free Ride Redemption points
 */
export const updateFreeRideRedemption = asyncWrapper(
  async (req: Request, res: Response) => {
    const { economySedan, businessSedan, firstClass, businessSuv } = req.body;

    // Validate all provided values are positive integers
    const fields: Record<string, any> = {
      economySedan,
      businessSedan,
      firstClass,
      businessSuv,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (
        value !== undefined &&
        (typeof value !== "number" || value < 1 || !Number.isInteger(value))
      ) {
        throw new BadRequestError(`${key} must be a positive integer`);
      }
    }

    let config = await prisma.loyaltyConfig.findFirst();
    if (!config) {
      config = await prisma.loyaltyConfig.create({ data: {} });
    }

    const previousValues = {
      freeRideEconomy: config.freeRideEconomy,
      freeRideBusiness: config.freeRideBusiness,
      freeRideFirstClass: config.freeRideFirstClass,
      freeRideBusinessSuv: config.freeRideBusinessSuv,
    };

    const updateData: any = { updatedBy: req.user!.id };
    if (economySedan !== undefined) updateData.freeRideEconomy = economySedan;
    if (businessSedan !== undefined)
      updateData.freeRideBusiness = businessSedan;
    if (firstClass !== undefined) updateData.freeRideFirstClass = firstClass;
    if (businessSuv !== undefined) updateData.freeRideBusinessSuv = businessSuv;

    const updated = await prisma.loyaltyConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "LOYALTY_FREE_RIDE_UPDATED",
        entity: "LoyaltyConfig",
        entityId: config.id,
        changes: { previousValues, newValues: updateData },
      },
    });

    res.json({
      success: true,
      message: "Free ride redemption points updated",
      data: {
        economySedan: updated.freeRideEconomy,
        businessSedan: updated.freeRideBusiness,
        firstClass: updated.freeRideFirstClass,
        businessSuv: updated.freeRideBusinessSuv,
      },
    });
  },
);

/**
 * Save all loyalty settings at once (bulk save)
 */
export const saveLoyaltyConfig = asyncWrapper(
  async (req: Request, res: Response) => {
    const {
      pointsPerSar,
      isPointsEnabled,
      birthdayDiscountPercent,
      isBirthdayDiscountEnabled,
      tierThresholds,
      freeRideRedemption,
    } = req.body;

    let config = await prisma.loyaltyConfig.findFirst();
    if (!config) {
      config = await prisma.loyaltyConfig.create({ data: {} });
    }

    const previousConfig = { ...config };
    const updateData: any = { updatedBy: req.user!.id };

    // Points Per SAR
    if (pointsPerSar !== undefined) updateData.pointsPerSar = pointsPerSar;
    if (isPointsEnabled !== undefined)
      updateData.isPointsEnabled = isPointsEnabled;

    // Birthday Discount
    if (birthdayDiscountPercent !== undefined) {
      if (birthdayDiscountPercent < 0 || birthdayDiscountPercent > 100) {
        throw new BadRequestError(
          "birthdayDiscountPercent must be between 0 and 100",
        );
      }
      updateData.birthdayDiscountPercent = birthdayDiscountPercent;
    }
    if (isBirthdayDiscountEnabled !== undefined)
      updateData.isBirthdayDiscountEnabled = isBirthdayDiscountEnabled;

    // Tier Thresholds
    if (tierThresholds) {
      const silver = tierThresholds.silver ?? config.silverThreshold;
      const gold = tierThresholds.gold ?? config.goldThreshold;
      const platinum = tierThresholds.platinum ?? config.platinumThreshold;

      if (silver >= gold || gold >= platinum) {
        throw new BadRequestError(
          `Thresholds must be ascending: Silver (${silver}) < Gold (${gold}) < Platinum (${platinum})`,
        );
      }

      if (tierThresholds.silver !== undefined)
        updateData.silverThreshold = tierThresholds.silver;
      if (tierThresholds.gold !== undefined)
        updateData.goldThreshold = tierThresholds.gold;
      if (tierThresholds.platinum !== undefined)
        updateData.platinumThreshold = tierThresholds.platinum;
    }

    // Free Ride Redemption
    if (freeRideRedemption) {
      if (freeRideRedemption.economySedan !== undefined)
        updateData.freeRideEconomy = freeRideRedemption.economySedan;
      if (freeRideRedemption.businessSedan !== undefined)
        updateData.freeRideBusiness = freeRideRedemption.businessSedan;
      if (freeRideRedemption.firstClass !== undefined)
        updateData.freeRideFirstClass = freeRideRedemption.firstClass;
      if (freeRideRedemption.businessSuv !== undefined)
        updateData.freeRideBusinessSuv = freeRideRedemption.businessSuv;
    }

    const updated = await prisma.loyaltyConfig.update({
      where: { id: config.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "LOYALTY_CONFIG_BULK_UPDATED",
        entity: "LoyaltyConfig",
        entityId: config.id,
        changes: {
          previousValues: {
            pointsPerSar: previousConfig.pointsPerSar,
            isPointsEnabled: previousConfig.isPointsEnabled,
            birthdayDiscountPercent: previousConfig.birthdayDiscountPercent,
            isBirthdayDiscountEnabled: previousConfig.isBirthdayDiscountEnabled,
            silverThreshold: previousConfig.silverThreshold,
            goldThreshold: previousConfig.goldThreshold,
            platinumThreshold: previousConfig.platinumThreshold,
            freeRideEconomy: previousConfig.freeRideEconomy,
            freeRideBusiness: previousConfig.freeRideBusiness,
            freeRideFirstClass: previousConfig.freeRideFirstClass,
            freeRideBusinessSuv: previousConfig.freeRideBusinessSuv,
          },
          updatedFields: Object.keys(updateData).filter(
            (k) => k !== "updatedBy",
          ),
        },
      },
    });

    res.json({
      success: true,
      message: "Loyalty configuration saved",
      data: {
        pointsPerSar: updated.pointsPerSar,
        isPointsEnabled: updated.isPointsEnabled,
        birthdayDiscountPercent: updated.birthdayDiscountPercent,
        isBirthdayDiscountEnabled: updated.isBirthdayDiscountEnabled,
        tierThresholds: {
          silver: updated.silverThreshold,
          gold: updated.goldThreshold,
          platinum: updated.platinumThreshold,
        },
        freeRideRedemption: {
          economySedan: updated.freeRideEconomy,
          businessSedan: updated.freeRideBusiness,
          firstClass: updated.freeRideFirstClass,
          businessSuv: updated.freeRideBusinessSuv,
        },
      },
    });
  },
);

// ================================================================
// 3. WHATSAPP MESSAGE TEMPLATE
//    Template for booking confirmation, toggle on/off
// ================================================================

/**
 * Get WhatsApp template configuration
 */
export const getWhatsAppTemplate = asyncWrapper(
  async (req: Request, res: Response) => {
    let template = await prisma.whatsAppTemplate.findFirst();

    if (!template) {
      template = await prisma.whatsAppTemplate.create({
        data: {}, // Uses @default template from schema
      });
    }

    // Available placeholders for the admin to use
    const availablePlaceholders = [
      { key: "{{customerName}}", description: "Customer's full name" },
      {
        key: "{{bookingRef}}",
        description: "Booking reference ID (e.g., BK-2026-0412)",
      },
      { key: "{{tripDate}}", description: "Trip date" },
      { key: "{{tripTime}}", description: "Trip time" },
      { key: "{{pickupAddress}}", description: "Pickup location address" },
      { key: "{{dropoffAddress}}", description: "Dropoff location address" },
      {
        key: "{{vehicleClass}}",
        description: "Vehicle type (e.g., Business Sedan)",
      },
      { key: "{{driverName}}", description: "Assigned driver's full name" },
      { key: "{{driverPhone}}", description: "Assigned driver's phone number" },
      { key: "{{totalPrice}}", description: "Total trip price in SAR" },
      { key: "{{companyName}}", description: "Vendor company name" },
    ];

    res.json({
      success: true,
      data: {
        template: template.bookingConfirmationTemplate,
        isEnabled: template.isEnabled,
        lastUpdated: template.updatedAt,
        lastUpdatedBy: template.updatedBy,
        availablePlaceholders,
      },
    });
  },
);

/**
 * Update WhatsApp template message
 */
export const updateWhatsAppTemplate = asyncWrapper(
  async (req: Request, res: Response) => {
    const { template } = req.body;

    if (
      !template ||
      typeof template !== "string" ||
      template.trim().length === 0
    ) {
      throw new BadRequestError(
        "template is required and must be a non-empty string",
      );
    }

    if (template.length > 2000) {
      throw new BadRequestError("Template cannot exceed 2000 characters");
    }

    let config = await prisma.whatsAppTemplate.findFirst();
    if (!config) {
      config = await prisma.whatsAppTemplate.create({ data: {} });
    }

    const previousTemplate = config.bookingConfirmationTemplate;

    const updated = await prisma.whatsAppTemplate.update({
      where: { id: config.id },
      data: {
        bookingConfirmationTemplate: template.trim(),
        updatedBy: req.user!.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "WHATSAPP_TEMPLATE_UPDATED",
        entity: "WhatsAppTemplate",
        entityId: config.id,
        changes: {
          previousTemplate: previousTemplate.substring(0, 200) + "...",
          newTemplatePreview: template.substring(0, 200) + "...",
        },
      },
    });

    res.json({
      success: true,
      message: "WhatsApp template updated",
      data: {
        template: updated.bookingConfirmationTemplate,
        isEnabled: updated.isEnabled,
      },
    });
  },
);

/**
 * Toggle WhatsApp template on/off
 */
export const toggleWhatsAppTemplate = asyncWrapper(
  async (req: Request, res: Response) => {
    const { isEnabled } = req.body;

    if (typeof isEnabled !== "boolean") {
      throw new BadRequestError("isEnabled must be a boolean");
    }

    let config = await prisma.whatsAppTemplate.findFirst();
    if (!config) {
      config = await prisma.whatsAppTemplate.create({ data: {} });
    }

    const updated = await prisma.whatsAppTemplate.update({
      where: { id: config.id },
      data: {
        isEnabled,
        updatedBy: req.user!.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: isEnabled
          ? "WHATSAPP_TEMPLATE_ENABLED"
          : "WHATSAPP_TEMPLATE_DISABLED",
        entity: "WhatsAppTemplate",
        entityId: config.id,
      },
    });

    res.json({
      success: true,
      message: `WhatsApp notifications ${isEnabled ? "enabled" : "disabled"}`,
      data: { isEnabled: updated.isEnabled },
    });
  },
);

/**
 * Preview WhatsApp template with sample data
 */
export const previewWhatsAppTemplate = asyncWrapper(
  async (req: Request, res: Response) => {
    let config = await prisma.whatsAppTemplate.findFirst();
    if (!config) {
      config = await prisma.whatsAppTemplate.create({ data: {} });
    }

    const sampleData: Record<string, string> = {
      "{{customerName}}": "Ahmed Al-Rashid",
      "{{bookingRef}}": "BK-2026-0412",
      "{{tripDate}}": "2026-05-15",
      "{{tripTime}}": "14:30",
      "{{pickupAddress}}": "King Khalid International Airport, Riyadh",
      "{{dropoffAddress}}": "Four Seasons Hotel, Riyadh",
      "{{vehicleClass}}": "Business Sedan",
      "{{driverName}}": "Mohammed Al-Harbi",
      "{{driverPhone}}": "+966 55 123 4567",
      "{{totalPrice}}": "350.00 SAR",
      "{{companyName}}": "Saudi Limo Services",
    };

    let preview = config.bookingConfirmationTemplate;
    for (const [placeholder, value] of Object.entries(sampleData)) {
      preview = preview.split(placeholder).join(value);
    }

    res.json({
      success: true,
      data: {
        preview,
        template: config.bookingConfirmationTemplate,
        sampleData,
      },
    });
  },
);
