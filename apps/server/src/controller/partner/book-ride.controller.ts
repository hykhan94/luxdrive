// ============================================
// !!! DESTINATION PATH: apps/server/src/controller/partner/book-ride.controller.ts
// ============================================
// ============================================
// apps/server/src/controller/partner/booking.controller.ts
// Partner Portal — Book a Ride
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { NotFoundError, BadRequestError } from "../../utils/AppError";
import crypto from "crypto";
import { requireOperational, requireApprovedAndDocsValid } from "./_shared";

// ============== CONSTANTS ==============

// Max passengers per vehicle class
const VEHICLE_MAX_PASSENGERS: Record<string, number> = {
  ECONOMY_SEDAN: 4,
  BUSINESS_SEDAN: 4,
  FIRST_CLASS: 4,
  BUSINESS_SUV: 7,
  ELECTRIC: 4,
  HIACE: 10,
  COASTER: 23,
  KING_LONG: 49,
};

// Vehicle class to RouteTariff column mapping
const VEHICLE_TO_TARIFF_COLUMN: Record<string, string> = {
  ECONOMY_SEDAN: "economySedan",
  BUSINESS_SEDAN: "businessSedan",
  FIRST_CLASS: "firstClass",
  BUSINESS_SUV: "businessSuv",
  HIACE: "hiace",
  COASTER: "coaster",
  KING_LONG: "kingLong",
};

// VAT rate in Saudi Arabia
const VAT_RATE = 0.15;

// ============== HOURLY PRICING ==============

// Fixed duration tiers for HOURLY bookings — must match the admin
// tariff controller's HOURLY_DURATION_TIERS. The three tiers together
// define the rate table: short bookings use PER_HOUR, half/full-day
// bookings use DAY_RATE, and overage beyond 8 hours stacks
// EXTRA_HOUR on top of DAY_RATE.
const HOURLY_TIER_DAY_RATE = "6-8 Hours (Day Rate)";
const HOURLY_TIER_EXTRA_HOUR = "Extra Hour (After 8 Hours)";
const HOURLY_TIER_PER_HOUR = "Per Hour Rate";

// Bracket boundaries. Hours < DAY_RATE_MIN use per-hour pricing;
// DAY_RATE_MIN ≤ hours ≤ DAY_RATE_MAX use the flat day rate; hours
// > DAY_RATE_MAX add extra-hour overage on top of day rate.
const HOURLY_DAY_RATE_MIN = 6;
const HOURLY_DAY_RATE_MAX = 8;

export type HourlyBreakdownLine = {
  label: string; // human-readable, e.g. "Day rate (6-8 hours)"
  hours: number | null; // null for flat-rate line (day rate)
  rate: number; // per-unit rate in SAR
  amount: number; // line total in SAR
};

export type HourlyQuote = {
  subtotal: number; // sum of all line amounts (pre-peak, pre-VAT)
  hours: number;
  tier: "PER_HOUR" | "DAY_RATE" | "DAY_RATE_PLUS_EXTRA";
  breakdown: HourlyBreakdownLine[];
};

/**
 * Calculate the pre-peak, VAT-inclusive subtotal for an HOURLY booking.
 *
 * Reads all three duration-tier rows for (city, HOURLY) from RouteTariff
 * and applies the bracket logic:
 *   hours <  6  → hours × perHourRate              (PER_HOUR)
 *   6 ≤ hours ≤ 8 → dayRate                       (DAY_RATE)
 *   hours >  8  → dayRate + (hours - 8) × extraHourRate (DAY_RATE_PLUS_EXTRA)
 *
 * Throws BadRequestError with a precise message when the tier required
 * for the requested hours is missing or has a null price for this vehicle
 * class (e.g. partner asks for 10 hours of King Long but the Extra Hour
 * rate for King Long isn't set).
 *
 * The returned subtotal is in SAR and VAT-inclusive (admin tariff
 * prices are entered VAT-inclusive). Peak pricing and VAT extraction
 * happen in the caller.
 */
