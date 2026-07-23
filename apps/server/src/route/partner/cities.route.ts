// ============================================
// apps/server/src/route/partner/cities.route.ts
// ============================================

import { Router } from "express";
import { listPartnerCities } from "../../controller/partner/cities.controller";

const router = Router();

router.get("/", listPartnerCities);

export default router;
