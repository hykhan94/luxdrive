// ============================================
// apps/server/src/route/contact/index.ts
// Combines all public contact-related routes.
// ============================================
//
// Currently exposes a single POST /api/v1/contact endpoint for the
// public contact form. As the contact domain grows (e.g. inquiry
// status check, support ticket lookup), add the new sub-routes here
// and they're picked up automatically by the mount in src/index.ts.

import { Router } from "express";

import contactRoutes from "./contact.route";

const router = Router();

// Mounted at root — the parent mount in src/index.ts is responsible
// for the /api/v1/contact prefix, so the sub-route only defines "/".
router.use(contactRoutes);

export default router;
