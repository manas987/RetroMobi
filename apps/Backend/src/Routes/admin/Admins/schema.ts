import { z } from "zod";

const roleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "SUPPORT"]);

export const CreateAdminSchema = z.object({
  phone: z.string().regex(/^\+91[6-9]\d{9}$/, "phone must be a valid +91 mobile number"),
  name: z.string().min(1),
  email: z.string().email().optional(),
  role: roleSchema,
});

export const UpdateAdminSchema = z
  .object({
    role: roleSchema.optional(),
    status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]).optional(),
  })
  .refine((b) => b.role !== undefined || b.status !== undefined, {
    message: "at least one of role or status is required",
  });
