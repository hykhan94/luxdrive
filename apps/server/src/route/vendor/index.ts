import { Router } from "express";
import { isVendor } from "../../middleware/auth";
import dashboardRoutes from "./dashboard.route";
import notificationRoutes from "./notification.route";
import { getSidebarBadges } from "../../controller/vendor/sidebar.controller";
import bookingsRoutes from "./bookings.route";
import fleetRoutes from "./fleet.route";
import driversRoutes from "./drivers.route";
import earningsRoutes from "./earnings.route";
import profileRoutes from "./profile.route";
import analyticsRoutes from "./analytics.route";

const router = Router();

// All vendor routes require VENDOR role
router.use(isVendor);

// ============== DASHBOARD ==============
router.use("/dashboard", dashboardRoutes);

// ============== NOTIFICATIONS ==============
router.use("/notifications", notificationRoutes);

// ============== SIDEBAR BADGES ==============
router.get("/sidebar-badges", getSidebarBadges);

// ============== BOOKINGS ==============
router.use("/bookings", bookingsRoutes);

// ============== FLEET MANAGEMENT ==============
router.use("/fleet", fleetRoutes);

// ============== DRIVER MANAGEMENT ==============
router.use("/drivers", driversRoutes);

// ============== EARNINGS & PAYOUTS ==============
router.use("/earnings", earningsRoutes);

// ============== COMPANY PROFILE ==============
router.use("/profile", profileRoutes);

// After the profile route
router.use("/analytics", analyticsRoutes);

export default router;
