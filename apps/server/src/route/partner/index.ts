// ============================================
// apps/server/src/route/partner/index.ts
// Combines all partner portal routes
// ============================================

import { Router } from "express";
import { isPartner } from "../../middleware/auth";
import dashboardRoutes from "./dashboard.route";
import bookRideRoutes from "./book-ride.route";
import bookingsRoutes from "./bookings.route";
import tariffRoutes from "./tariff.route";
import invoiceRoutes from "./invoice.route";
import profileRoutes from "./profile.route";
import analyticsRoutes from "./analytics.route";
import notificationRoutes from "./notification.route";
import { getSidebarBadges } from "../../controller/partner/sidebar.controller";
import {
  getChangeRequests,
  requestProfileChanges,
} from "../../controller/partner/profile.controller";

const router = Router();

// All partner routes require PARTNER role
router.use(isPartner);

// ============== DASHBOARD ==============
router.use("/dashboard", dashboardRoutes);

// ============== BOOKINGS (Book a Ride) ==============
router.use("/book-ride", bookRideRoutes);

// ============== BOOKINGS (list, detail, export, PO) ==============
router.use("/bookings", bookingsRoutes);

// ============== TARIFFS (read-only view of admin-defined rates) ==============
router.use("/tariffs", tariffRoutes);

// ============== INVOICES (monthly + custom) ==============
router.use("/invoices", invoiceRoutes);

// ============== COMPANY PROFILE & TEAM ==============
router.use("/profile", profileRoutes);

// ============== REPORTS & ANALYTICS ==============
router.use("/analytics", analyticsRoutes);

// ============== NOTIFICATIONS ==============
router.use("/notifications", notificationRoutes);

// ============== SIDE_BAR NOTIFICATIONS NUMBER ==============
router.get("/sidebar-badges", getSidebarBadges);

// ============== PROFILE CHANGES ==============
router.post("/profile/change-request", requestProfileChanges);
router.get("/profile/change-requests", getChangeRequests);

export default router;
