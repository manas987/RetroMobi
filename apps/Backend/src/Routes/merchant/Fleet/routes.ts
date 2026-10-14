import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  AddMediaSchema,
  AddUnavailabilitySchema,
  AssignTrackerSchema,
  ConfirmUploadSchema,
  CreateDocumentSchema,
  CreateVehicleSchema,
  RegistrationRecordSchema,
  ReorderMediaSchema,
  SetAccessorySchema,
  UpdateVehicleSchema,
  UploadRequestSchema,
} from "./schema.ts";

const router = Router();

router.use(requireMerchantAuth);

router.get("/shops/:shopId/vehicles", requirePermission("fleet:read"), controller.list);
router.post(
  "/shops/:shopId/vehicles",
  requirePermission("fleet:write"),
  validate(CreateVehicleSchema),
  controller.create,
);

router.get("/vehicles/:vehicleId", requirePermission("fleet:read"), controller.get);
router.patch(
  "/vehicles/:vehicleId",
  requirePermission("fleet:write"),
  validate(UpdateVehicleSchema),
  controller.update,
);
router.delete("/vehicles/:vehicleId", requirePermission("fleet:write"), controller.remove);
router.put(
  "/vehicles/:vehicleId/registration",
  requirePermission("fleet:write"),
  validate(RegistrationRecordSchema),
  controller.upsertRegistration,
);

router.get("/vehicles/:vehicleId/documents", requirePermission("fleet:read"), controller.listDocuments);
router.post(
  "/vehicles/:vehicleId/documents",
  requirePermission("fleet:write"),
  validate(CreateDocumentSchema),
  controller.createDocument,
);
router.delete(
  "/vehicles/:vehicleId/documents/:documentId",
  requirePermission("fleet:write"),
  controller.removeDocument,
);
router.post(
  "/vehicles/:vehicleId/documents/:documentId/upload",
  requirePermission("fleet:write"),
  validate(UploadRequestSchema),
  controller.uploadDocument,
);
router.post(
  "/vehicles/:vehicleId/documents/:documentId/confirm",
  requirePermission("fleet:write"),
  validate(ConfirmUploadSchema),
  controller.confirmDocument,
);

router.get("/vehicles/:vehicleId/media", requirePermission("fleet:read"), controller.listMedia);
router.post(
  "/vehicles/:vehicleId/media/upload",
  requirePermission("fleet:write"),
  validate(UploadRequestSchema),
  controller.uploadMedia,
);
router.post(
  "/vehicles/:vehicleId/media/confirm",
  requirePermission("fleet:write"),
  validate(AddMediaSchema),
  controller.confirmMedia,
);
router.patch(
  "/vehicles/:vehicleId/media/order",
  requirePermission("fleet:write"),
  validate(ReorderMediaSchema),
  controller.reorderMedia,
);
router.delete(
  "/vehicles/:vehicleId/media/:mediaId",
  requirePermission("fleet:write"),
  controller.removeMedia,
);

router.get("/vehicles/:vehicleId/accessories", requirePermission("fleet:read"), controller.listAccessories);
router.post(
  "/vehicles/:vehicleId/accessories",
  requirePermission("fleet:write"),
  validate(SetAccessorySchema),
  controller.setAccessory,
);
router.delete(
  "/vehicles/:vehicleId/accessories/:accessoryId",
  requirePermission("fleet:write"),
  controller.deleteAccessory,
);

router.get(
  "/vehicles/:vehicleId/unavailability",
  requirePermission("fleet:read"),
  controller.listUnavailability,
);
router.post(
  "/vehicles/:vehicleId/unavailability",
  requirePermission("fleet:write"),
  validate(AddUnavailabilitySchema),
  controller.addUnavailability,
);
router.delete(
  "/vehicles/:vehicleId/unavailability/:blockId",
  requirePermission("fleet:write"),
  controller.deleteUnavailability,
);

router.post(
  "/vehicles/:vehicleId/tracker",
  requirePermission("fleet:write"),
  validate(AssignTrackerSchema),
  controller.assignTracker,
);
router.delete(
  "/vehicles/:vehicleId/tracker",
  requirePermission("fleet:write"),
  controller.unassignTracker,
);
router.get("/vehicles/:vehicleId/location", requirePermission("tracking:read"), controller.getLocation);

export default router;
