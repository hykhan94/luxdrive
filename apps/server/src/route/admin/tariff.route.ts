// ============================================
// apps/server/src/route/admin/tariff.route.ts
// ============================================

import { Router } from "express";
import {
  getTariffOverview,
  getCityTariffs,
  addRoute,
  updatePrice,
  updateRoutePrices,
  deleteRoute,
  bulkUpdatePrices,
  getEcoFleetTariffs,
  toggleEcoFleet,
  updateEcoFleetPrice,
  getChangeHistory,
} from "../../controller/admin/tariff.controller";

const router = Router();

// Overview & Cities
router.get("/", getTariffOverview);
router.get("/history", getChangeHistory);
router.get("/:city", getCityTariffs);

// Routes management
router.post("/routes", addRoute);
router.patch("/routes/:id/price", updatePrice);
router.patch("/routes/:id/prices", updateRoutePrices);
router.delete("/routes/:id", deleteRoute);

// Bulk update
router.post("/bulk-update", bulkUpdatePrices);

// Eco Fleet (Electric)
router.get("/eco-fleet", getEcoFleetTariffs);
router.patch("/eco-fleet/toggle", toggleEcoFleet);
router.patch("/eco-fleet/:id/price", updateEcoFleetPrice);

export default router;
