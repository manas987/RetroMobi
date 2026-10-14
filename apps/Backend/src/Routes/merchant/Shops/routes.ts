import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { CreateShopSchema, SetShopHoursSchema, UpdateShopSchema } from "./schema.ts";

const router = Router();

router.use(requireMerchantAuth);

router.get("/", controller.list);
router.post("/", validate(CreateShopSchema), controller.create);
router.get("/:shopId", requirePermission("fleet:read"), controller.get);
router.patch("/:shopId", requirePermission("shop:write"), validate(UpdateShopSchema), controller.update);
router.delete("/:shopId", requirePermission("shop:delete"), controller.remove);
router.post("/:shopId/verification", requirePermission("shop:write"), controller.submitVerification);
router.put(
  "/:shopId/hours",
  requirePermission("shop:write"),
  validate(SetShopHoursSchema),
  controller.setHours,
);

export default router;
