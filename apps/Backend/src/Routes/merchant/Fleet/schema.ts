import { z } from "zod";

export const CreateVehicleSchema = z.object({
  modelId: z.string().uuid(),
  registrationNumber: z.string().min(1),
  manufacturingDate: z.string().optional(),
  color: z.string().optional(),
});

export const UpdateVehicleSchema = z
  .object({
    color: z.string().optional(),
    manufacturingDate: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .strict();

export const RegistrationRecordSchema = z.object({
  registrationNumber: z.string().min(1),
  registrationDate: z.string().optional(),
  registeringAuthority: z.string().optional(),
  engineNumber: z.string().optional(),
  chassisNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  vehicleClass: z.string().optional(),
  bodyType: z.string().optional(),
  fuelType: z.string().optional(),
  color: z.string().optional(),
  manufacturingDate: z.string().optional(),
  seatingCapacity: z.number().int().optional(),
  grossWeight: z.number().int().optional(),
  unladenWeight: z.number().int().optional(),
  cubicCapacity: z.number().int().optional(),
  financer: z.string().optional(),
  taxValidUntil: z.string().optional(),
  statusDate: z.string().optional(),
});

export const CreateDocumentSchema = z.object({
  type: z.enum(["RC", "INSURANCE", "FITNESS", "PUC", "PERMIT", "TAX"]),
  documentNumber: z.string().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const UploadRequestSchema = z.object({
  contentType: z.string().min(1),
});

export const ConfirmUploadSchema = z.object({
  storageKey: z.string().min(1),
});

export const AddMediaSchema = z.object({
  storageKey: z.string().min(1),
  type: z.enum(["IMAGE", "VIDEO"]),
  displayOrder: z.number().int().optional(),
});

export const ReorderMediaSchema = z.object({
  order: z.array(z.object({ id: z.string().uuid(), displayOrder: z.number().int() })),
});

export const SetAccessorySchema = z.object({
  type: z.string().min(1),
  quantity: z.number().int().positive(),
  status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
});

export const AddUnavailabilitySchema = z
  .object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    reason: z.string().optional(),
  })
  .refine((b) => b.endAt > b.startAt, { message: "endAt must be after startAt" });

export const AssignTrackerSchema = z.object({
  provider: z.string().optional(),
  deviceIdentifier: z.string().min(1),
});
