import { Router } from "express";
import { rateLimit } from "../../../middleware/rateLimit.ts";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { CreatePaymentIntentSchema, PaymentStatusParamsSchema } from "./schema.ts";

const router = Router();

router.post("/webhook", controller.webhook);
router.post("/intent", requireAuth, validate(CreatePaymentIntentSchema), controller.createIntent);

// Rate limited because the browser polls it on the return page, and because it
// makes an outbound vendor call per request -- so without a limit a customer
// holding the key down is a bill.
router.get(
  "/status/:groupId",
  requireAuth,
  rateLimit,
  validate(PaymentStatusParamsSchema, "params"),
  controller.status,
);

export default router;
