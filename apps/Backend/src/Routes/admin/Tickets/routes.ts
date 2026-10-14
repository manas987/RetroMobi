import { Router } from "express";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  AddParticipantSchema,
  AssignTicketSchema,
  MessagesQuerySchema,
  PostMessageSchema,
  QueueQuerySchema,
  ResolveTicketSchema,
  SettleDepositSchema,
} from "./schema.ts";

const router = Router();

router.use(requireAdminAuth, requireAdminRole("SUPPORT", "ADMIN", "SUPER_ADMIN"));

router.get("/", validate(QueueQuerySchema, "query"), controller.queue);
router.get("/:id", controller.get);
router.get("/:id/messages", validate(MessagesQuerySchema, "query"), controller.messages);
router.post("/:id/messages", validate(PostMessageSchema), controller.postMessage);
router.post("/:id/assign", requireAdminRole("ADMIN", "SUPER_ADMIN"), validate(AssignTicketSchema), controller.assign);
router.post("/:id/resolve", validate(ResolveTicketSchema), controller.resolve);
router.get("/:id/addable-parties", controller.addableParties);
router.post("/:id/participants", validate(AddParticipantSchema), controller.addParticipant);
router.get("/:id/deposit", controller.getDeposit);
// Every role here (including SUPPORT) may settle -- the one money-moving
// power support agents have, per backend.md's Phase 16 decision.
router.post("/:id/deposit-settlement", validate(SettleDepositSchema), controller.settleDeposit);

export default router;
