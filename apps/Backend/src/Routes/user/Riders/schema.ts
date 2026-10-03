import { z } from "zod";

export const CreateRiderSchema = z.object({
  name: z.string().min(1),
  dob: z.string().date().optional(),
});

export const UpdateRiderSchema = z.object({
  name: z.string().min(1).optional(),
  dob: z.string().date().optional(),
});

export const DigilockerInitSchema = z.object({
  redirectUrl: z.string().url(),
});

export const DigilockerCallbackSchema = z.object({
  requestId: z.string().min(1),
});

export const ManualLicenceSchema = z.object({
  licenceNumber: z.string().min(1),
  dob: z.string().date(),
});
