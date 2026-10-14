import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { AddSpecialSchema, UpsertPricingSchema } from "./schema.ts";

const router = Router();

router.use(requireMerchantAuth);

router.get("/vehicles/:vehicleId/pricing", requirePermission("pricing:read"), controller.get);
router.put(
  "/vehicles/:vehicleId/pricing",
  requirePermission("pricing:write"),
  validate(UpsertPricingSchema),
  controller.upsert,
);
router.get(
  "/vehicles/:vehicleId/pricing/specials",
  requirePermission("pricing:read"),
  controller.listSpecials,
);
router.post(
  "/vehicles/:vehicleId/pricing/specials",
  requirePermission("pricing:write"),
  validate(AddSpecialSchema),
  controller.addSpecial,
);
router.delete(
  "/vehicles/:vehicleId/pricing/specials/:specialId",
  requirePermission("pricing:write"),
  controller.removeSpecial,
);

export default router;
