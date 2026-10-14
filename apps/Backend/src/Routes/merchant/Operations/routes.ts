import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { CreateWalkinSchema, ListBookingsQuerySchema, ReturnSchema } from "./schema.ts";

const router = Router();

router.use(requireMerchantAuth);

router.get(
  "/shops/:shopId/bookings",
  requirePermission("bookings:read"),
  validate(ListBookingsQuerySchema, "query"),
  controller.list,
);
router.get(
  "/shops/:shopId/bookings/:bookingId",
  requirePermission("bookings:read"),
  controller.get,
);
router.post(
  "/bookings/walkin",
  requirePermission("bookings:write"),
  validate(CreateWalkinSchema),
  controller.createWalkin,
);
router.post(
  "/bookings/:bookingId/pickup",
  requirePermission("bookings:write"),
  controller.pickup,
);
router.post(
  "/bookings/:bookingId/return",
  requirePermission("bookings:return"),
  validate(ReturnSchema),
  controller.returnBooking,
);

export default router;
