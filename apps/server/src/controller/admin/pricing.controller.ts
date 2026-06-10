// ============================================
// apps/server/src/controller/admin/pricing.controller.ts
// UPDATED: Audit logging on all pricing mutations
//          + GET /pricing/audit-logs endpoint
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";
import { BadRequestError } from "../../utils/AppError";
import {
  calculatePrice,
  calculateDistancePrice,
  formatVehicleClassDisplay,
  DEFAULT_PRICING,
} from "../../utils/helpers/pricing.helpers";

// ============== HELPER: Create pricing audit log ==============
async function logPricingChange(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  changes: any,
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      changes,
    },
  });
}

/**
 * Get all pricing configuration
 */
export const getPricingConfig = asyncWrapper(
  async (req: Request, res: Response) => {
    const [distancePricing, peakConfig, additionalServices, marginConfig] =
      await Promise.all([
        prisma.distancePricing.findMany({
          where: { isActive: true },
          orderBy: { vehicleClass: "asc" },
        }),
        prisma.peakPricingConfig.findFirst(),
        prisma.additionalServicePricing.findMany({
          where: { isActive: true },
          orderBy: { serviceType: "asc" },
        }),
        prisma.marginConfig.findFirst({ where: { isActive: true } }),
      ]);

    let peakPricing = peakConfig;
    if (
      peakConfig?.isEnabled &&
      peakConfig.expiresAt &&
      new Date() > peakConfig.expiresAt
    ) {
      peakPricing = await prisma.peakPricingConfig.update({
        where: { id: peakConfig.id },
        data: { isEnabled: false },
      });
    }

    const formattedDistancePricing = distancePricing.map((dp) => {
      const display = formatVehicleClassDisplay(dp.vehicleClass);
      return {
        id: dp.id,
        vehicleClass: dp.vehicleClass,
        vehicleName: display.name,
        vehicleDescription: display.description,
        tier1Base: dp.tier1Base,
        tier2Base: dp.tier2Base,
        tier3PerKm: dp.tier3PerKm,
        tier4PerKm: dp.tier4PerKm,
      };
    });

    res.json({
      success: true,
      data: {
        distancePricing: formattedDistancePricing,
        peakPricing: {
          isEnabled: peakPricing?.isEnabled || false,
          multiplier: peakPricing?.multiplier || 1.0,
          enabledAt: peakPricing?.enabledAt,
          expiresAt: peakPricing?.expiresAt,
          hoursRemaining: peakPricing?.expiresAt
            ? Math.max(
                0,
                Math.floor(
                  (new Date(peakPricing.expiresAt).getTime() - Date.now()) /
                    (1000 * 60 * 60),
                ),
              )
            : 0,
        },
        additionalServices: additionalServices.map((service) => ({
          id: service.id,
          serviceType: service.serviceType,
          serviceName: service.serviceName,
          price: service.price,
          unit: service.unit,
          unitDisplay: service.unit === "per_15_min" ? "per 15 min" : null,
        })),
        margin: {
          marginPercent: marginConfig?.marginPercent || 20,
          vatPercent: marginConfig?.vatPercent || 15,
        },
      },
    });
  },
);

/**
 * Update distance pricing for all vehicle types
 */
export const updateDistancePricing = asyncWrapper(
  async (req: Request, res: Response) => {
    const { pricing } = req.body;

    if (!pricing || !Array.isArray(pricing)) {
      throw new BadRequestError("pricing array is required");
    }

    const updates = await Promise.all(
      pricing.map(async (item: any) => {
        const { vehicleClass, tier1Base, tier2Base, tier3PerKm, tier4PerKm } =
          item;

        if (!vehicleClass) {
          throw new BadRequestError(
            "vehicleClass is required for each pricing item",
          );
        }

        // Get old values for audit
        const existing = await prisma.distancePricing.findUnique({
          where: { vehicleClass },
        });

        const result = await prisma.distancePricing.upsert({
          where: { vehicleClass },
          update: {
            tier1Base: tier1Base || 0,
            tier2Base: tier2Base || 0,
            tier3PerKm: tier3PerKm || 0,
            tier4PerKm: tier4PerKm || 0,
            updatedAt: new Date(),
          },
          create: {
            vehicleClass,
            tier1Base: tier1Base || 0,
            tier2Base: tier2Base || 0,
            tier3PerKm: tier3PerKm || 0,
            tier4PerKm: tier4PerKm || 0,
          },
        });

        // Audit log
        await logPricingChange(
          req.user!.id,
          "DISTANCE_PRICING_UPDATED",
          "DistancePricing",
          result.id,
          {
            vehicleClass,
            previousValues: existing
              ? {
                  tier1Base: existing.tier1Base,
                  tier2Base: existing.tier2Base,
                  tier3PerKm: existing.tier3PerKm,
                  tier4PerKm: existing.tier4PerKm,
                }
              : null,
            newValues: { tier1Base, tier2Base, tier3PerKm, tier4PerKm },
          },
        );

        return result;
      }),
    );

    res.json({
      success: true,
      message: "Distance pricing updated successfully",
      data: updates,
    });
  },
);