async function calculateHourlyPrice(
  city: string,
  vehicleClass: string,
  hours: number,
): Promise<HourlyQuote> {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new BadRequestError("hours must be a positive number");
  }

  const column = VEHICLE_TO_TARIFF_COLUMN[vehicleClass];
  if (!column) {
    throw new BadRequestError(`Invalid vehicle class: ${vehicleClass}`);
  }

  // Pull all three tier rows for this city in one query.
  const tierRows = await prisma.routeTariff.findMany({
    where: { city: city as any, routeType: "HOURLY", isActive: true },
  });

  const tierByName = new Map(tierRows.map((r) => [r.routeName, r]));

  const priceFromTier = (tierName: string): number | null => {
    const row = tierByName.get(tierName);
    if (!row) return null;
    const raw = (row as any)[column];
    return raw == null ? null : Number(raw);
  };

  const lines: HourlyBreakdownLine[] = [];
  let tier: HourlyQuote["tier"];

  if (hours < HOURLY_DAY_RATE_MIN) {
    // Short booking — straight per-hour multiplication.
    const perHour = priceFromTier(HOURLY_TIER_PER_HOUR);
    if (perHour == null) {
      throw new BadRequestError(
        `Per Hour Rate is not configured for ${vehicleClass} in ${city}. Bookings shorter than ${HOURLY_DAY_RATE_MIN} hours require this tier.`,
      );
    }
    tier = "PER_HOUR";
    lines.push({
      label: `Per-hour rate × ${hours} hour${hours === 1 ? "" : "s"}`,
      hours,
      rate: perHour,
      amount: perHour * hours,
    });
  } else if (hours <= HOURLY_DAY_RATE_MAX) {
    // Half/full-day flat rate.
    const dayRate = priceFromTier(HOURLY_TIER_DAY_RATE);
    if (dayRate == null) {
      throw new BadRequestError(
        `Day Rate (${HOURLY_DAY_RATE_MIN}-${HOURLY_DAY_RATE_MAX} hours) is not configured for ${vehicleClass} in ${city}.`,
      );
    }
    tier = "DAY_RATE";
    lines.push({
      label: `Day rate (${HOURLY_DAY_RATE_MIN}-${HOURLY_DAY_RATE_MAX} hours)`,
      hours: null,
      rate: dayRate,
      amount: dayRate,
    });
  } else {
    // Day rate plus extra-hour overage.
    const dayRate = priceFromTier(HOURLY_TIER_DAY_RATE);
    const extraRate = priceFromTier(HOURLY_TIER_EXTRA_HOUR);
    if (dayRate == null) {
      throw new BadRequestError(
        `Day Rate (${HOURLY_DAY_RATE_MIN}-${HOURLY_DAY_RATE_MAX} hours) is not configured for ${vehicleClass} in ${city}.`,
      );
    }
    if (extraRate == null) {
      throw new BadRequestError(
        `Extra Hour rate (after ${HOURLY_DAY_RATE_MAX} hours) is not configured for ${vehicleClass} in ${city}. Required for bookings longer than ${HOURLY_DAY_RATE_MAX} hours.`,
      );
    }
    const extraHours = hours - HOURLY_DAY_RATE_MAX;
    tier = "DAY_RATE_PLUS_EXTRA";
    lines.push({
      label: `Day rate (${HOURLY_DAY_RATE_MIN}-${HOURLY_DAY_RATE_MAX} hours)`,
      hours: null,
      rate: dayRate,
      amount: dayRate,
    });
    lines.push({
      label: `Extra hour × ${extraHours} hour${extraHours === 1 ? "" : "s"}`,
      hours: extraHours,
      rate: extraRate,
      amount: extraRate * extraHours,
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    hours,
    tier,
    breakdown: lines,
  };
}

// Keywords that indicate an airport route
const AIRPORT_KEYWORDS = [
  "airport",
  "مطار",
  "terminal",
  "ruh airport",
  "jed airport",
  "king khalid",
  "king abdulaziz",
  "prince mohammed bin abdulaziz",
  "kaia",
  "kkia",
];

// ============== HELPERS ==============

async function getPartnerForUser(userId: string) {
  const partner = await prisma.partner.findUnique({
    where: { userId },
    select: { id: true, status: true, companyName: true },
  });
  if (!partner) throw new NotFoundError("Partner profile");
  return partner;
}

/**
 * Generate booking reference
 * Partner bookings: ACM-202605-001 (first 3 chars of company name + YYYYMM + sequential)
 * Direct bookings:  LXD-202605-001 (LuxDrive prefix)
 */
async function generateBookingRef(
  source: "PARTNER" | "DIRECT",
  companyName?: string,
): Promise<string> {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
  );

  let prefix: string;

  if (source === "PARTNER" && companyName) {
    // Take first 3 letters of company name, uppercase, remove non-alpha
    prefix = companyName
      .replace(/[^a-zA-Z]/g, "")
      .substring(0, 3)
      .toUpperCase();
    // Fallback if company name is too short or all special chars
    if (prefix.length < 2) prefix = "PTR";
  } else {
    prefix = "LXD";
  }

  // Count existing bookings this month with the same prefix
  const existingCount = await prisma.booking.count({
    where: {
      bookingRef: { startsWith: `${prefix}-${yearMonth}-` },
      createdAt: { gte: monthStart, lte: monthEnd },
    },
  });

  const sequentialNumber = String(existingCount + 1).padStart(3, "0");

  return `${prefix}-${yearMonth}-${sequentialNumber}`;
}

function isAirportRoute(
  routeName: string,
  pickup: string,
  dropoff: string,
): boolean {
  const combined = `${routeName} ${pickup} ${dropoff}`.toLowerCase();
  return AIRPORT_KEYWORDS.some((kw) => combined.includes(kw));
}

// ============== GET ROUTES FOR CITY & TYPE ==============

/**
 * Get available routes for a city and trip type
 * Used to populate the route dropdown
 */
