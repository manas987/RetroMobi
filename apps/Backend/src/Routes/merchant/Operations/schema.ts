import { z } from "zod";

export const ListBookingsQuerySchema = z.object({
  status: z.enum(["HOLD", "CONFIRMED", "COMPLETED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const CreateWalkinSchema = z.object({
  vehicleId: z.string().uuid(),
  walkinName: z.string().min(1),
  walkinPhone: z.string().regex(/^\+91[6-9]\d{9}$/, "phone must be a valid +91 mobile number"),
  walkinDlNumber: z.string().min(1),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
});

export const ReturnSchema = z.object({
  claim: z.boolean(),
  reason: z.string().optional(),
  amount: z.number().int().nonnegative().optional(),
});
