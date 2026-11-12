import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { SummaryQuerySchema } from "./schema.ts";

const router = Router();

router.use(requireMerchantAuth);

// Counts are visible to anyone who can see bookings; the money fields are
// added only for roles holding payouts:read (decided in the controller).
router.get(
  "/shops/:shopId/summary",
  requirePermission("bookings:read"),
  validate(SummaryQuerySchema, "query"),
  controller.summary,
);

export default router;