export const getAvailableRoutes = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { city, tripType } = req.query;

    if (!city || !tripType) {
      throw new BadRequestError("city and tripType are required");
    }

    const validCities = ["RIYADH", "JEDDAH", "MAKKAH", "MADINAH"];
    const validTypes = ["ONE_WAY", "HOURLY"];

    if (!validCities.includes(city as string)) {
      throw new BadRequestError(
        `Invalid city. Must be one of: ${validCities.join(", ")}`,
      );
    }
    if (!validTypes.includes(tripType as string)) {
      throw new BadRequestError(
        `Invalid tripType. Must be one of: ${validTypes.join(", ")}`,
      );
    }

    // Get standard routes
    const routes = await prisma.routeTariff.findMany({
      where: {
        city: city as any,
        routeType: tripType as any,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    // For Riyadh, also get electric tariffs
    let electricRoutes: any[] = [];
    if (city === "RIYADH") {
      const electricConfig = await prisma.electricFleetConfig.findFirst();
      if (electricConfig?.isEnabled) {
        electricRoutes = await prisma.electricTariff.findMany({
          where: { city: "RIYADH", isActive: true },
          orderBy: { sortOrder: "asc" },
        });
      }
    }

    // Format routes with vehicle prices and airport detection
    const formattedRoutes = routes.map((r) => ({
      id: r.id,
      routeName: r.routeName,
      pickupLocation: r.pickupLocation,
      dropoffLocation: r.dropoffLocation,
      isPerKm: r.isPerKm,
      isAirport: isAirportRoute(
        r.routeName,
        r.pickupLocation,
        r.dropoffLocation,
      ),
      prices: {
        ECONOMY_SEDAN: r.economySedan ? Number(r.economySedan) : null,
        BUSINESS_SEDAN: r.businessSedan ? Number(r.businessSedan) : null,
        FIRST_CLASS: r.firstClass ? Number(r.firstClass) : null,
        BUSINESS_SUV: r.businessSuv ? Number(r.businessSuv) : null,
        HIACE: r.hiace ? Number(r.hiace) : null,
        COASTER: r.coaster ? Number(r.coaster) : null,
        KING_LONG: r.kingLong ? Number(r.kingLong) : null,
      },
    }));

    // Add electric routes for Riyadh
    const formattedElectric = electricRoutes.map((r) => ({
      id: r.id,
      routeName: r.routeName,
      pickupLocation: r.pickupLocation,
      dropoffLocation: r.dropoffLocation,
      isPerKm: r.isPerKm,
      isAirport: isAirportRoute(
        r.routeName,
        r.pickupLocation,
        r.dropoffLocation,
      ),
      isElectric: true,
      prices: {
        ELECTRIC: r.price ? Number(r.price) : null,
      },
    }));

    res.json({
      success: true,
      data: {
        city,
        tripType,
        routes: formattedRoutes,
        electricRoutes: formattedElectric,
        electricAvailable: city === "RIYADH" && electricRoutes.length > 0,
      },
    });
  },
);

// ============== GET VEHICLE OPTIONS FOR A ROUTE ==============

/**
 * Get available vehicle classes and prices for a selected route
 * Returns passenger limits per vehicle
 */
export const getVehicleOptions = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { routeId, isElectric, hours } = req.query;

    if (!routeId) throw new BadRequestError("routeId is required");

    if (isElectric === "true") {
      const route = await prisma.electricTariff.findUnique({
        where: { id: routeId as string },
      });
      if (!route) throw new NotFoundError("Electric route");

      res.json({
        success: true,
        data: {
          routeName: route.routeName,
          vehicles: [
            {
              vehicleClass: "ELECTRIC",
              label: "Electric",
              modelExample: "Lucid Air or Similar",
              price: route.price ? Number(route.price) : null,
              maxPassengers: VEHICLE_MAX_PASSENGERS.ELECTRIC,
              available: route.price !== null,
            },
          ],
        },
      });
      return;
    }

    const route = await prisma.routeTariff.findUnique({
      where: { id: routeId as string },
    });
    if (!route) throw new NotFoundError("Route");

    // Check peak pricing
    const peakConfig = await prisma.peakPricingConfig.findFirst({
      where: { isEnabled: true },
    });
    const peakMultiplier =
      peakConfig && (!peakConfig.expiresAt || peakConfig.expiresAt > new Date())
        ? Number(peakConfig.multiplier)
        : 1.0;

    // `modelExample` mirrors the marketed vehicle model displayed on the
    // landing page fleet-showcase — surfaced here so the partner picking
    // a class in book-ride sees the same "which cars actually run" hint
    // ("Business Sedan (Mercedes E-Class / BMW 5 Series or Similar)")
    // that customers see. If landing copy shifts, update both sites.
    const vehicleClasses = [
      {
        key: "ECONOMY_SEDAN",
        label: "Economy Sedan",
        modelExample: "Ford Taurus / Lexus or Similar",
        column: "economySedan",
      },
      {
        key: "BUSINESS_SEDAN",
        label: "Business Sedan",
        modelExample: "Mercedes E-Class / BMW 5 Series or Similar",
        column: "businessSedan",
      },
      {
        key: "FIRST_CLASS",
        label: "First Class",
        modelExample: "BMW 7 Series / Mercedes S-Class or Similar",
        column: "firstClass",
      },
      {
        key: "BUSINESS_SUV",
        label: "Business SUV",
        modelExample: "GMC Yukon / Chevrolet Tahoe or Similar",
        column: "businessSuv",
      },
      {
        key: "HIACE",
        label: "Hiace (10-Seater)",
        modelExample: "Toyota Hiace or Similar",
        column: "hiace",
      },
      {
        key: "COASTER",
        label: "Coaster (23-Seater)",
        modelExample: "Toyota Coaster or Similar",
        column: "coaster",
      },
      {
        key: "KING_LONG",
        label: "King Long (49-Seater)",
        modelExample: "King Long XMQ / Higer or Similar",
        column: "kingLong",
      },
    ];

    // ============== HOURLY BRANCH ==============
    // For HOURLY routes, the per-vehicle price comes from the bracket
    // calculator across all three tier rows for the city (NOT the single
    // routeId column). The `hours` query param drives the calc.
    //
    // If hours isn't provided yet, fall back to returning the
    // single-row column prices as a rough preview, AND mark each
    // vehicle as `pendingHours: true` so the frontend knows the prices
    // are placeholders. This keeps the picker usable while the partner
    // hasn't yet chosen hours (e.g. UI lets them browse vehicles
    // first).
    if (route.routeType === "HOURLY") {
      const parsedHours = hours == null ? NaN : Number(hours);
      const hoursValid = Number.isFinite(parsedHours) && parsedHours > 0;

      const vehiclesHourly = await Promise.all(
        vehicleClasses.map(async (vc) => {
          if (!hoursValid) {
            return {
              vehicleClass: vc.key,
              label: vc.label,
              modelExample: vc.modelExample,
              basePrice: null as number | null,
              price: null as number | null,
              maxPassengers: VEHICLE_MAX_PASSENGERS[vc.key],
              available: false,
              pendingHours: true,
              unavailableReason: "Select hours to see price",
              isPeakActive: peakMultiplier > 1.0,
              peakMultiplier: peakMultiplier > 1.0 ? peakMultiplier : null,
            };
          }
          try {
            const quote = await calculateHourlyPrice(
              route.city,
              vc.key,
              parsedHours,
            );
            const afterPeak = quote.subtotal * peakMultiplier;
            return {
              vehicleClass: vc.key,
              label: vc.label,
              modelExample: vc.modelExample,
              basePrice: quote.subtotal,
              price: Math.round(afterPeak * 100) / 100,
              maxPassengers: VEHICLE_MAX_PASSENGERS[vc.key],
              available: true,
              pendingHours: false,
              unavailableReason: null,
              isPeakActive: peakMultiplier > 1.0,
              peakMultiplier: peakMultiplier > 1.0 ? peakMultiplier : null,
            };
          } catch (err: any) {
            // Calculator rejected this vehicle class — usually a
            // missing tier price. Surface the calculator's exact
            // reason so the partner (and admin via support tickets)
            // sees what to configure.
            return {
              vehicleClass: vc.key,
              label: vc.label,
              modelExample: vc.modelExample,
              basePrice: null,
              price: null,
              maxPassengers: VEHICLE_MAX_PASSENGERS[vc.key],
              available: false,
              pendingHours: false,
              unavailableReason: err?.message || "Not available",
              isPeakActive: peakMultiplier > 1.0,
              peakMultiplier: peakMultiplier > 1.0 ? peakMultiplier : null,
            };
          }
        }),
      );

      res.json({
        success: true,
        data: {
          routeName: route.routeName,
          isPerKm: false,
          isHourly: true,
          hours: hoursValid ? parsedHours : null,
          vehicles: vehiclesHourly.filter((v) => v.available),
          allVehicles: vehiclesHourly,
          peakActive: peakMultiplier > 1.0,
          peakMultiplier: peakMultiplier > 1.0 ? peakMultiplier : null,
        },
      });
      return;
    }

    // ============== ONE_WAY BRANCH (original logic) ==============
    // Filter out ELECTRIC for non-Riyadh (it's handled separately)
    const vehicles = vehicleClasses.map((vc) => {
      const basePrice = (route as any)[vc.column];
      const price = basePrice ? Number(basePrice) * peakMultiplier : null;
      return {
        vehicleClass: vc.key,
        label: vc.label,
        modelExample: vc.modelExample,
        basePrice: basePrice ? Number(basePrice) : null,
        price,
        maxPassengers: VEHICLE_MAX_PASSENGERS[vc.key],
        available: basePrice !== null,
        isPeakActive: peakMultiplier > 1.0,
        peakMultiplier: peakMultiplier > 1.0 ? peakMultiplier : null,
      };
    });

    res.json({
      success: true,
      data: {
        routeName: route.routeName,
        isPerKm: route.isPerKm,
        vehicles: vehicles.filter((v) => v.available),
        allVehicles: vehicles,
        peakActive: peakMultiplier > 1.0,
        peakMultiplier: peakMultiplier > 1.0 ? peakMultiplier : null,
      },
    });
  },
);

