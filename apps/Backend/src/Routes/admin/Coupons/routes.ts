import { Router } from "express";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { CreateCouponSchema, ListCouponsQuerySchema, SetCouponStatusSchema } from "./schema.ts";

const router = Router();

router.use(requireAdminAuth, requireAdminRole("SUPER_ADMIN"));

router.get("/", validate(ListCouponsQuerySchema, "query"), controller.list);
router.post("/", validate(CreateCouponSchema), controller.create);
router.patch("/:couponId", validate(SetCouponStatusSchema), controller.setStatus);
router.delete("/:couponId", controller.remove);
router.delete("/:couponId/hard", controller.hardRemove);

export default router;
