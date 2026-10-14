import { z } from "zod";

export const UpsertPayoutAccountSchema = z.object({
  providerAccountRef: z.string().min(1),
});

export const ListPayoutsQuerySchema = z.object({
  status: z.enum(["PENDING", "PAID", "FAILED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