// ============== PRICE BREAKDOWN ==============

/**
 * Calculate price breakdown before final booking
 * Returns: base price, peak surcharge (if any), VAT, total
 */
export const getPriceBreakdown = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);

    const { routeId, vehicleClass, isElectric, hours } = req.body;

    if (!routeId || !vehicleClass) {
      throw new BadRequestError("routeId and vehicleClass are required");
    }

    let basePrice: number;
    let hourlyQuote: HourlyQuote | null = null;

    if (isElectric) {
      const route = await prisma.electricTariff.findUnique({
        where: { id: routeId },
      });
      if (!route || !route.price)
        throw new BadRequestError("Price not set for this electric route");
      basePrice = Number(route.price);
    } else {
      const route = await prisma.routeTariff.findUnique({
        where: { id: routeId },
      });
      if (!route) throw new NotFoundError("Route");

      if (route.routeType === "HOURLY") {
        // HOURLY uses bracket pricing across all three tier rows for the
        // city, NOT the single row picked by the partner. The picked row
        // just signals intent — the calculator decides which tier(s) apply
        // based on hours.
        const parsedHours = Number(hours);
        if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
          throw new BadRequestError(
            "hours is required and must be a positive number for hourly bookings",
          );
        }
        hourlyQuote = await calculateHourlyPrice(
          route.city,
          vehicleClass,
          parsedHours,
        );
        basePrice = hourlyQuote.subtotal;
      } else {
        // ONE_WAY — existing single-row lookup.
        const column = VEHICLE_TO_TARIFF_COLUMN[vehicleClass];
        if (!column) throw new BadRequestError("Invalid vehicle class");

        const routePrice = (route as any)[column];
        if (!routePrice)
          throw new BadRequestError(
            `Price not set for ${vehicleClass} on this route`,
          );
        basePrice = Number(routePrice);
      }
    }

    // Check peak pricing
    const peakConfig = await prisma.peakPricingConfig.findFirst({
      where: { isEnabled: true },
    });
    const peakMultiplier =
      peakConfig && (!peakConfig.expiresAt || peakConfig.expiresAt > new Date())
        ? Number(peakConfig.multiplier)
        : 1.0;

    const priceAfterPeak = basePrice * peakMultiplier;
    const peakSurcharge = priceAfterPeak - basePrice;
    // Admin tariff prices are VAT-inclusive, so extract VAT from the total
    const baseFareExVat = priceAfterPeak / (1 + VAT_RATE);
    const vatAmount = priceAfterPeak - baseFareExVat;
    const totalPrice = priceAfterPeak; // Total stays the same as the tariff price

    res.json({
      success: true,
      data: {
        basePrice: Math.round(baseFareExVat * 100) / 100,
        peakMultiplier,
        peakSurcharge: Math.round(peakSurcharge * 100) / 100,
        subtotal: Math.round(baseFareExVat * 100) / 100,
        vatRate: VAT_RATE,
        vatAmount: Math.round(vatAmount * 100) / 100,
        totalPrice: Math.round(totalPrice * 100) / 100,
        // Present only for hourly bookings. Frontend renders this as
        // line items above the VAT/total summary so partners see how
        // the bracket logic resolved their hours selection.
        hourly: hourlyQuote
          ? {
              hours: hourlyQuote.hours,
              tier: hourlyQuote.tier,
              breakdown: hourlyQuote.breakdown.map((l) => ({
                label: l.label,
                hours: l.hours,
                rate: Math.round(l.rate * 100) / 100,
                amount: Math.round(l.amount * 100) / 100,
              })),
              subtotalBeforePeak: hourlyQuote.subtotal,
            }
          : null,
      },
    });
  },
);

