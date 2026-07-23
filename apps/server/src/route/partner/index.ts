// ============================================
// apps/server/src/route/partner/index.ts
// Combines all partner portal routes
// ============================================

import { Router } from "express";
import { isPartner, isActivePartner } from "../../middleware/auth";
import dashboardRoutes from "./dashboard.route";
import bookRideRoutes from "./book-ride.route";
import bookingsRoutes from "./bookings.route";
import citiesRoutes from "./cities.route";
import invoiceRoutes from "./invoice.route";
import profileRoutes from "./profile.route";
import analyticsRoutes from "./analytics.route";
import notificationRoutes from "./notification.route";
import { getSidebarBadges } from "../../controller/partner/sidebar.controller";
import { getPartnerSuspensionInfo } from "../../controller/partner/suspension.controller";

const router = Router();

// ============== ROUTES ACCESSIBLE TO SUSPENDED PARTNERS ==============
// These are mounted BEFORE the isActivePartner guard because a suspended
// partner needs both endpoints to render the account-suspended screen:
//   1. sidebar-badges returns partnerStatus, which the partner dashboard
//      uses to decide "render the suspended screen instead of any panels."
//      Without this, the frontend would sit in an ambiguous loading state
//      that mounts panels and gets 403s on every child API call — hence
//      the toast-spam bug.
//   2. suspension-info returns the reason + WhatsApp contact rendered on
//      that suspended screen.
router.get("/sidebar-badges", isPartner, getSidebarBadges);
router.get("/suspension-info", isPartner, getPartnerSuspensionInfo);

// ============== EVERYTHING ELSE ==============
// isActivePartner = PARTNER role AND status !== SUSPENDED. A suspended
// partner hitting these gets 403 with PARTNER_SUSPENDED code; frontend
// interceptor routes them to /dashboard which shows the locked screen.
router.use(isActivePartner);

// ============== DASHBOARD ==============
router.use("/dashboard", dashboardRoutes);

// ============== BOOKINGS (Book a Ride) ==============
router.use("/book-ride", bookRideRoutes);

// ============== BOOKINGS (list, detail, export, PO) ==============
router.use("/bookings", bookingsRoutes);

// ============== CITIES (available booking cities + per-city vehicle flags) ==============
router.use("/cities", citiesRoutes);

// ============== INVOICES (monthly + custom) ==============
router.use("/invoices", invoiceRoutes);

// ============== COMPANY PROFILE & TEAM ==============
router.use("/profile", profileRoutes);

// ============== REPORTS & ANALYTICS ==============
router.use("/analytics", analyticsRoutes);

// ============== NOTIFICATIONS ==============
router.use("/notifications", notificationRoutes);

export default router;
