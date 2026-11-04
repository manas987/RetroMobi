import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { ListPayoutsQuerySchema, UpsertPayoutAccountSchema } from "./schema.ts";

const router = Router();

// Ahead of requireMerchantAuth: the caller is Cashfree, authenticated by the
// webhook signature rather than a merchant session. Mounted as raw bytes in
// src/index.ts, for the same reason as the gateway's webhook.
router.post("/payouts/webhook", controller.webhook);

router.use(requireMerchantAuth);

// Payout accounts and "my payouts" are merchant-level, not shop-scoped.
router.get("/payout-account", controller.getAccount);
router.put("/payout-account", validate(UpsertPayoutAccountSchema), controller.upsertAccount);
router.get("/payouts", validate(ListPayoutsQuerySchema, "query"), controller.listMine);

router.get(
  "/shops/:shopId/payouts",
  requirePermission("payouts:read"),
  validate(ListPayoutsQuerySchema, "query"),
  controller.listShop,
);

export default router;
