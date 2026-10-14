import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  ConfirmAttachmentSchema,
  CreateTicketSchema,
  MessagesQuerySchema,
  PostMessageSchema,
  SetTicketCategorySchema,
  UploadRequestSchema,
} from "./schema.ts";

const router = Router();

router.use(requireMerchantAuth);
router.post("/", validate(CreateTicketSchema), controller.create);
router.get("/", controller.list);
router.get("/:id", controller.get);
router.get("/:id/messages", validate(MessagesQuerySchema, "query"), controller.messages);
router.post("/:id/messages", validate(PostMessageSchema), controller.postMessage);
router.post("/:id/category", validate(SetTicketCategorySchema), controller.setCategory);
router.post(
  "/:id/messages/:messageId/attachments/upload",
  validate(UploadRequestSchema),
  controller.uploadAttachment,
);
router.post(
  "/:id/messages/:messageId/attachments/confirm",
  validate(ConfirmAttachmentSchema),
  controller.confirmAttachment,
);

export default router;
