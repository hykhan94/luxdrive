// ============================================
// apps/server/src/route/invitation.route.ts
// Public invitation acceptance endpoints (no auth middleware).
// ============================================

import { Router } from "express";
import {
  getInvitation,
  acceptInvitation,
} from "../../controller/auth/invitation.controller";

const router = Router();

// GET /api/v1/invitation/:type/:token
// Returns the invitation context (company name, email) so the welcome
// page can render personalized copy. Public — anyone with the token
// can read this. Token is 64-char hex (32 random bytes) so brute-force
// is infeasible.
router.get("/:type/:token", getInvitation);

// POST /api/v1/invitation/:type/:token/accept
// Sets the recipient's password and transitions them to ONBOARDING.
// Returns session cookies so the frontend can redirect into the portal
// without a manual sign-in step.
router.post("/:type/:token/accept", acceptInvitation);

export default router;
