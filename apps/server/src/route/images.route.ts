// ============================================
// src/route/images.route.ts
// Image resize proxy routes.
// ============================================

import { Router } from "express";
import { isAuthenticated } from "../middleware/auth";
import { resizeImage } from "../controller/images.controller";

const router = Router();

// All image routes require auth — same trust level as the signed-URL
// system that serves originals.
router.use(isAuthenticated);

// GET /api/v1/images/resize?path=<gcs-path>&w=<width>
router.get("/resize", resizeImage);

export default router;
