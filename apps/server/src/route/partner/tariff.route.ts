// ============================================
// apps/server/src/route/partner/tariff.route.ts
// Partner Portal — Tariff Routes (Read-Only)
// ============================================

import { Router } from "express";
import {
  getTariffOverview,
  getCityTariffs,
  getCityRouteTypeTariffs,
} from "../../controller/partner/tariff.controller";

const router = Router();

// ============== OVERVIEW (all cities with route counts) ==============
// GET /api/v1/partner/tariffs
router.get("/", getTariffOverview);

// ============== ALL TARIFFS FOR A CITY ==============
// GET /api/v1/partner/tariffs/RIYADH
// GET /api/v1/partner/tariffs/JEDDAH
router.get("/:city", getCityTariffs);

// ============== SPECIFIC ROUTE TYPE FOR A CITY (lazy load) ==============
// GET /api/v1/partner/tariffs/RIYADH/ONE_WAY
// GET /api/v1/partner/tariffs/RIYADH/HOURLY
// GET /api/v1/partner/tariffs/RIYADH/ELECTRIC
router.get("/:city/:routeType", getCityRouteTypeTariffs);

export default router;
