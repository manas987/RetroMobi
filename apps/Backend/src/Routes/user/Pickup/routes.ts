import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { InspectionConfirmSchema, InspectionUploadSchema } from "./schema.ts";

const router = Router();

router.use(requireAuth);
router.post("/:id/inspection/upload", validate(InspectionUploadSchema), controller.upload);
router.post("/:id/inspection/confirm", validate(InspectionConfirmSchema), controller.confirm);

export default router;
