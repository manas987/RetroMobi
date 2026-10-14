import { z } from "zod";

export const QueueQuerySchema = z.object({
  type: z.enum(["SHOP", "VEHICLE", "VEHICLE_DOCUMENT", "MERCHANT_DOCUMENT", "SHOP_LICENCE"]),
});

export const DecisionSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  note: z.string().optional(),
});

export const LicenceDecisionSchema = z.object({
  status: z.enum(["ACTIVE", "REJECTED"]),
  note: z.string().optional(),
});
