import { Router } from "express";
import {
  getPendingVendorProfileChangeRequests,
  approveVendorProfileChangeRequest,
  rejectVendorProfileChangeRequest,
} from "../../controller/admin/vendor-profile-change-request.controller";

const router = Router();

router.get("/", getPendingVendorProfileChangeRequests);
router.patch("/:id/approve", approveVendorProfileChangeRequest);
router.patch("/:id/reject", rejectVendorProfileChangeRequest);

export default router;
