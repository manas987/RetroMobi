import { z } from "zod";

const paise = z.number().int().nonnegative();

// PRODUCT.md: the deposit is capped at Rs 10,000 -- the UPI Reserve Pay block
// limit the rider actually pays it through. Above that the rider has no way to
// fund it, so this is a hard constraint, not a guideline.
const MAX_SECURITY_DEPOSIT_PAISE = 1_000_000;

export const UpsertPricingSchema = z.object({
  amount: paise,
  weekendAmount: paise,
  securityDepositAmount: paise.max(MAX_SECURITY_DEPOSIT_PAISE, {
    message: "securityDepositAmount cannot exceed Rs 10,000 (the UPI block limit)",
  }),
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
