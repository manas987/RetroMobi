import { z } from "zod";

export const CreateCouponSchema = z
  .object({
    code: z.string().min(1),
    type: z.enum(["PERCENT", "FLAT"]),
    value: z.number().int(),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date(),
    maxUses: z.number().int().positive().optional(),
  })
  .refine((b) => b.validUntil > b.validFrom, { message: "validUntil must be after validFrom" })
  .refine((b) => (b.type === "PERCENT" ? b.value >= 0 && b.value <= 100 : b.value >= 0), {
    message: "PERCENT value must be 0-100, FLAT value must be a nonnegative paise amount",
  });

export const SetCouponStatusSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED"]),
});

export const ListCouponsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
});
