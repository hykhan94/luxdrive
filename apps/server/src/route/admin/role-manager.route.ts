// ============================================
// apps/server/src/route/admin/role-manager.route.ts
// ============================================

import { Router } from "express";
import {
  // Dashboard
  getRoleManagerDashboard,
  // Team Layout
  getTeamLayout,
  // Team Member Management
  addToTeam,
  transferTeamMember,
  promoteTeamMember,
  demoteTeamMember,
  removeFromTeam,
  // All Users List
  getAllUsersForRoleManager,
  // Audit Log
  getAuditLogSummary,
  getAuditLogs,
  getAuditLogDetail,
} from "../../controller/admin/role-manager.controller";

const router = Router();

// ============== DASHBOARD ==============
router.get("/dashboard", getRoleManagerDashboard);

// ============== TEAM LAYOUT ==============
router.get("/teams/:team", getTeamLayout); // :team = "sales" or "operations"

// ============== TEAM MEMBER MANAGEMENT ==============
router.post("/teams/add", addToTeam);
router.patch("/members/:id/transfer", transferTeamMember);
router.patch("/members/:id/promote", promoteTeamMember);
router.patch("/members/:id/demote", demoteTeamMember);
router.patch("/members/:id/remove", removeFromTeam);

// ============== ALL USERS LIST ==============
router.get("/users", getAllUsersForRoleManager);

// ============== AUDIT LOG ==============
router.get("/audit-logs/summary", getAuditLogSummary);
router.get("/audit-logs", getAuditLogs);
router.get("/audit-logs/:id", getAuditLogDetail);

export default router;