/**
 * Toggle peak pricing on/off with multiplier
 */
export const updatePeakPricing = asyncWrapper(
  async (req: Request, res: Response) => {
    const { isEnabled, multiplier } = req.body;

    if (typeof isEnabled !== "boolean") {
      throw new BadRequestError("isEnabled boolean is required");
    }

    if (isEnabled && (!multiplier || multiplier < 1 || multiplier > 3)) {
      throw new BadRequestError("multiplier must be between 1.0 and 3.0");
    }

    let peakConfig = await prisma.peakPricingConfig.findFirst();
    const previousValues = peakConfig
      ? {
          isEnabled: peakConfig.isEnabled,
          multiplier: peakConfig.multiplier,
        }
      : null;

    const now = new Date();
    const expiresAt = isEnabled
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
      : null;

    if (peakConfig) {
      peakConfig = await prisma.peakPricingConfig.update({
        where: { id: peakConfig.id },
        data: {
          isEnabled,
          multiplier: isEnabled ? multiplier : 1.0,
          enabledAt: isEnabled ? now : null,
          expiresAt,
        },
      });
    } else {
      peakConfig = await prisma.peakPricingConfig.create({
        data: {
          isEnabled,
          multiplier: isEnabled ? multiplier : 1.0,
          enabledAt: isEnabled ? now : null,
          expiresAt,
        },
      });
    }

    // Audit log
    await logPricingChange(
      req.user!.id,
      isEnabled ? "PEAK_PRICING_ENABLED" : "PEAK_PRICING_DISABLED",
      "PeakPricingConfig",
      peakConfig.id,
      {
        previousValues,
        newValues: {
          isEnabled,
          multiplier: isEnabled ? multiplier : 1.0,
        },
      },
    );

    res.json({
      success: true,
      message: isEnabled
        ? `Peak pricing enabled at ${multiplier}x for 24 hours`
        : "Peak pricing disabled",
      data: {
        isEnabled: peakConfig.isEnabled,
        multiplier: peakConfig.multiplier,
        enabledAt: peakConfig.enabledAt,
        expiresAt: peakConfig.expiresAt,
      },
    });
  },
);

/**
 * Update additional services pricing
 */
export const updateAdditionalServices = asyncWrapper(
  async (req: Request, res: Response) => {
    const { services } = req.body;

    if (!services || !Array.isArray(services)) {
      throw new BadRequestError("services array is required");
    }

    const updates = await Promise.all(
      services.map(async (item: any) => {
        const { serviceType, serviceName, price, unit } = item;

        if (!serviceType) {
          throw new BadRequestError("serviceType is required for each service");
        }

        // Get old values
        const existing = await prisma.additionalServicePricing.findUnique({
          where: { serviceType },
        });

        const result = await prisma.additionalServicePricing.upsert({
          where: { serviceType },
          update: {
            serviceName: serviceName || serviceType,
            price: price || 0,
            unit: unit || null,
            updatedAt: new Date(),
          },
          create: {
            serviceType,
            serviceName: serviceName || serviceType,
            price: price || 0,
            unit: unit || null,
          },
        });

        // Audit log
        await logPricingChange(
          req.user!.id,
          "SERVICE_PRICING_UPDATED",
          "AdditionalServicePricing",
          result.id,
          {
            serviceType,
            serviceName: serviceName || serviceType,
            previousPrice: existing ? existing.price : null,
            newPrice: price || 0,
          },
        );

        return result;
      }),
    );

    res.json({
      success: true,
      message: "Additional services pricing updated",
      data: updates,
    });
  },
);

/**
 * Update margin and VAT configuration
 */
