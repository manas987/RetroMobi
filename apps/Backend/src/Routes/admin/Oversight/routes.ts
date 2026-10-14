import { Router } from "express";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  ListAuditLogsQuerySchema,
  ListBookingsQuerySchema,
  ListMerchantsQuerySchema,
  ListPaymentsQuerySchema,
  ListPayoutsQuerySchema,
  ListShopsQuerySchema,
  ListVehiclesQuerySchema,
} from "./schema.ts";

const router = Router();

router.use(requireAdminAuth);

// ADMIN gets operational visibility.
router.get(
  "/merchants",
  requireAdminRole("ADMIN", "SUPER_ADMIN"),
  validate(ListMerchantsQuerySchema, "query"),
  controller.listMerchants,
);
router.get("/merchants/:id", requireAdminRole("ADMIN", "SUPER_ADMIN"), controller.getMerchant);
router.get(
  "/shops",
  requireAdminRole("ADMIN", "SUPER_ADMIN"),
  validate(ListShopsQuerySchema, "query"),
  controller.listShops,
);
router.get(
  "/vehicles",
  requireAdminRole("ADMIN", "SUPER_ADMIN"),
  validate(ListVehiclesQuerySchema, "query"),
  controller.listVehicles,
);
router.get(
  "/bookings",
  requireAdminRole("ADMIN", "SUPER_ADMIN"),
  validate(ListBookingsQuerySchema, "query"),
  controller.listBookings,
);

// SUPER_ADMIN gets money and logs.
router.get(
  "/payments",
  requireAdminRole("SUPER_ADMIN"),
  validate(ListPaymentsQuerySchema, "query"),
  controller.listPayments,
);
router.get(
  "/payouts",
  requireAdminRole("SUPER_ADMIN"),
  validate(ListPayoutsQuerySchema, "query"),
  controller.listPayouts,
);
router.get(
  "/audit-logs",
  requireAdminRole("SUPER_ADMIN"),
  validate(ListAuditLogsQuerySchema, "query"),
  controller.listAuditLogs,
);

export default router;
