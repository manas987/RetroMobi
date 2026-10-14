import { z } from "zod";

const paise = z.number().int().nonnegative();

export const UpsertPricingSchema = z.object({
  amount: paise,
  weekendAmount: paise,
  securityDepositAmount: paise,
  lateFeeAmount: paise,
});

export const AddSpecialSchema = z
  .object({
    name: z.string().min(1),
    amount: paise,
    weekendAmount: paise,
    effectiveFrom: z.string(),
    effectiveUntil: z.string(),
  })
  .refine((b) => b.effectiveUntil >= b.effectiveFrom, {
    message: "effectiveUntil must be on or after effectiveFrom",
  });
