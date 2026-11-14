import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  ConfirmUploadSchema,
  CreateShopDocumentSchema,
  CreateShopSchema,
  PublishMediaSchema,
  ReorderMediaSchema,
  SetShopHoursSchema,
  UpdateShopSchema,
  UploadRequestSchema,
} from "./schema.ts";

const router = Router();

router.use(requireMerchantAuth);

router.get("/", controller.list);
router.post("/", validate(CreateShopSchema), controller.create);
router.get("/:shopId", requirePermission("fleet:read"), controller.get);
router.patch("/:shopId", requirePermission("shop:write"), validate(UpdateShopSchema), controller.update);
router.delete("/:shopId", requirePermission("shop:delete"), controller.remove);
router.get("/:shopId/reviews", requirePermission("fleet:read"), controller.reviews);
router.post("/:shopId/verification", requirePermission("shop:write"), controller.submitVerification);
router.put(
  "/:shopId/hours",
  requirePermission("shop:write"),
  validate(SetShopHoursSchema),
  controller.setHours,
);

// Shop photos. "/media/order" sits before "/media/:mediaId" so it isn't read as an id.
router.get("/:shopId/media", requirePermission("fleet:read"), controller.listMedia);
router.get("/:shopId/media/:mediaId/download", requirePermission("fleet:read"), controller.downloadMedia);
router.post("/:shopId/media/upload", requirePermission("shop:write"), validate(UploadRequestSchema), controller.uploadMedia);
router.post("/:shopId/media/confirm", requirePermission("shop:write"), validate(ConfirmUploadSchema), controller.confirmMedia);
router.patch("/:shopId/media/order", requirePermission("shop:write"), validate(ReorderMediaSchema), controller.reorderMedia);
router.patch("/:shopId/media/:mediaId", requirePermission("shop:write"), validate(PublishMediaSchema), controller.publishMedia);
router.delete("/:shopId/media/:mediaId", requirePermission("shop:write"), controller.removeMedia);

// Per-shop papers.
router.get("/:shopId/documents", requirePermission("fleet:read"), controller.listDocuments);
router.post("/:shopId/documents", requirePermission("shop:write"), validate(CreateShopDocumentSchema), controller.createDocument);
router.post("/:shopId/documents/:documentId/upload", requirePermission("shop:write"), validate(UploadRequestSchema), controller.uploadDocument);
router.post("/:shopId/documents/:documentId/confirm", requirePermission("shop:write"), validate(ConfirmUploadSchema), controller.confirmDocument);
router.get("/:shopId/documents/:documentId/download", requirePermission("fleet:read"), controller.downloadDocument);
router.delete("/:shopId/documents/:documentId", requirePermission("shop:write"), controller.removeDocument);

export default router;
