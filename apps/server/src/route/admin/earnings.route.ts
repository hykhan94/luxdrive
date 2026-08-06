// ============================================
// apps/server/src/route/admin/earnings.route.ts
// ============================================

import { Router } from "express";
import { getEarnings } from "../../controller/admin/earnings.controller";

const router = Router();

router.get("/", getEarnings);

export default router;
