// ============================================
// apps/server/src/controller/vendor/vehicle-catalog.controller.ts
// Vendor Portal — Vehicle Make/Model Catalog
//
// Serves a curated catalog of makes, models, and year ranges
// for the fleet registration form. Supports filtering by
// vehicle class so the frontend can show only relevant options.
// ============================================

import { Request, Response } from "express";
import { asyncWrapper } from "../../utils/asyncWrapper";
import catalogData from "../../data/vehicle-catalog.json";

interface CatalogModel {
  model: string;
  classes: string[];
  minYear: number;
  maxYear: number;
  defaultSeats: number;
}

interface CatalogMake {
  make: string;
  models: CatalogModel[];
}

// ============== GET VEHICLE CATALOG ==============

/**
 * GET /api/v1/vendor/fleet/catalog
 *
 * Query: ?category=BUSINESS_SEDAN (optional — filters makes/models to only
 *        those available in the requested vehicle class)
 *
 * Returns the full or filtered catalog for cascading dropdowns:
 *   Make → Model → Year range
 *
 * Each model entry includes:
 *   - model name
 *   - allowed vehicle classes
 *   - min/max year
 *   - default seat count
 */
export const getVehicleCatalog = asyncWrapper(
  async (req: Request, res: Response) => {
    const { category } = req.query;

    let makes: CatalogMake[] = catalogData.makes;

    if (category && typeof category === "string") {
      // Filter to only makes that have at least one model in this class
      makes = makes
        .map((m) => ({
          make: m.make,
          models: m.models.filter((mod) => mod.classes.includes(category)),
        }))
        .filter((m) => m.models.length > 0);
    }

    res.json({
      success: true,
      data: {
        makes,
        totalMakes: makes.length,
        totalModels: makes.reduce((sum, m) => sum + m.models.length, 0),
      },
    });
  },
);
