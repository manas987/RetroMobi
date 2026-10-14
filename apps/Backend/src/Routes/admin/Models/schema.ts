import { z } from "zod";

export const CreateModelSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  class: z.string().optional(),
  fuelType: z.enum(["PETROL", "ELECTRIC"]).optional(),
  engineCc: z.number().int().positive().optional(),
  bodyType: z.string().optional(),
  seatingCapacity: z.number().int().positive().optional(),
});

export const UpdateModelSchema = CreateModelSchema.partial();

export const ListModelsQuerySchema = z.object({
  isActive: z.coerce.boolean().optional(),
  q: z.string().optional(),
});

export const UploadRequestSchema = z.object({
  contentType: z.string().min(1),
});

export const ConfirmUploadSchema = z.object({
  storageKey: z.string().min(1),
});
