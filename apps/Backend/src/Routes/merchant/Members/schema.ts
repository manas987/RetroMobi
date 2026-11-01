import { z } from "zod";
import { phoneSchema } from "../../../lib/phone";

const roleSchema = z.enum(["OWNER", "MANAGER", "STAFF"]);

export const InviteMemberSchema = z.object({
  phone: phoneSchema,
  role: roleSchema,
});

export const UpdateMemberRoleSchema = z.object({
  role: roleSchema,
});

export const RespondInviteSchema = z.object({
  accept: z.boolean(),
});
