// ============================================
// apps/server/src/controller/admin/tariff.controller.ts
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";

// Vehicle class mapping
const VEHICLE_CLASSES = [
  { key: "economySedan", name: "Economy Sedan", dbField: "economySedan" },
  { key: "businessSedan", name: "Business Sedan", dbField: "businessSedan" },
  { key: "firstClass", name: "First Class", dbField: "firstClass" },
  { key: "businessSuv", name: "Business SUV", dbField: "businessSuv" },
  { key: "hiace", name: "Hiace 10-Seater", dbField: "hiace" },
  { key: "coaster", name: "Coaster 23-Seater", dbField: "coaster" },
  { key: "kingLong", name: "King Long 49-Seater", dbField: "kingLong" },
];

const CITIES = [
  { value: "RIYADH", label: "Riyadh", region: "Central Province" },
  { value: "JEDDAH", label: "Jeddah", region: "Western Province" },
  { value: "MAKKAH", label: "Makkah", region: "Western Province" },
  { value: "MADINAH", label: "Madinah", region: "Western Province" },
];

// ============== GET TARIFFS ==============

/**
 * Get tariffs for a specific city
 */
export const getCityTariffs = asyncWrapper(
  async (req: Request, res: Response) => {
    const { city } = req.params;

    if (!["RIYADH", "JEDDAH", "MAKKAH", "MADINAH"].includes(city)) {
      throw new BadRequestError("Invalid city");
    }

    const [tariffs, electricTariffs, electricConfig, changeLog] =
      await Promise.all([
        prisma.routeTariff.findMany({
          where: { city: city as any, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
        city === "RIYADH"
          ? prisma.electricTariff.findMany({
              where: { city: "RIYADH", isActive: true },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            })
          : Promise.resolve([]),
        prisma.electricFleetConfig.findFirst(),
        prisma.tariffChangeLog.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
        }),
      ]);

    // Format tariffs
    const formatTariff = (tariff: any) => {
      const hasPrices = VEHICLE_CLASSES.some(
        (vc) => tariff[vc.dbField as keyof typeof tariff] !== null,
      );
      return {
        id: tariff.id,
        routeName: tariff.routeName,
        pickupLocation: tariff.pickupLocation,
        dropoffLocation: tariff.dropoffLocation,
        isPerKm: tariff.isPerKm,
        isTBD: !hasPrices,
        prices: {
          economySedan: tariff.economySedan,
          businessSedan: tariff.businessSedan,
          firstClass: tariff.firstClass,
          businessSuv: tariff.businessSuv,
          hiace: tariff.hiace,
          coaster: tariff.coaster,
          kingLong: tariff.kingLong,
        },
      };
    };

    const oneWayRoutes = tariffs
      .filter((t) => t.routeType === "ONE_WAY")
      .map(formatTariff);
    const hourlyRates = tariffs
      .filter((t) => t.routeType === "HOURLY")
      .map(formatTariff);

    const ecoFleet = electricTariffs.map((t) => ({
      id: t.id,
      routeName: t.routeName,
      pickupLocation: t.pickupLocation,
      dropoffLocation: t.dropoffLocation,
      price: t.price,
      isPerKm: t.isPerKm,
      isTBD: t.price === null,
    }));

    res.json({
      success: true,
      data: {
        city,
        cityInfo: CITIES.find((c) => c.value === city),
        vehicleClasses: VEHICLE_CLASSES,
        oneWayRoutes,
        hourlyRates,
        ecoFleet: city === "RIYADH" ? ecoFleet : null,
        ecoFleetEnabled: electricConfig?.isEnabled ?? true,
        showEcoFleet: city === "RIYADH",
        changeHistory: changeLog.map((log) => ({
          id: log.id,
          user: log.userName,
          action: log.action,
          routeName: log.routeName,
          vehicleClass: log.vehicleClass,
          oldValue: log.oldValue,
          newValue: log.newValue,
          createdAt: log.createdAt,
        })),
      },
    });
  },
);

/**
 * Get all cities overview
 */
export const getTariffOverview = asyncWrapper(
  async (req: Request, res: Response) => {
    const [routeCounts, changeLog] = await Promise.all([
      prisma.routeTariff.groupBy({
        by: ["city", "routeType"],
        where: { isActive: true },
        _count: { id: true },
      }),
      prisma.tariffChangeLog.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const cities = CITIES.map((city) => {
      const oneWay = routeCounts.find(
        (r) => r.city === city.value && r.routeType === "ONE_WAY",
      );
      const hourly = routeCounts.find(
        (r) => r.city === city.value && r.routeType === "HOURLY",
      );
      return {
        ...city,
        oneWayCount: oneWay?._count.id || 0,
        hourlyCount: hourly?._count.id || 0,
      };
    });

    res.json({
      success: true,
      data: {
        cities,
        vehicleClasses: VEHICLE_CLASSES,
        changeHistory: changeLog.map((log) => ({
          id: log.id,
          user: log.userName,
          action: log.action,
          routeName: log.routeName,
          vehicleClass: log.vehicleClass,
          oldValue: log.oldValue,
          newValue: log.newValue,
          bulkPercent: log.bulkPercent,
          city: log.city,
          routeType: log.routeType,
          createdAt: log.createdAt,
        })),
      },
    });
  },
);

// ============== ADD ROUTE ==============

/**
 * Fixed duration tiers for HOURLY route type. These mirror the
 * industry-standard chauffeur tariff structure (6-8 hour day rate,
 * extra hour overage, hourly rate for short bookings) and are NOT
 * admin-defined — restricting the admin to these three keeps tier
 * labels consistent across cities and downstream consumers (partner
 * book-ride flow, invoicing).
 */
const HOURLY_DURATION_TIERS = [
  "6-8 Hours (Day Rate)",
  "Extra Hour (After 8 Hours)",
  "Per Hour Rate",
] as const;

/**
 * Add a new route
 *
 * Branches on routeType:
 *   - ONE_WAY: requires pickupLocation + dropoffLocation, routeName is
 *     "{pickup} → {dropoff}"
 *   - HOURLY:  requires durationTier (one of HOURLY_DURATION_TIERS).
 *     routeName is the tier itself; pickup/dropoff are stored as empty
 *     strings since they don't apply to time-based pricing.
 */
export const addRoute = asyncWrapper(async (req: Request, res: Response) => {
  const {
    city,
    routeType,
    pickupLocation,
    dropoffLocation,
    durationTier,
    prices,
    isPerKm,
  } = req.body;

  if (!city || !routeType) {
    throw new BadRequestError("city and routeType are required");
  }

  if (!["RIYADH", "JEDDAH", "MAKKAH", "MADINAH"].includes(city)) {
    throw new BadRequestError("Invalid city");
  }

  if (!["ONE_WAY", "HOURLY"].includes(routeType)) {
    throw new BadRequestError("routeType must be ONE_WAY or HOURLY");
  }

  // Per-route-type validation and field derivation.
  // The route uses three DB columns for identity (routeName,
  // pickupLocation, dropoffLocation). For ONE_WAY they're naturally
  // distinct; for HOURLY they all reduce to the tier label, with
  // pickup/dropoff stored as empty strings so the unique constraint
  // on [city, routeType, routeName] still does the right thing.
  let resolvedRouteName: string;
  let resolvedPickup: string;
  let resolvedDropoff: string;
  let resolvedIsPerKm: boolean;

  if (routeType === "HOURLY") {
    if (!durationTier) {
      throw new BadRequestError(
        "durationTier is required for HOURLY route type",
      );
    }
    if (!HOURLY_DURATION_TIERS.includes(durationTier)) {
      throw new BadRequestError(
        `durationTier must be one of: ${HOURLY_DURATION_TIERS.join(", ")}`,
      );
    }
    resolvedRouteName = durationTier;
    resolvedPickup = "";
    resolvedDropoff = "";
    // isPerKm is meaningless for time-based pricing — force false so
    // downstream consumers can rely on the flag's semantics.
    resolvedIsPerKm = false;
  } else {
    // ONE_WAY
    if (!pickupLocation || !dropoffLocation) {
      throw new BadRequestError(
        "pickupLocation and dropoffLocation are required for ONE_WAY route type",
      );
    }
    resolvedRouteName = `${pickupLocation} → ${dropoffLocation}`;
    resolvedPickup = pickupLocation;
    resolvedDropoff = dropoffLocation;
    resolvedIsPerKm = isPerKm || false;
  }

  // Check for existing (including soft-deleted)
  const existing = await prisma.routeTariff.findFirst({
    where: { city, routeType, routeName: resolvedRouteName },
  });

  let tariff;

  if (existing && existing.isActive) {
    throw new BadRequestError(
      routeType === "HOURLY"
        ? `Tier "${resolvedRouteName}" already exists for this city`
        : "Route already exists",
    );
  } else if (existing && !existing.isActive) {
    // Reactivate soft-deleted route
    tariff = await prisma.routeTariff.update({
      where: { id: existing.id },
      data: {
        isActive: true,
        pickupLocation: resolvedPickup,
        dropoffLocation: resolvedDropoff,
        isPerKm: resolvedIsPerKm,
        economySedan: prices?.economySedan ?? null,
        businessSedan: prices?.businessSedan ?? null,
        firstClass: prices?.firstClass ?? null,
        businessSuv: prices?.businessSuv ?? null,
        hiace: prices?.hiace ?? null,
        coaster: prices?.coaster ?? null,
        kingLong: prices?.kingLong ?? null,
      },
    });
  } else {
    // Create new
    tariff = await prisma.routeTariff.create({
      data: {
        city,
        routeType,
        routeName: resolvedRouteName,
        pickupLocation: resolvedPickup,
        dropoffLocation: resolvedDropoff,
        isPerKm: resolvedIsPerKm,
        economySedan: prices?.economySedan ?? null,
        businessSedan: prices?.businessSedan ?? null,
        firstClass: prices?.firstClass ?? null,
        businessSuv: prices?.businessSuv ?? null,
        hiace: prices?.hiace ?? null,
        coaster: prices?.coaster ?? null,
        kingLong: prices?.kingLong ?? null,
      },
    });
  }

  // Log the action
  await prisma.tariffChangeLog.create({
    data: {
      userId: req.user!.id,
      userName: req.user!.name || req.user!.email,
      action: "created",
      routeName: resolvedRouteName,
      city,
      routeType,
    },
  });

  res.json({
    success: true,
    message:
      routeType === "HOURLY"
        ? `Tier "${resolvedRouteName}" added successfully`
        : "Route added successfully",
    data: tariff,
  });
});

// ============== UPDATE PRICE ==============

/**
 * Update a single price for a route
 */
export const updatePrice = asyncWrapper(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { vehicleClass, price } = req.body;

  if (!vehicleClass || price === undefined) {
    throw new BadRequestError("vehicleClass and price are required");
  }

  const validClasses = VEHICLE_CLASSES.map((vc) => vc.key);
  if (!validClasses.includes(vehicleClass)) {
    throw new BadRequestError(`Invalid vehicleClass`);
  }

  const tariff = await prisma.routeTariff.findUnique({ where: { id } });
  if (!tariff) {
    throw new NotFoundError("Route tariff");
  }

  const oldValue = tariff[vehicleClass as keyof typeof tariff] as number | null;
  const newValue = price === null || price === "" ? null : parseFloat(price);

  const updated = await prisma.routeTariff.update({
    where: { id },
    data: { [vehicleClass]: newValue },
  });

  // Log the change
  await prisma.tariffChangeLog.create({
    data: {
      userId: req.user!.id,
      userName: req.user!.name || req.user!.email,
      action: "updated",
      routeName: tariff.routeName,
      vehicleClass: VEHICLE_CLASSES.find((vc) => vc.key === vehicleClass)?.name,
      oldValue: oldValue ? oldValue : null,
      newValue,
      city: tariff.city,
      routeType: tariff.routeType,
    },
  });

  res.json({
    success: true,
    message: "Price updated",
    data: {
      id: updated.id,
      routeName: updated.routeName,
      vehicleClass,
      oldValue,
      newValue,
    },
  });
});

/**
 * Update multiple prices for a route at once
 */
export const updateRoutePrices = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { prices } = req.body;

    if (!prices || typeof prices !== "object") {
      throw new BadRequestError("prices object is required");
    }

    const tariff = await prisma.routeTariff.findUnique({ where: { id } });
    if (!tariff) {
      throw new NotFoundError("Route tariff");
    }

    const updateData: any = {};
    const changes: Array<{
      vehicleClass: string;
      oldValue: any;
      newValue: any;
    }> = [];

    for (const vc of VEHICLE_CLASSES) {
      if (prices[vc.key] !== undefined) {
        const oldValue = tariff[vc.dbField as keyof typeof tariff];
        const newValue =
          prices[vc.key] === null || prices[vc.key] === ""
            ? null
            : parseFloat(prices[vc.key]);
        updateData[vc.dbField] = newValue;
        if (oldValue !== newValue) {
          changes.push({ vehicleClass: vc.name, oldValue, newValue });
        }
      }
    }

    const updated = await prisma.routeTariff.update({
      where: { id },
      data: updateData,
    });

    // Log changes
    for (const change of changes) {
      await prisma.tariffChangeLog.create({
        data: {
          userId: req.user!.id,
          userName: req.user!.name || req.user!.email,
          action: "updated",
          routeName: tariff.routeName,
          vehicleClass: change.vehicleClass,
          oldValue: change.oldValue,
          newValue: change.newValue,
          city: tariff.city,
          routeType: tariff.routeType,
        },
      });
    }

    res.json({
      success: true,
      message: `${changes.length} prices updated`,
      data: updated,
    });
  },
);

