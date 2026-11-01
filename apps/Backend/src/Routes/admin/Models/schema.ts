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

// `isActive` is update-only, never part of create (a new model is active by
// default). Without it here, DELETE /models/:id — which is a deactivate, not
// a delete — was irreversible through the API.
export const UpdateModelSchema = CreateModelSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const ListModelsQuerySchema = z.object({
  // Not z.coerce.boolean(): that is JS truthiness, so the string "false"
  // coerces to true and `?isActive=false` filtered the wrong way.
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  q: z.string().optional(),
});

export const UploadRequestSchema = z.object({
  contentType: z.string().min(1),
});

export const ConfirmUploadSchema = z.object({
  storageKey: z.string().min(1),
});
