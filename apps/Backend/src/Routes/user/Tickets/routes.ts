import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { CreateTicketSchema, MessagesQuerySchema, PostMessageSchema } from "./schema.ts";

const router = Router();

router.use(requireAuth);
router.post("/", validate(CreateTicketSchema), controller.create);
router.get("/", controller.list);
router.get("/:id", controller.get);
router.get("/:id/messages", validate(MessagesQuerySchema, "query"), controller.messages);
router.post("/:id/messages", validate(PostMessageSchema), controller.postMessage);

export default router;