export const updateMarginConfig = asyncWrapper(
  async (req: Request, res: Response) => {
    const { marginPercent, vatPercent } = req.body;

    if (marginPercent === undefined || vatPercent === undefined) {
      throw new BadRequestError("marginPercent and vatPercent are required");
    }

    if (marginPercent < 0 || marginPercent > 100) {
      throw new BadRequestError("marginPercent must be between 0 and 100");
    }

    if (vatPercent < 0 || vatPercent > 100) {
      throw new BadRequestError("vatPercent must be between 0 and 100");
    }

    let marginConfig = await prisma.marginConfig.findFirst({
      where: { isActive: true },
    });

    const previousValues = marginConfig
      ? {
          marginPercent: marginConfig.marginPercent,
          vatPercent: marginConfig.vatPercent,
        }
      : null;

    if (marginConfig) {
      marginConfig = await prisma.marginConfig.update({
        where: { id: marginConfig.id },
        data: { marginPercent, vatPercent },
      });
    } else {
      marginConfig = await prisma.marginConfig.create({
        data: { marginPercent, vatPercent },
      });
    }

    // Audit log
    await logPricingChange(
      req.user!.id,
      "MARGIN_CONFIG_UPDATED",
      "MarginConfig",
      marginConfig.id,
      {
        previousValues,
        newValues: { marginPercent, vatPercent },
      },
    );

    res.json({
      success: true,
      message: "Margin configuration updated",
      data: {
        marginPercent: marginConfig.marginPercent,
        vatPercent: marginConfig.vatPercent,
      },
    });
  },
);

/**
 * Save all pricing at once (from "Save Pricing" button)
 */
export const saveAllPricing = asyncWrapper(
  async (req: Request, res: Response) => {
    const { distancePricing, peakPricing, additionalServices, margin } =
      req.body;

    const results: any = {};
    const adminId = req.user!.id;

    // Update distance pricing
    if (distancePricing && Array.isArray(distancePricing)) {
      results.distancePricing = await Promise.all(
        distancePricing.map(async (item: any) => {
          const existing = await prisma.distancePricing.findUnique({
            where: { vehicleClass: item.vehicleClass },
          });

          const result = await prisma.distancePricing.upsert({
            where: { vehicleClass: item.vehicleClass },
            update: {
              tier1Base: item.tier1Base,
              tier2Base: item.tier2Base,
              tier3PerKm: item.tier3PerKm,
              tier4PerKm: item.tier4PerKm,
            },
            create: {
              vehicleClass: item.vehicleClass,
              tier1Base: item.tier1Base,
              tier2Base: item.tier2Base,
              tier3PerKm: item.tier3PerKm,
              tier4PerKm: item.tier4PerKm,
            },
          });

          // Only log if values actually changed
          const changed =
            !existing ||
            Number(existing.tier1Base) !== Number(item.tier1Base) ||
            Number(existing.tier2Base) !== Number(item.tier2Base) ||
            Number(existing.tier3PerKm) !== Number(item.tier3PerKm) ||
            Number(existing.tier4PerKm) !== Number(item.tier4PerKm);

          if (changed) {
            await logPricingChange(
              adminId,
              "DISTANCE_PRICING_UPDATED",
              "DistancePricing",
              result.id,
              {
                vehicleClass: item.vehicleClass,
                previousValues: existing
                  ? {
                      tier1Base: existing.tier1Base,
                      tier2Base: existing.tier2Base,
                      tier3PerKm: existing.tier3PerKm,
                      tier4PerKm: existing.tier4PerKm,
                    }
                  : null,
                newValues: {
                  tier1Base: item.tier1Base,
                  tier2Base: item.tier2Base,
                  tier3PerKm: item.tier3PerKm,
                  tier4PerKm: item.tier4PerKm,
                },
              },
            );
          }

          return result;
        }),
      );
    }

    // Update peak pricing
    if (peakPricing) {
      const existing = await prisma.peakPricingConfig.findFirst();
      const now = new Date();
      const expiresAt = peakPricing.isEnabled
        ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
        : null;

      const peakChanged =
        !existing ||
        existing.isEnabled !== peakPricing.isEnabled ||
        Number(existing.multiplier) !== Number(peakPricing.multiplier);

      if (existing) {
        results.peakPricing = await prisma.peakPricingConfig.update({
          where: { id: existing.id },
          data: {
            isEnabled: peakPricing.isEnabled,
            multiplier: peakPricing.multiplier || 1.0,
            enabledAt: peakPricing.isEnabled ? now : null,
            expiresAt,
          },
        });
      } else {
        results.peakPricing = await prisma.peakPricingConfig.create({
          data: {
            isEnabled: peakPricing.isEnabled,
            multiplier: peakPricing.multiplier || 1.0,
            enabledAt: peakPricing.isEnabled ? now : null,
            expiresAt,
          },
        });
      }

      if (peakChanged) {
        await logPricingChange(
          adminId,
          peakPricing.isEnabled
            ? "PEAK_PRICING_ENABLED"
            : "PEAK_PRICING_DISABLED",
          "PeakPricingConfig",
          results.peakPricing.id,
          {
            previousValues: existing
              ? {
                  isEnabled: existing.isEnabled,
                  multiplier: existing.multiplier,
                }
              : null,
            newValues: {
              isEnabled: peakPricing.isEnabled,
              multiplier: peakPricing.multiplier || 1.0,
            },
          },
        );
      }
    }

    // Update additional services
    if (additionalServices && Array.isArray(additionalServices)) {
      results.additionalServices = await Promise.all(
        additionalServices.map(async (item: any) => {
          const existing = await prisma.additionalServicePricing.findUnique({
            where: { serviceType: item.serviceType },
          });

          const result = await prisma.additionalServicePricing.upsert({
            where: { serviceType: item.serviceType },
            update: {
              serviceName: item.serviceName,
              price: item.price,
              unit: item.unit,
            },
            create: {
              serviceType: item.serviceType,
              serviceName: item.serviceName,
              price: item.price,
              unit: item.unit,
            },
          });

          const priceChanged =
            !existing || Number(existing.price) !== Number(item.price);

          if (priceChanged) {
            await logPricingChange(
              adminId,
              "SERVICE_PRICING_UPDATED",
              "AdditionalServicePricing",
              result.id,
              {
                serviceType: item.serviceType,
                serviceName: item.serviceName,
                previousPrice: existing ? existing.price : null,
                newPrice: item.price,
              },
            );
          }

          return result;
        }),
      );
    }

    // Update margin
    if (margin) {
      const existingMargin = await prisma.marginConfig.findFirst({
        where: { isActive: true },
      });

      const marginChanged =
        !existingMargin ||
        Number(existingMargin.marginPercent) !== Number(margin.marginPercent) ||
        Number(existingMargin.vatPercent) !== Number(margin.vatPercent);

      if (existingMargin) {
        results.margin = await prisma.marginConfig.update({
          where: { id: existingMargin.id },
          data: {
            marginPercent: margin.marginPercent,
            vatPercent: margin.vatPercent,
          },
        });
      } else {
        results.margin = await prisma.marginConfig.create({
          data: {
            marginPercent: margin.marginPercent,
            vatPercent: margin.vatPercent,
          },
        });
      }

      if (marginChanged) {
        await logPricingChange(
          adminId,
          "MARGIN_CONFIG_UPDATED",
          "MarginConfig",
          results.margin.id,
          {
            previousValues: existingMargin
              ? {
                  marginPercent: existingMargin.marginPercent,
                  vatPercent: existingMargin.vatPercent,
                }
              : null,
            newValues: {
              marginPercent: margin.marginPercent,
              vatPercent: margin.vatPercent,
            },
          },
        );
      }
    }

    res.json({
      success: true,
      message: "All pricing saved successfully",
      data: results,
    });
  },
);

