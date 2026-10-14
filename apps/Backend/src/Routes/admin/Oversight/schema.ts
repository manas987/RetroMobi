import { z } from "zod";

const pagingSchema = {
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
};

export const ListMerchantsQuerySchema = z.object({ ...pagingSchema, q: z.string().optional() });

export const ListShopsQuerySchema = z.object({
  ...pagingSchema,
  city: z.string().optional(),
  verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]).optional(),
});

export const ListVehiclesQuerySchema = z.object({
  ...pagingSchema,
  shopId: z.string().uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const ListBookingsQuerySchema = z.object({
  ...pagingSchema,
  status: z.enum(["HOLD", "CONFIRMED", "COMPLETED"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const ListPaymentsQuerySchema = z.object({
  ...pagingSchema,
  status: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const ListPayoutsQuerySchema = z.object({
  ...pagingSchema,
  status: z.string().optional(),
  stage: z.string().optional(),
});

export const ListAuditLogsQuerySchema = z.object({
  ...pagingSchema,
  actorType: z.string().optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
});
