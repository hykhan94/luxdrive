// ============================================
// apps/server/src/controller/partner/tariff.controller.ts
// Partner Portal — Tariff Section (Read-Only)
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import { requireOperational } from "./_shared";

// ============== HELPERS ==============

async function getPartnerForUser(userId: string) {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!partner) throw new NotFoundError("Partner profile");

  return partner;
}

// Vehicle class labels for display
const VEHICLE_LABELS: Record<string, string> = {
  economySedan: "Economy Sedan",
  businessSedan: "Business Sedan",
  firstClass: "First Class",
  businessSuv: "Business SUV",
  hiace: "Hiace (10-Seater)",
  coaster: "Coaster (23-Seater)",
  kingLong: "King Long (49-Seater)",
};

const VEHICLE_COLUMNS = [
  "economySedan",
  "businessSedan",
  "firstClass",
  "businessSuv",
  "hiace",
  "coaster",
  "kingLong",
];

// ============== GET ALL CITIES OVERVIEW ==============

/**
 * Get tariff overview for all cities — route counts per city and type
 * Used by frontend to render city tabs with badge counts
 */
export const getTariffOverview = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const cities = ["RIYADH", "JEDDAH", "MAKKAH", "MADINAH"];

    // Count routes per city per type
    const routeCounts = await prisma.routeTariff.groupBy({
      by: ["city", "routeType"],
      where: { isActive: true },
      _count: { id: true },
    });

    // Count electric routes (Riyadh only)
    const electricConfig = await prisma.electricFleetConfig.findFirst();
    const electricCount = electricConfig?.isEnabled
      ? await prisma.electricTariff.count({
          where: { city: "RIYADH", isActive: true },
        })
      : 0;

    // Build overview per city
    const overview = cities.map((city) => {
      const oneWayCount =
        routeCounts.find((r) => r.city === city && r.routeType === "ONE_WAY")
          ?._count.id || 0;
      const hourlyCount =
        routeCounts.find((r) => r.city === city && r.routeType === "HOURLY")
          ?._count.id || 0;

      return {
        city,
        oneWayRoutes: oneWayCount,
        hourlyRoutes: hourlyCount,
        electricRoutes: city === "RIYADH" ? electricCount : 0,
        totalRoutes:
          oneWayCount + hourlyCount + (city === "RIYADH" ? electricCount : 0),
        hasElectric: city === "RIYADH" && electricCount > 0,
      };
    });

    res.json({
      success: true,
      data: {
        cities: overview,
        electricEnabled: electricConfig?.isEnabled || false,
      },
    });
  },
);

// ============== GET TARIFFS FOR A SPECIFIC CITY ==============

/**
 * Get all tariffs for a city — ONE_WAY routes, HOURLY routes, and ELECTRIC (Riyadh only)
 * Returns the exact same data as admin portal tariff section (read-only)
 */
