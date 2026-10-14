import { Router } from "express";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { CreateAdminSchema, UpdateAdminSchema } from "./schema.ts";

const router = Router();

router.use(requireAdminAuth, requireAdminRole("SUPER_ADMIN"));

router.get("/", controller.list);
router.post("/", validate(CreateAdminSchema), controller.create);
router.patch("/:adminId", validate(UpdateAdminSchema), controller.update);
router.delete("/:adminId", controller.remove);

export default router;
