import { Router } from "express";
import { z } from "zod";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";

const ActivityQuerySchema = z.object({
  before: z.coerce.date().optional(),
  actorId: z.string().uuid().optional(),
  kind: z.enum(["bookings", "vehicles", "staff", "shop"]).optional(),
});

const router = Router();

router.use(requireMerchantAuth);

router.get(
  "/shops/:shopId/activity",
  requirePermission("members:read"),
  validate(ActivityQuerySchema, "query"),
  controller.list,
);

export default router;
