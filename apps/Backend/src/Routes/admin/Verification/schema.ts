import { z } from "zod";

export const VerifiableTypeSchema = z.enum([
  "SHOP",
  "VEHICLE",
  "VEHICLE_DOCUMENT",
  "MERCHANT_DOCUMENT",
  "SHOP_LICENCE",
]);

export const QueueQuerySchema = z.object({
  type: VerifiableTypeSchema,
  // Lets an admin review what was already decided. Omitted means PENDING, so
  // the queue's default behaviour is unchanged. ACTIVE is here because a
  // licence goes PENDING -> ACTIVE rather than PENDING -> VERIFIED.
  status: z.enum(["PENDING", "VERIFIED", "ACTIVE", "REJECTED", "EXPIRED"]).optional(),
});

export const DocumentParamsSchema = z.object({
  type: VerifiableTypeSchema,
  id: z.string().uuid(),
});

export const DecisionSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  note: z.string().optional(),
});

export const LicenceDecisionSchema = z.object({
  status: z.enum(["ACTIVE", "REJECTED"]),
  note: z.string().optional(),
});