/**
 * Reset all pricing to defaults
 */
export const resetToDefaults = asyncWrapper(
  async (req: Request, res: Response) => {
    // Reset distance pricing
    await Promise.all(
      DEFAULT_PRICING.distancePricing.map((item) =>
        prisma.distancePricing.upsert({
          where: { vehicleClass: item.vehicleClass as any },
          update: {
            tier1Base: item.tier1Base,
            tier2Base: item.tier2Base,
            tier3PerKm: item.tier3PerKm,
            tier4PerKm: item.tier4PerKm,
          },
          create: {
            vehicleClass: item.vehicleClass as any,
            tier1Base: item.tier1Base,
            tier2Base: item.tier2Base,
            tier3PerKm: item.tier3PerKm,
            tier4PerKm: item.tier4PerKm,
          },
        }),
      ),
    );

    const peakConfig = await prisma.peakPricingConfig.findFirst();
    if (peakConfig) {
      await prisma.peakPricingConfig.update({
        where: { id: peakConfig.id },
        data: {
          isEnabled: false,
          multiplier: 1.0,
          enabledAt: null,
          expiresAt: null,
        },
      });
    }

    await Promise.all(
      DEFAULT_PRICING.additionalServices.map((item) =>
        prisma.additionalServicePricing.upsert({
          where: { serviceType: item.serviceType },
          update: {
            serviceName: item.serviceName,
            price: item.price,
            unit: item.unit,
          },
          create: {
            serviceType: item.serviceType,
            serviceName: item.serviceName,
            price: item.price,
            unit: item.unit,
          },
        }),
      ),
    );

    const marginConfig = await prisma.marginConfig.findFirst({
      where: { isActive: true },
    });
    if (marginConfig) {
      await prisma.marginConfig.update({
        where: { id: marginConfig.id },
        data: {
          marginPercent: DEFAULT_PRICING.margin.marginPercent,
          vatPercent: DEFAULT_PRICING.margin.vatPercent,
        },
      });
    } else {
      await prisma.marginConfig.create({
        data: {
          marginPercent: DEFAULT_PRICING.margin.marginPercent,
          vatPercent: DEFAULT_PRICING.margin.vatPercent,
        },
      });
    }

    // Audit log for reset
    await logPricingChange(
      req.user!.id,
      "PRICING_RESET_TO_DEFAULTS",
      "PricingConfig",
      "all",
      { resetBy: req.user!.id },
    );

    res.json({
      success: true,
      message: "All pricing reset to defaults",
    });
  },
);