// ============== DELETE ROUTE ==============

/**
 * Delete a route (soft delete)
 */
export const deleteRoute = asyncWrapper(async (req: Request, res: Response) => {
  const { id } = req.params;

  const tariff = await prisma.routeTariff.findUnique({ where: { id } });
  if (!tariff) {
    throw new NotFoundError("Route tariff");
  }

  await prisma.routeTariff.update({
    where: { id },
    data: { isActive: false },
  });

  // Log the action
  await prisma.tariffChangeLog.create({
    data: {
      userId: req.user!.id,
      userName: req.user!.name || req.user!.email,
      action: "deleted",
      routeName: tariff.routeName,
      city: tariff.city,
      routeType: tariff.routeType,
    },
  });

  res.json({ success: true, message: "Route deleted" });
});

// ============== BULK UPDATE ==============

/**
 * Bulk update prices by percentage
 */
export const bulkUpdatePrices = asyncWrapper(
  async (req: Request, res: Response) => {
    const { city, routeType, vehicleClasses, percentChange } = req.body;

    if (!percentChange || isNaN(percentChange)) {
      throw new BadRequestError(
        "percentChange is required and must be a number",
      );
    }

    const percent = parseFloat(percentChange);
    if (percent < -100 || percent > 1000) {
      throw new BadRequestError("percentChange must be between -100 and 1000");
    }

    const where: any = { isActive: true };
    if (city) where.city = city;
    if (routeType) where.routeType = routeType;

    const tariffs = await prisma.routeTariff.findMany({ where });

    // Which vehicle classes to update (default: all)
    const classesToUpdate =
      vehicleClasses && vehicleClasses.length > 0
        ? VEHICLE_CLASSES.filter((vc) => vehicleClasses.includes(vc.key))
        : VEHICLE_CLASSES;

    let updatedCount = 0;

    for (const tariff of tariffs) {
      const updateData: any = {};

      for (const vc of classesToUpdate) {
        const currentPrice = tariff[vc.dbField as keyof typeof tariff] as
          | number
          | null;
        if (currentPrice !== null) {
          const newPrice =
            Math.round(currentPrice * (1 + percent / 100) * 100) / 100;
          updateData[vc.dbField] = newPrice;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.routeTariff.update({
          where: { id: tariff.id },
          data: updateData,
        });
        updatedCount++;
      }
    }

    // Log bulk update
    await prisma.tariffChangeLog.create({
      data: {
        userId: req.user!.id,
        userName: req.user!.name || req.user!.email,
        action: "bulk_update",
        routeName: `${updatedCount} routes`,
        bulkPercent: percent,
        city: city || null,
        routeType: routeType || null,
      },
    });

    res.json({
      success: true,
      message: `${updatedCount} routes updated by ${percent > 0 ? "+" : ""}${percent}%`,
    });
  },
);

// ============== ECO FLEET ==============

/**
 * Get eco fleet tariffs (Riyadh only)
 */
export const getEcoFleetTariffs = asyncWrapper(
  async (req: Request, res: Response) => {
    const [tariffs, config] = await Promise.all([
      prisma.electricTariff.findMany({
        where: { city: "RIYADH", isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      prisma.electricFleetConfig.findFirst(),
    ]);

    res.json({
      success: true,
      data: {
        isEnabled: config?.isEnabled ?? true,
        tariffs: tariffs.map((t) => ({
          id: t.id,
          routeName: t.routeName,
          pickupLocation: t.pickupLocation,
          dropoffLocation: t.dropoffLocation,
          price: t.price,
          isPerKm: t.isPerKm,
          isTBD: t.price === null,
        })),
      },
    });
  },
);

/**
 * Toggle eco fleet availability
 */
export const toggleEcoFleet = asyncWrapper(
  async (req: Request, res: Response) => {
    const { isEnabled } = req.body;

    if (typeof isEnabled !== "boolean") {
      throw new BadRequestError("isEnabled boolean is required");
    }

    let config = await prisma.electricFleetConfig.findFirst();

    if (config) {
      config = await prisma.electricFleetConfig.update({
        where: { id: config.id },
        data: { isEnabled },
      });
    } else {
      config = await prisma.electricFleetConfig.create({
        data: { isEnabled },
      });
    }

    res.json({
      success: true,
      message: `Eco Fleet ${isEnabled ? "enabled" : "disabled"}`,
      data: { isEnabled: config.isEnabled },
    });
  },
);

/**
 * Update eco fleet price
 */
export const updateEcoFleetPrice = asyncWrapper(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { price } = req.body;

    const tariff = await prisma.electricTariff.findUnique({ where: { id } });
    if (!tariff) {
      throw new NotFoundError("Electric tariff");
    }

    const oldValue = tariff.price;
    const newValue = price === null || price === "" ? null : parseFloat(price);

    const updated = await prisma.electricTariff.update({
      where: { id },
      data: { price: newValue },
    });

    // Log the change
    await prisma.tariffChangeLog.create({
      data: {
        userId: req.user!.id,
        userName: req.user!.name || req.user!.email,
        action: "updated",
        routeName: tariff.routeName,
        vehicleClass: "Electric",
        oldValue: oldValue ? oldValue : null,
        newValue,
        city: "RIYADH",
      },
    });

    res.json({
      success: true,
      message: "Eco fleet price updated",
      data: {
        id: updated.id,
        routeName: updated.routeName,
        oldValue,
        newValue,
      },
    });
  },
);

// ============== CHANGE HISTORY ==============

/**
 * Get tariff change history
 */
export const getChangeHistory = asyncWrapper(
  async (req: Request, res: Response) => {
    const { page = "1", limit = "10", city, routeType } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (city) where.city = city;
    if (routeType) where.routeType = routeType;

    const [logs, total] = await Promise.all([
      prisma.tariffChangeLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.tariffChangeLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        logs: logs.map((log) => ({
          id: log.id,
          user: log.userName,
          action: log.action,
          routeName: log.routeName,
          vehicleClass: log.vehicleClass,
          oldValue: log.oldValue,
          newValue: log.newValue,
          bulkPercent: log.bulkPercent,
          city: log.city,
          routeType: log.routeType,
          createdAt: log.createdAt,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  },
);
