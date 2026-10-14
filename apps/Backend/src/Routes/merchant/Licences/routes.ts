import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  ConfirmUploadSchema,
  CreateLicenceSchema,
  CreateMerchantDocumentSchema,
  LinkLicenceSchema,
  UploadRequestSchema,
} from "./schema.ts";

// merchant_documents and shop_licenses both hang off merchant_user_id, not a
// shop, so there is no shop to resolve a role against -- requireMerchantAuth
// only.
const router = Router();

router.use(requireMerchantAuth);

router.get("/licences", controller.list);
router.post("/licences", validate(CreateLicenceSchema), controller.create);
router.delete("/licences/:licenceId", controller.remove);
router.post("/licences/:licenceId/upload", validate(UploadRequestSchema), controller.upload);
router.post("/licences/:licenceId/confirm", validate(ConfirmUploadSchema), controller.confirm);
router.post("/licences/:licenceId/shops", validate(LinkLicenceSchema), controller.linkShop);
router.delete("/licences/:licenceId/shops/:shopId", controller.unlinkShop);

router.get("/merchant-documents", controller.listDocuments);
router.post("/merchant-documents", validate(CreateMerchantDocumentSchema), controller.createDocument);
router.delete("/merchant-documents/:documentId", controller.removeDocument);
router.post(
  "/merchant-documents/:documentId/upload",
  validate(UploadRequestSchema),
  controller.uploadDocument,
);
router.post(
  "/merchant-documents/:documentId/confirm",
  validate(ConfirmUploadSchema),
  controller.confirmDocument,
);

export default router;
