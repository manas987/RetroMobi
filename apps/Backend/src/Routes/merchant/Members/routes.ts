import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { InviteMemberSchema, RespondInviteSchema, UpdateMemberRoleSchema } from "./schema.ts";

const router = Router();

router.use(requireMerchantAuth);

// No requirePermission here on purpose: the invitee is by definition not yet
// a member of the shop the invite is for, so a membership check would reject
// every invite ever sent.
router.get("/invites", controller.listMyInvites);
router.post("/invites/:inviteId/respond", validate(RespondInviteSchema), controller.respond);

router.get("/shops/:shopId/members", requirePermission("members:read"), controller.list);
router.patch(
  "/shops/:shopId/members/:memberId",
  requirePermission("members:write"),
  validate(UpdateMemberRoleSchema),
  controller.updateRole,
);
router.delete(
  "/shops/:shopId/members/:memberId",
  requirePermission("members:write"),
  controller.remove,
);
router.get("/shops/:shopId/invites", requirePermission("members:read"), controller.listShopInvites);
router.post(
  "/shops/:shopId/invites",
  requirePermission("members:write"),
  validate(InviteMemberSchema),
  controller.invite,
);

export default router;
