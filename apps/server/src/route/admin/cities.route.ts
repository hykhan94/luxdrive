// ============================================
// apps/server/src/route/admin/cities.route.ts
// ============================================

import { Router } from "express";
import {
  listCities,
  createCity,
  updateCity,
  toggleCityFlag,
  deleteCity,
} from "../../controller/admin/cities.controller";

const router = Router();

router.get("/", listCities);
router.post("/", createCity);
router.patch("/:id", updateCity);
router.patch("/:id/toggle", toggleCityFlag);
router.delete("/:id", deleteCity);

export default router;
