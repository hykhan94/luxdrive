// ============================================
// apps/server/src/route/auth/index.ts
// Aggregates all authentication-related routes — Better Auth handler
// + custom invitation acceptance endpoints — under one router.
// ============================================

import { Router } from "express";
import authRoutes from "./auth.route";
import invitationRoutes from "./invitation.route";
import { getMyAvatar } from "../../controller/auth/me.controller";
import { isAuthenticated } from "../../middleware/auth";

const router = Router();

// Better Auth catches anything under /api/auth/* — sign-in, sign-up,
// session, forgot-password, reset-password etc. It's already namespaced
// inside auth.route.ts via `router.all("/api/auth/*", toNodeHandler(auth))`
// so we mount it at root.
router.use(authRoutes);

// Custom invitation acceptance flow (vendor/partner onboarding via
// magic link). Public endpoints, no auth middleware.
router.use("/api/v1/invitation", invitationRoutes);

// Role-aware avatar lookup. The navbar polls this once after sign-in
// to fetch the correct image (user.image / vendor.logoUrl /
// partner.logoUrl) already signed by GCS. See me.controller.ts for
// the full rationale.
router.get("/api/v1/me/avatar", isAuthenticated, getMyAvatar);

export default router;