// ============== CREATE BOOKING ==============

/**
 * Create a new booking (ONE_WAY or HOURLY)
 * Validates everything, calculates price, creates with PENDING status
 */
export const createBooking = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    await requireApprovedAndDocsValid(partner);

    const {
      // Customer info
      guestName,
      guestPhone,
      guestEmail,
      // Trip details
      city,
      tripType,
      routeId,
      isElectric,
      // Locations (from Google Maps autocomplete)
      pickupAddress,
      pickupLat,
      pickupLng,
      dropoffAddress,
      dropoffLat,
      dropoffLng,
      // Airport fields (conditional)
      flightNumber,
      terminalNo,
      terminalLocation,
      // Schedule
      tripDate,
      tripTime,
      // Vehicle
      vehicleClass,
      passengers,
      // Hours — required for HOURLY, ignored for ONE_WAY
      hours: hoursFromBody,
      // Optional
      notes,
    } = req.body;

    // ============ VALIDATION ============

    // Required fields
    if (!guestName?.trim()) throw new BadRequestError("Guest name is required");
    if (!guestPhone?.trim())
      throw new BadRequestError("Guest phone number is required");
    if (!city) throw new BadRequestError("City is required");
    if (!tripType) throw new BadRequestError("Trip type is required");
    if (!routeId) throw new BadRequestError("Route is required");
    if (!pickupAddress?.trim())
      throw new BadRequestError("Pickup address is required");
    if (!dropoffAddress?.trim() && tripType === "ONE_WAY")
      throw new BadRequestError("Dropoff address is required");
    if (!tripDate) throw new BadRequestError("Trip date is required");
    if (!tripTime?.trim()) throw new BadRequestError("Trip time is required");
    if (!vehicleClass) throw new BadRequestError("Vehicle class is required");

    // City validation
    const validCities = ["RIYADH", "JEDDAH", "MAKKAH", "MADINAH"];
    if (!validCities.includes(city)) {
      throw new BadRequestError(
        `Invalid city. Must be one of: ${validCities.join(", ")}`,
      );
    }

    // Trip type validation
    if (!["ONE_WAY", "HOURLY"].includes(tripType)) {
      throw new BadRequestError("Trip type must be ONE_WAY or HOURLY");
    }

    // Vehicle class validation
    const allVehicleClasses = [
      "ECONOMY_SEDAN",
      "BUSINESS_SEDAN",
      "FIRST_CLASS",
      "BUSINESS_SUV",
      "ELECTRIC",
      "HIACE",
      "COASTER",
      "KING_LONG",
    ];
    if (!allVehicleClasses.includes(vehicleClass)) {
      throw new BadRequestError(
        `Invalid vehicle class. Must be one of: ${allVehicleClasses.join(", ")}`,
      );
    }

    // Electric is only available in Riyadh
    if (vehicleClass === "ELECTRIC" && city !== "RIYADH") {
      throw new BadRequestError(
        "Electric vehicles are only available in Riyadh",
      );
    }

    // Passenger validation
    const maxPassengers = VEHICLE_MAX_PASSENGERS[vehicleClass];
    const requestedPassengers = passengers || maxPassengers;
    if (requestedPassengers > maxPassengers) {
      throw new BadRequestError(
        `Maximum ${maxPassengers} passengers allowed for ${vehicleClass}. You requested ${requestedPassengers}.`,
      );
    }
    if (requestedPassengers < 1) {
      throw new BadRequestError("At least 1 passenger is required");
    }

    // Date validation — must be today or future
    const tripDateObj = new Date(tripDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (tripDateObj < today) {
      throw new BadRequestError("Trip date cannot be in the past");
    }

    // ============ ROUTE & PRICE LOOKUP ============

    let basePrice: number;
    let routeName: string;
    let hours: number | null = null;
    let hourlyDuration: string | null = null;
    let routeIsAirport = false;

    if (isElectric || vehicleClass === "ELECTRIC") {
      // Electric route
      const route = await prisma.electricTariff.findUnique({
        where: { id: routeId },
      });
      if (!route) throw new NotFoundError("Electric route not found");
      if (!route.price)
        throw new BadRequestError("Price not set for this electric route");
      if (!route.isActive)
        throw new BadRequestError("This route is currently inactive");

      basePrice = Number(route.price);
      routeName = route.routeName;
      routeIsAirport = isAirportRoute(
        route.routeName,
        route.pickupLocation,
        route.dropoffLocation,
      );
    } else {
      // Standard route
      const route = await prisma.routeTariff.findUnique({
        where: { id: routeId },
      });
      if (!route) throw new NotFoundError("Route not found");
      if (!route.isActive)
        throw new BadRequestError("This route is currently inactive");

      if (route.routeType === "HOURLY") {
        // HOURLY pricing comes from the bracket calculator, not the
        // single tier row picked in the form. The selected row just
        // signals "this is an hourly booking" — the calculator decides
        // which tier(s) apply based on hours.
        const parsedHours = Number(hoursFromBody);
        if (!Number.isFinite(parsedHours) || parsedHours <= 0) {
          throw new BadRequestError(
            "hours is required and must be a positive number for hourly bookings",
          );
        }
        const quote = await calculateHourlyPrice(
          route.city,
          vehicleClass,
          parsedHours,
        );
        basePrice = quote.subtotal;
        hours = parsedHours;
        // Human-readable summary stored on the booking for invoicing
        // and customer-facing displays. Reflects what was actually
        // computed (which tier(s) applied).
        if (quote.tier === "PER_HOUR") {
          hourlyDuration = `${parsedHours} hour${parsedHours === 1 ? "" : "s"} (per-hour rate)`;
        } else if (quote.tier === "DAY_RATE") {
          hourlyDuration = `${parsedHours} hour${parsedHours === 1 ? "" : "s"} (day rate)`;
        } else {
          const extra = parsedHours - HOURLY_DAY_RATE_MAX;
          hourlyDuration = `${parsedHours} hours (day rate + ${extra} extra hour${extra === 1 ? "" : "s"})`;
        }
        routeName = route.routeName;
        routeIsAirport = false; // hourly never airport
      } else {
        // ONE_WAY — single-row lookup.
        const column = VEHICLE_TO_TARIFF_COLUMN[vehicleClass];
        if (!column)
          throw new BadRequestError("Invalid vehicle class for standard route");

        const routePrice = (route as any)[column];
        if (!routePrice) {
          throw new BadRequestError(
            `${vehicleClass} is not available on this route (price not set by admin)`,
          );
        }

        basePrice = Number(routePrice);
        routeName = route.routeName;
        routeIsAirport = isAirportRoute(
          route.routeName,
          route.pickupLocation,
          route.dropoffLocation,
        );
      }
    }

    // Airport route validation: flight number is required for airport routes
    if (routeIsAirport && !flightNumber?.trim()) {
      throw new BadRequestError("Flight number is required for airport routes");
    }

    // ============ PEAK PRICING ============

    const peakConfig = await prisma.peakPricingConfig.findFirst({
      where: { isEnabled: true },
    });
    const peakMultiplier =
      peakConfig && (!peakConfig.expiresAt || peakConfig.expiresAt > new Date())
        ? Number(peakConfig.multiplier)
        : 1.0;

    // ============ CALCULATE FINAL PRICE ============

    const priceAfterPeak = basePrice * peakMultiplier;
    // Admin tariff prices are VAT-inclusive — extract VAT from total
    const baseFareExVat =
      Math.round((priceAfterPeak / (1 + VAT_RATE)) * 100) / 100;
    const vatAmount = Math.round((priceAfterPeak - baseFareExVat) * 100) / 100;
    const totalPrice = Math.round(priceAfterPeak * 100) / 100;

    // ============ CREATE BOOKING ============

    const booking = await prisma.booking.create({
      data: {
        bookingRef: await generateBookingRef("PARTNER", partner.companyName),
        // Opaque, non-guessable token for the public customer trip
        // card at /trip/{token}. We use crypto.randomUUID() (built
        // into Node 14.17+, no extra deps) — 128 bits of entropy is
        // more than enough to make brute-force enumeration of valid
        // tokens infeasible. Stays on the row permanently so old
        // confirmation links remain useful for a while, but the
        // public endpoint refuses to render once trip_date + 30
        // days is in the past.
        shareToken: crypto.randomUUID(),
        // Partner link
        partnerId: partner.id,
        source: "PARTNER",
        // Customer info
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        guestEmail: guestEmail?.trim() || null,
        // Trip details
        tripType: tripType as any,
        city: city as any,
        route: routeName,
        routeTariffId: routeId,
        hours,
        hourlyDuration,
        // Locations
        pickupAddress: pickupAddress.trim(),
        pickupLat: pickupLat || null,
        pickupLng: pickupLng || null,
        dropoffAddress: dropoffAddress?.trim() || pickupAddress.trim(),
        dropoffLat: dropoffLat || null,
        dropoffLng: dropoffLng || null,
        // Airport fields
        flightNumber: routeIsAirport ? flightNumber?.trim() || null : null,
        terminalNo: routeIsAirport ? terminalNo?.trim() || null : null,
        terminalLocation: routeIsAirport
          ? terminalLocation?.trim() || null
          : null,
        // Schedule
        tripDate: tripDateObj,
        tripTime: tripTime.trim(),
        // Vehicle
        vehicleClass: vehicleClass as any,
        passengers: requestedPassengers,
        // Pricing
        basePrice: baseFareExVat,
        peakMultiplier,
        vatAmount,
        totalPrice,
        // Status — sent to admin for vendor assignment
        status: "PENDING",
        notes: notes?.trim() || null,
        // Admin notification
        isReadByAdmin: false,
        needsAttention: true,
        attentionReason: "New partner booking — needs vendor assignment",
        attentionAt: new Date(),
      },
    });

    // Create notification for admin
    // Find admin users to notify
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "New Partner Booking",
          message: `${partner.companyName} booked a ${vehicleClass} ride for ${guestName} on ${tripDateObj.toLocaleDateString()} — ${routeName}`,
          type: "PARTNER_BOOKING_CREATED",
          data: {
            bookingId: booking.id,
            bookingRef: booking.bookingRef,
            partnerId: partner.id,
          },
        })),
      });
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_BOOKING_CREATED",
        entity: "Booking",
        entityId: booking.id,
        changes: {
          bookingRef: booking.bookingRef,
          partnerCompany: partner.companyName,
          guestName,
          city,
          tripType,
          route: routeName,
          vehicleClass,
          totalPrice,
        },
      },
    });

    res.status(201).json({
      success: true,
      message:
        "Booking created successfully. It has been sent to admin for vendor assignment.",
      data: {
        id: booking.id,
        bookingRef: booking.bookingRef,
        status: booking.status,
        statusLabel: "Sent to Admin",
        guestName: booking.guestName,
        route: booking.route,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        vehicleClass: booking.vehicleClass,
        passengers: booking.passengers,
        pricing: {
          basePrice: Number(booking.basePrice),
          peakMultiplier: Number(booking.peakMultiplier),
          vatAmount: Number(booking.vatAmount),
          totalPrice: Number(booking.totalPrice),
        },
        createdAt: booking.createdAt,
      },
    });
  },
);

