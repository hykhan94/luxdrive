// ============================================
// !!! DESTINATION PATH: apps/server/src/route/public/index.ts
// ============================================
// ============================================
// apps/server/src/route/public/index.ts
// Public, no-auth routes. Currently exposes only the customer trip
// card endpoint; any future public-facing surfaces (driver-arrived
// landing pages, post-trip rating links, etc.) get mounted here.
// Intentionally separated from authenticated route bundles so it's
// obvious which surface area doesn't require login.
// ============================================

import { Router } from "express";
import { getPublicTrip } from "../../controller/public/trip.controller";

const router = Router();

// Customer trip card. The token is the booking's shareToken (a UUID
// generated at booking creation). Path-param-only — no query
// parameters — so the URL is easy to share verbatim over WhatsApp.
router.get("/trip/:token", getPublicTrip);

export default router;
