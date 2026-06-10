import { Router } from "express";
import {
  getPendingDriverChangeRequests,
  approveDriverChangeRequest,
  rejectDriverChangeRequest,
} from "../../controller/admin/driver-change-request.controller";

const router = Router();

router.get("/", getPendingDriverChangeRequests);
router.patch("/:id/approve", approveDriverChangeRequest);
router.patch("/:id/reject", rejectDriverChangeRequest);

export default router;