/**
 * Get pricing audit logs
 * Filters AuditLog for pricing-related entities
 */
export const getPricingAuditLogs = asyncWrapper(
  async (req: Request, res: Response) => {
    const { page = "1", limit = "10" } = req.query;

    const pricingEntities = [
      "DistancePricing",
      "PeakPricingConfig",
      "AdditionalServicePricing",
      "MarginConfig",
      "PricingConfig",
    ];

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          entity: { in: pricingEntities },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.auditLog.count({
        where: {
          entity: { in: pricingEntities },
        },
      }),
    ]);

    // Get admin names
    const adminIds = [
      ...new Set(logs.map((l) => l.userId).filter(Boolean)),
    ] as string[];
    const admins = await prisma.user.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true, email: true },
    });
    const adminMap = new Map(admins.map((a) => [a.id, a.name || a.email]));

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      changes: log.changes,
      performedBy: {
        id: log.userId,
        name: log.userId ? adminMap.get(log.userId) || "Unknown" : "System",
      },
      createdAt: log.createdAt,
    }));

    res.json({
      success: true,
      data: {
        logs: formattedLogs,
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
 * Calculate price preview
 */
export const calculatePricePreview = asyncWrapper(
  async (req: Request, res: Response) => {
    const { distanceKm } = req.query;
    const distance = parseInt(distanceKm as string) || 40;

    const [distancePricing, peakConfig, marginConfig] = await Promise.all([
      prisma.distancePricing.findMany({ where: { isActive: true } }),
      prisma.peakPricingConfig.findFirst(),
      prisma.marginConfig.findFirst({ where: { isActive: true } }),
    ]);

    const isPeakActive =
      peakConfig?.isEnabled &&
      peakConfig.expiresAt &&
      new Date() < peakConfig.expiresAt;

    const marginPercent = Number(marginConfig?.marginPercent) || 20;
    const vatPercent = Number(marginConfig?.vatPercent) || 15;
    const peakMultiplier = isPeakActive ? Number(peakConfig?.multiplier) : 1.0;

    const previews = distancePricing.map((dp) => {
      const display = formatVehicleClassDisplay(dp.vehicleClass);
      const { price: basePrice, tierUsed } = calculateDistancePrice(
        distance,
        Number(dp.tier1Base),
        Number(dp.tier2Base),
        Number(dp.tier3PerKm),
        Number(dp.tier4PerKm),
      );
      const calculation = calculatePrice(
        basePrice,
        marginPercent,
        peakMultiplier,
        vatPercent,
      );

      return {
        vehicleClass: dp.vehicleClass,
        vehicleName: display.name,
        tierUsed,
        base: basePrice,
        margin: calculation.breakdown.marginAmount,
        marginPercent,
        peak: calculation.breakdown.peakAmount,
        peakMultiplier: isPeakActive ? peakMultiplier : null,
        vat: calculation.breakdown.vatAmount,
        vatPercent,
        total: calculation.total,
      };
    });

    res.json({
      success: true,
      data: {
        distanceKm: distance,
        isPeakActive,
        peakMultiplier: isPeakActive ? peakMultiplier : 1.0,
        marginPercent,
        vatPercent,
        previews,
      },
    });
  },
);

/**
 * Get peak pricing preview
 */
export const getPeakPreview = asyncWrapper(
  async (req: Request, res: Response) => {
    const { multiplier } = req.query;
    const peakMultiplier = parseFloat(multiplier as string) || 1.5;

    const distancePricing = await prisma.distancePricing.findMany({
      where: { isActive: true },
    });

    const preview = distancePricing.map((dp) => {
      const display = formatVehicleClassDisplay(dp.vehicleClass);
      const basePrice = Number(dp.tier2Base);
      const peakPrice = Math.round(basePrice * peakMultiplier);

      return {
        vehicleClass: dp.vehicleClass,
        vehicleName: display.name,
        originalPrice: basePrice,
        peakPrice,
      };
    });

    res.json({
      success: true,
      data: { multiplier: peakMultiplier, preview },
    });
  },
);
