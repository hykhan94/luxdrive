import { Router } from "express";
import {
  getSignedUploadUrl,
  getSignedReadUrl,
} from "../../controller/upload.controller";

const router = Router();

router.post("/signed-url", getSignedUploadUrl);
router.post("/read-url", getSignedReadUrl);

export default router;
