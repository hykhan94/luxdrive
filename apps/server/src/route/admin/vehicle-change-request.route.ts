import { Router } from "express";
import {
  getPendingVehicleChangeRequests,
  approveVehicleChangeRequest,
  rejectVehicleChangeRequest,
} from "../../controller/admin/vehicle-change-request.controller";

const router = Router();

router.get("/", getPendingVehicleChangeRequests);
router.patch("/:id/approve", approveVehicleChangeRequest);
router.patch("/:id/reject", rejectVehicleChangeRequest);

export default router;
