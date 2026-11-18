import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  CreateWalkinSchema,
  IdentityCheckSchema,
  PickupLicenceDecisionSchema,
  ListBookingsQuerySchema,
  ReturnSchema,
} from "./schema.ts";

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
// The identity check at handover. With automated face matching dropped, this
// is the only evidence binding a human to a licence -- see
// docs/dl-verification.md. bookings:write, same as pickup itself.
router.get(
  "/bookings/:bookingId/identity",
  requirePermission("bookings:write"),
  controller.identity,
);
router.post(
  "/bookings/:bookingId/identity-check",
  requirePermission("bookings:write"),
  validate(IdentityCheckSchema),
  controller.identityCheck,
);
// Re-sends the customer's handover code on WhatsApp.
router.post(
  "/bookings/:bookingId/handover-code/send",
  requirePermission("bookings:write"),
  controller.sendHandoverCode,
);
router.post(
  "/shops/:shopId/bookings/:id/pickup-licence",
  requirePermission("bookings:write"),
  validate(PickupLicenceDecisionSchema),
  controller.pickupLicenceDecision,
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
