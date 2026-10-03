import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  CreateRiderSchema,
  DigilockerCallbackSchema,
  DigilockerInitSchema,
  ManualLicenceSchema,
  UpdateRiderSchema,
} from "./schema.ts";

const router = Router();

router.use(requireAuth);
router.get("/", controller.list);
router.post("/", validate(CreateRiderSchema), controller.create);
router.patch("/:id", validate(UpdateRiderSchema), controller.update);
router.delete("/:id", controller.remove);
router.post("/:id/licence/digilocker/init", validate(DigilockerInitSchema), controller.digilockerInit);
router.post(
  "/:id/licence/digilocker/callback",
  validate(DigilockerCallbackSchema),
  controller.digilockerCallback,
);
router.post("/:id/licence/manual", validate(ManualLicenceSchema), controller.manualLicence);

export default router;
