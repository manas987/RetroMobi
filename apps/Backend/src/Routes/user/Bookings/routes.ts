import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { CreateHoldSchema, ExtendBookingSchema } from "./schema.ts";

const router = Router();

router.use(requireAuth);
router.post("/", validate(CreateHoldSchema), controller.createHold);
router.post("/:id/cancel", controller.cancelBooking);
router.post("/:id/extend", validate(ExtendBookingSchema), controller.extendBooking);

export default router;
