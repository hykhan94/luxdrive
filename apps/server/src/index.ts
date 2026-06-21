// ============================================
// !!! DESTINATION PATH: apps/server/src/index.ts
// ============================================
import express, { Request, Response } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFound";
import { logger } from "./utils/logger";
import { auth } from "./lib/auth";
import authRoutes from "./route/auth";
import adminRoutes from "./route/admin";
import partnerRoutes from "./route/partner";
import vendorRoutes from "./route/vendor";
import { isAdmin, isAuthenticated } from "./middleware/auth";
import uploadRoutes from "./route/upload/index";
import imagesRoutes from "./route/images.route";
import publicRoutes from "./route/public/index";
import "./lib/cron";

const app = express();

// Middleware
app.use(
  cors({
    origin: config.cors.origins,
    credentials: true,
  }),
);

// Better Auth — MUST run BEFORE `express.json()`. Better Auth's
// toNodeHandler reads the raw request stream itself; if express.json()
// runs first it consumes the readable stream, the handler can't
// reconstruct the body, and routes like /api/auth/forget-password
// silently 404 even though sign-in (which it apparently special-cases)
// keeps working. Documented at
// https://www.better-auth.com/docs/integrations/express.
//
// We mount JUST the Better Auth handler here, not the whole auth
// router aggregator — the aggregator also exposes our custom
// invitation acceptance endpoint at /api/v1/invitation/* which does
// use express.json() to read its body. Mounting that endpoint before
// the body parser would break it. So we keep them separate: raw
// handler here, aggregator (which still includes Better Auth again
// via the wildcard but matches no-op for already-handled paths) goes
// after the parser.
//
// Temporary diagnostic log: prints every request that reaches this
// handler. If you hit /api/auth/forget-password and DON'T see a line
// in the server console starting with `[better-auth]`, the request
// isn't reaching the new handler at all — most commonly because the
// server is running stale code (the dev script `ts-node src/index.ts`
// does NOT watch for changes; manual restart required after every
// edit to index.ts). Remove this log block once forget-password is
// confirmed working.
app.all("/api/auth/*", toNodeHandler(auth));

// JSON body parser — runs AFTER the Better Auth route handler. Every
// route declared below this line can safely read req.body as parsed
// JSON. (Better Auth itself doesn't reach this line; Express short-
// circuits once toNodeHandler responds.)
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Custom auth-adjacent routes (invitation acceptance flow) — these
// need express.json() and are mounted via the auth router aggregator.
// Better Auth's wildcard inside that aggregator will be a no-op for
// /api/auth/* paths since they were already handled above.
app.use(authRoutes);

// Test protected route - any authenticated user
app.get("/api/v1/me", isAuthenticated, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: req.user,
  });
});

// Admin Routes
app.use("/api/v1/admin", adminRoutes);

// Add partner portal routes:
app.use("/api/v1/partner", partnerRoutes);

// Vendor portal routes:
app.use("/api/v1/vendor", vendorRoutes);

// Shared upload routes (used by all portals)
app.use("/api/v1/upload", isAuthenticated, uploadRoutes);

// Image resize proxy — serves on-demand thumbnails of stored GCS
// objects. Reduces bandwidth massively for list views that display
// small avatars and card photos.
app.use("/api/v1/images", imagesRoutes);

// Public routes — no auth, deliberately separated so the no-auth
// surface area is obvious. Currently exposes only the customer
// trip card endpoint at /api/v1/public/trip/:token, which backs
// the WhatsApp-shared link customers receive after booking.
app.use("/api/v1/public", publicRoutes);

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler (must be last)
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  logger.info(`🚀 Server running on http://localhost:${config.port}`);
  logger.info(`📍 Environment: ${config.nodeEnv}`);
});
