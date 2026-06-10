import { Router } from "express";
import {
  getPendingChangeRequests,
  approveChangeRequest,
  rejectChangeRequest,
} from "../../controller/admin/partner-change-request-controller";

const router = Router();

router.get("/", getPendingChangeRequests);
router.patch("/:id/approve", approveChangeRequest);
router.patch("/:id/reject", rejectChangeRequest);

export default router;
