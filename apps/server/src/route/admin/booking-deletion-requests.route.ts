// ============================================
// !!! DESTINATION PATH: apps/server/src/route/admin/booking-deletion-requests.route.ts
// ============================================
// Admin Portal — partner booking-deletion request review.

import { Router } from "express";
import {
  listDeletionRequests,
  approveDeletion,
  rejectDeletion,
} from "../../controller/admin/booking-deletion.controller";

const router = Router();

// Queue (default: PENDING) — ?status=APPROVED|REJECTED
router.get("/", listDeletionRequests);

// Approve performs the soft delete; reject records an admin note.
router.patch("/:id/approve", approveDeletion);
router.patch("/:id/reject", rejectDeletion);

export default router;