// ============== GET SINGLE BOOKING DETAIL ==============

/**
 * Get full details of a single booking (for partner's own bookings only)
 */
export const getBookingDetail = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const { bookingId } = req.params;

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        partnerId: partner.id,
      },
      include: {
        vendor: {
          select: { companyName: true },
        },
        driver: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            photoUrl: true,
          },
        },
        vehicle: {
          select: {
            make: true,
            model: true,
            year: true,
            plateNumber: true,
            color: true,
            category: true,
          },
        },
      },
    });

    if (!booking) throw new NotFoundError("Booking");

    // Status labels for the partner. Keys MUST match the BookingStatus
    // enum on the Prisma schema — earlier this map had stale placeholder
    // keys (AWAITING_VENDOR, VENDOR_REJECTED, ALL_VENDORS_REJECTED,
    // UNSERVICEABLE) that no booking ever carries, so they were dead
    // and made the file look like states existed that don't.
    // Partner-facing wording deliberately masks the
    // PENDING / ASSIGNMENT_OFFERED / ASSIGNMENT_RE_OFFERED triplet into
    // a single "Awaiting Driver/Vehicle Assignment" step — partners
    // don't see the internal vendor-offer cycle.
    const statusLabels: Record<string, string> = {
      PENDING: "Awaiting Driver/Vehicle Assignment",
      ASSIGNMENT_OFFERED: "Awaiting Driver/Vehicle Assignment",
      ASSIGNMENT_RE_OFFERED: "Awaiting Driver/Vehicle Assignment",
      CONFIRMED: "Confirmed",
      IN_PROGRESS: "In Progress",
      COMPLETED: "Completed",
      CANCELLED: "Cancelled",
    };

    res.json({
      success: true,
      data: {
        id: booking.id,
        bookingRef: booking.bookingRef,
        status: booking.status,
        statusLabel: statusLabels[booking.status] || booking.status,
        // Customer
        guestName: booking.guestName,
        guestPhone: booking.guestPhone,
        guestEmail: booking.guestEmail,
        // Trip
        tripType: booking.tripType,
        city: booking.city,
        route: booking.route,
        hours: booking.hours,
        pickupAddress: booking.pickupAddress,
        dropoffAddress: booking.dropoffAddress,
        tripDate: booking.tripDate,
        tripTime: booking.tripTime,
        // Airport
        flightNumber: booking.flightNumber,
        terminalNo: (booking as any).terminalNo,
        terminalLocation: (booking as any).terminalLocation,
        // Vehicle
        vehicleClass: booking.vehicleClass,
        passengers: booking.passengers,
        // Pricing
        pricing: {
          basePrice: Number(booking.basePrice),
          peakMultiplier: Number(booking.peakMultiplier),
          vatAmount: Number(booking.vatAmount),
          totalPrice: Number(booking.totalPrice),
        },
        // Assignment (visible once assigned)
        vendor: booking.vendor,
        driver: booking.driver,
        vehicle: booking.vehicle,
        notes: booking.notes,
        // Timestamps
        createdAt: booking.createdAt,
        confirmedAt: booking.confirmedAt,
        completedAt: booking.completedAt,
      },
    });
  },
);

