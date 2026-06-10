// ============================================
// apps/server/src/route/admin/index.ts
// Combines all admin routes
// ============================================

import { Router } from "express";
import { isAdmin, isStaff } from "../../middleware/auth";

// Import route modules
import bookingRoutes from "./booking.route";
import pricingRoutes from "./pricing.route";
import tariffRoutes from "./tariff.route";
import paymentRoutes from "./payment.route";
import overviewRoutes from "./overview.route";
import alertsSettingsRoutes from "./alerts-settings.route";
import vendorRoutes from "./vendor.route";
import partnerRoutes from "./partner.route";
import userRoutes from "./user.route";
import roleManagerRoutes from "./role-manager.route";
import partnerChangeRequestRoutes from "./partner-change-request.route";
import driverChangeRequestRoutes from "./driver-change-request.route";
import vehicleChangeRequestRoutes from "./vehicle-change-request.route";
import vendorProfileChangeRequestRoutes from "./vendor-profile-change-request.route";

// Import dashboard controllers directly (sidebar badges only)
import { getSidebarBadges } from "../../controller/admin/dashboard.controller";

const router = Router();

// All admin routes require ADMIN role
router.use(isAdmin);

// ============== SIDEBAR BADGES ==============
router.get("/sidebar-badges", getSidebarBadges);

// ============== OVERVIEW / DASHBOARD ==============
router.use("/overview", overviewRoutes);

// ============== BOOKINGS ==============
router.use("/bookings", bookingRoutes);

// ============== PRICING STRATEGY ==============
router.use("/pricing", pricingRoutes);

// ============== TARIFF MANAGEMENT ==============
router.use("/tariffs", tariffRoutes);

// ============== PAYMENTS ==============
router.use("/payments", paymentRoutes);

// ============== VENDORS ==============
router.use("/vendors", vendorRoutes);

// ============== PARTNERS ==============
router.use("/partners", partnerRoutes);

// ============== ALERTS & SETTINGS ==============
router.use("/alerts-settings", alertsSettingsRoutes);

// ============== USERS ==============
router.use("/users", userRoutes);

// ============== ROLE MANAGER ==============
router.use("/role-manager", roleManagerRoutes);

// ============== PARTNER CHANGE REQUEST ==============
router.use("/partner-change-requests", partnerChangeRequestRoutes);

// ============== DRIVER CHANGE REQUEST ==============
router.use("/driver-change-requests", driverChangeRequestRoutes);

// ============== VEHICLE CHANGE REQUEST ==============
router.use("/vehicle-change-requests", vehicleChangeRequestRoutes);
router.use("/vendor-profile-change-requests", vendorProfileChangeRequestRoutes);

export default router;
