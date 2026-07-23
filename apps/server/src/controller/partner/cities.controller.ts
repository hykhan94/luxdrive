// ============================================
// apps/server/src/controller/partner/cities.controller.ts
//
// Read-only cities feed for the partner Book Ride form.
// Only active cities are returned. The per-city electric /
// ultra-luxury flags ship through so the vehicle-class selector
// on the partner form can filter classes appropriately.
// ============================================

import { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncWrapper } from "../../utils/asyncWrapper";

/**
 * GET /api/v1/partner/cities
 * Returns only active cities, ordered as admin arranged them.
 */
export const listPartnerCities = asyncWrapper(
  async (_req: Request, res: Response) => {
    const cities = await prisma.city.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        region: true,
        electricEnabled: true,
        ultraLuxuryEnabled: true,
      },
    });
    res.json({ success: true, data: cities });
  },
);