// ============== CANCEL BOOKING ==============

/**
 * Partner can cancel a booking while it's still in the "awaiting
 * assignment" phase: before admin offers it to a vendor (PENDING) or
 * while admin has offered/re-offered it to a vendor that hasn't yet
 * accepted (ASSIGNMENT_OFFERED, ASSIGNMENT_RE_OFFERED). Once a vendor
 * confirms (CONFIRMED) the booking is locked from partner-side
 * cancellation and goes through the regular cancellation flow with
 * admin involvement.
 */
export const cancelBooking = asyncWrapper(
  async (req: Request, res: Response) => {
    const partner = await getPartnerForUser(req.user!.id);
    requireOperational(partner.status);
    const { bookingId } = req.params;
    const { reason } = req.body;

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        partnerId: partner.id,
      },
    });

    if (!booking) throw new NotFoundError("Booking");

    // Stale names "AWAITING_VENDOR" and "VENDOR_REJECTED" were used
    // here previously — they were never on the BookingStatus enum, so
    // partners couldn't cancel anything that progressed past PENDING.
    const cancellableStatuses = [
      "PENDING",
      "ASSIGNMENT_OFFERED",
      "ASSIGNMENT_RE_OFFERED",
    ];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestError(
        `Cannot cancel a booking with status "${booking.status}". Only bookings awaiting driver/vehicle assignment can be cancelled by the partner.`,
      );
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        // The note ends up on the booking row which is visible to the
        // vendor through their booking detail. We deliberately use
        // "client" (neutral — could be a direct guest or a partner)
        // instead of "partner" so the cancellation message doesn't
        // leak the existence of the partner channel to the vendor.
        // Admin still sees the full partner attribution through the
        // admin-side notification fired below.
        notes: reason
          ? `${booking.notes ? booking.notes + " | " : ""}Cancelled by client: ${reason}`
          : booking.notes,
      },
    });

    // Notify admin
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });

    if (adminUsers.length > 0) {
      await prisma.notification.createMany({
        data: adminUsers.map((admin) => ({
          userId: admin.id,
          title: "Booking Cancelled by Partner",
          message: `${partner.companyName} cancelled booking ${booking.bookingRef}${reason ? ` — Reason: ${reason}` : ""}`,
          type: "PARTNER_BOOKING_CANCELLED",
          data: { bookingId, bookingRef: booking.bookingRef },
        })),
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PARTNER_BOOKING_CANCELLED",
        entity: "Booking",
        entityId: bookingId,
        changes: { bookingRef: booking.bookingRef, reason },
      },
    });

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      data: {
        id: updated.id,
        bookingRef: updated.bookingRef,
        status: updated.status,
      },
    });
  },
);
