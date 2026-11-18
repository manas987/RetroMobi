import { z } from "zod";

export const CreateRiderSchema = z.object({
  name: z.string().min(1),
  dob: z.string().date().optional(),
});

export const UpdateRiderSchema = z.object({
  name: z.string().min(1).optional(),
  dob: z.string().date().nullable().optional(),
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

// --- verification sessions (docs/dl-verification.md) ---------------------

export const StartVerificationSchema = z.object({
  method: z.enum(["DIGILOCKER", "DL_NUMBER"]),
  // Not a formality: the server refuses to create a session without it, and
  // the schema below records the exact wording the customer was shown.
  consent: z.literal(true),
  // Required for DigiLocker only; the service rejects a DigiLocker start
  // without one rather than encoding the dependency here, where the error
  // would be a schema complaint instead of an explanation.
  redirectUrl: z.string().url().optional(),
});

export const VerifyDlNumberSchema = z.object({
  // Length only. No format check: DL numbering differs by state and RTO, and a
  // regex here would refuse valid licences from whichever state nobody tested.
  licenceNumber: z.string().min(6).max(32),
  dob: z.string().date(),
});

// Used by both the presign request and the confirm. No storage key in either:
// it is derived server-side, because a client-supplied key would let a caller
// point the record at any object in the bucket.
export const PhotoUploadSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const RetryVerificationSchema = z.object({
  redirectUrl: z.string().url().optional(),
});
