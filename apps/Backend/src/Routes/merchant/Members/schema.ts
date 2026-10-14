import { z } from "zod";

const roleSchema = z.enum(["OWNER", "MANAGER", "STAFF"]);

export const InviteMemberSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/, "phone must be a valid +91 mobile number"),
  role: roleSchema,
});

export const UpdateMemberRoleSchema = z.object({
  role: roleSchema,
});

export const RespondInviteSchema = z.object({
  accept: z.boolean(),
});
