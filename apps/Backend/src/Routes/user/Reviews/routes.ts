import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { rateLimit } from "../../../middleware/rateLimit.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { CreateReviewSchema, ListShopReviewsQuerySchema, UpdateReviewSchema } from "./schema.ts";

const router = Router();

router.post("/reviews", requireAuth, validate(CreateReviewSchema), controller.create);
router.patch("/reviews/:reviewId", requireAuth, validate(UpdateReviewSchema), controller.update);
router.delete("/reviews/:reviewId", requireAuth, controller.remove);

// The second public route in the system (after search), so it gets the same
// rate limit.
router.get(
  "/shops/:shopId/reviews",
  rateLimit,
  validate(ListShopReviewsQuerySchema, "query"),
  controller.listForShop,
);

export default router;
