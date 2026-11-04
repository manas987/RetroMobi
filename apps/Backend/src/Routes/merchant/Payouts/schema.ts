import { z } from "zod";

// What Cashfree Payouts needs to register a beneficiary: a name, an account
// number and an IFSC. The account number is sent once and NOT stored (see
// migration 0017) -- only the last four, the IFSC and the beneficiary id.
export const UpsertPayoutAccountSchema = z.object({
  holderName: z.string().min(3).max(100),
  // 4-25 alphanumeric per the API reference. Validated here so a typo is a 400
  // with a useful message rather than an opaque vendor rejection.
  accountNumber: z.string().regex(/^[A-Za-z0-9]{4,25}$/, "must be 4-25 letters or digits"),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "must be a valid 11-character IFSC"),
});

export const ListPayoutsQuerySchema = z.object({
  status: z.enum(["PENDING", "PAID", "FAILED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
