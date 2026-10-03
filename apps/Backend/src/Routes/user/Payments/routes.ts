import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { CreatePaymentIntentSchema } from "./schema.ts";

const router = Router();

router.post("/webhook", controller.webhook);
router.post("/intent", requireAuth, validate(CreatePaymentIntentSchema), controller.createIntent);

export default router;
