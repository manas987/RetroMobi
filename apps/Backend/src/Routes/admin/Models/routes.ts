import { Router } from "express";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  ConfirmUploadSchema,
  CreateModelSchema,
  ListModelsQuerySchema,
  UpdateModelSchema,
  UploadRequestSchema,
} from "./schema.ts";

const router = Router();

router.use(requireAdminAuth, requireAdminRole("ADMIN", "SUPER_ADMIN"));

router.get("/", validate(ListModelsQuerySchema, "query"), controller.list);
router.post("/", validate(CreateModelSchema), controller.create);
router.patch("/:modelId", validate(UpdateModelSchema), controller.update);
router.delete("/:modelId", controller.deactivate);
router.post("/:modelId/image/upload", validate(UploadRequestSchema), controller.upload);
router.post("/:modelId/image/confirm", validate(ConfirmUploadSchema), controller.confirm);

export default router;