export const getCityTariffs = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { city } = req.params;

    const validCities = ["RIYADH", "JEDDAH", "MAKKAH", "MADINAH"];
    if (!validCities.includes(city)) {
      throw new BadRequestError(
        `Invalid city. Must be one of: ${validCities.join(", ")}`,
      );
    }

    // Get ONE_WAY routes for this city
    const oneWayRoutes = await prisma.routeTariff.findMany({
      where: { city: city as any, routeType: "ONE_WAY", isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    // Get HOURLY routes for this city
    const hourlyRoutes = await prisma.routeTariff.findMany({
      where: { city: city as any, routeType: "HOURLY", isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    // Get ELECTRIC routes (Riyadh only)
    let electricRoutes: any[] = [];
    let electricEnabled = false;

    if (city === "RIYADH") {
      const electricConfig = await prisma.electricFleetConfig.findFirst();
      electricEnabled = electricConfig?.isEnabled || false;

      if (electricEnabled) {
        electricRoutes = await prisma.electricTariff.findMany({
          where: { city: "RIYADH", isActive: true },
          orderBy: { sortOrder: "asc" },
        });
      }
    }

    // Format routes with vehicle prices as table-ready data
    const formatRoute = (route: any) => ({
      id: route.id,
      routeName: route.routeName,
      pickupLocation: route.pickupLocation,
      dropoffLocation: route.dropoffLocation,
      isPerKm: route.isPerKm,
      prices: VEHICLE_COLUMNS.map((col) => ({
        vehicleClass: col,
        label: VEHICLE_LABELS[col],
        price:
          route[col] !== null && route[col] !== undefined
            ? Number(route[col])
            : null,
      })),
      // Flat price map for quick access
      priceMap: {
        economySedan: route.economySedan ? Number(route.economySedan) : null,
        businessSedan: route.businessSedan ? Number(route.businessSedan) : null,
        firstClass: route.firstClass ? Number(route.firstClass) : null,
        businessSuv: route.businessSuv ? Number(route.businessSuv) : null,
        hiace: route.hiace ? Number(route.hiace) : null,
        coaster: route.coaster ? Number(route.coaster) : null,
        kingLong: route.kingLong ? Number(route.kingLong) : null,
      },
    });

    const formatElectricRoute = (route: any) => ({
      id: route.id,
      routeName: route.routeName,
      pickupLocation: route.pickupLocation,
      dropoffLocation: route.dropoffLocation,
      isPerKm: route.isPerKm,
      price: route.price ? Number(route.price) : null,
    });

    res.json({
      success: true,
      data: {
        city,
        oneWay: {
          label: "One Way Routes",
          count: oneWayRoutes.length,
          vehicleColumns: VEHICLE_COLUMNS.map((col) => ({
            key: col,
            label: VEHICLE_LABELS[col],
          })),
          routes: oneWayRoutes.map(formatRoute),
        },
        hourly: {
          label: "Hourly Routes",
          count: hourlyRoutes.length,
          vehicleColumns: VEHICLE_COLUMNS.map((col) => ({
            key: col,
            label: VEHICLE_LABELS[col],
          })),
          routes: hourlyRoutes.map(formatRoute),
        },
        electric:
          city === "RIYADH"
            ? {
                label: "Electric Routes",
                enabled: electricEnabled,
                count: electricRoutes.length,
                routes: electricRoutes.map(formatElectricRoute),
              }
            : null,
      },
    });
  },
);

// ============== GET SPECIFIC ROUTE TYPE FOR A CITY ==============

/**
 * Get tariffs for a specific route type within a city
 * Useful if the frontend loads tabs lazily (one tab at a time)
 */
export const getCityRouteTypeTariffs = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { city, routeType } = req.params;

    const validCities = ["RIYADH", "JEDDAH", "MAKKAH", "MADINAH"];
    if (!validCities.includes(city)) {
      throw new BadRequestError(
        `Invalid city. Must be one of: ${validCities.join(", ")}`,
      );
    }

    const validTypes = ["ONE_WAY", "HOURLY", "ELECTRIC"];
    if (!validTypes.includes(routeType)) {
      throw new BadRequestError(
        `Invalid route type. Must be one of: ${validTypes.join(", ")}`,
      );
    }

    // Handle electric separately
    if (routeType === "ELECTRIC") {
      if (city !== "RIYADH") {
        res.json({
          success: true,
          data: {
            city,
            routeType: "ELECTRIC",
            available: false,
            message: "Electric routes are only available in Riyadh",
            routes: [],
          },
        });
        return;
      }

      const electricConfig = await prisma.electricFleetConfig.findFirst();
      if (!electricConfig?.isEnabled) {
        res.json({
          success: true,
          data: {
            city,
            routeType: "ELECTRIC",
            available: false,
            message: "Electric fleet is currently disabled",
            routes: [],
          },
        });
        return;
      }

      const routes = await prisma.electricTariff.findMany({
        where: { city: "RIYADH", isActive: true },
        orderBy: { sortOrder: "asc" },
      });

      res.json({
        success: true,
        data: {
          city,
          routeType: "ELECTRIC",
          available: true,
          count: routes.length,
          routes: routes.map((r) => ({
            id: r.id,
            routeName: r.routeName,
            pickupLocation: r.pickupLocation,
            dropoffLocation: r.dropoffLocation,
            isPerKm: r.isPerKm,
            price: r.price ? Number(r.price) : null,
          })),
        },
      });
      return;
    }

    // Standard routes (ONE_WAY or HOURLY)
    const routes = await prisma.routeTariff.findMany({
      where: {
        city: city as any,
        routeType: routeType as any,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    res.json({
      success: true,
      data: {
        city,
        routeType,
        count: routes.length,
        vehicleColumns: VEHICLE_COLUMNS.map((col) => ({
          key: col,
          label: VEHICLE_LABELS[col],
        })),
        routes: routes.map((route) => ({
          id: route.id,
          routeName: route.routeName,
          pickupLocation: route.pickupLocation,
          dropoffLocation: route.dropoffLocation,
          isPerKm: route.isPerKm,
          prices: VEHICLE_COLUMNS.map((col) => ({
            vehicleClass: col,
            label: VEHICLE_LABELS[col],
            price:
              (route as any)[col] !== null ? Number((route as any)[col]) : null,
          })),
          priceMap: {
            economySedan: route.economySedan
              ? Number(route.economySedan)
              : null,
            businessSedan: route.businessSedan
              ? Number(route.businessSedan)
              : null,
            firstClass: route.firstClass ? Number(route.firstClass) : null,
            businessSuv: route.businessSuv ? Number(route.businessSuv) : null,
            hiace: route.hiace ? Number(route.hiace) : null,
            coaster: route.coaster ? Number(route.coaster) : null,
            kingLong: route.kingLong ? Number(route.kingLong) : null,
          },
        })),
      },
    });
  },
);
