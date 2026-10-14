import { z } from "zod";

export const CreateLicenceSchema = z.object({
  licenceNumber: z.string().min(1),
  issuingAuthority: z.string().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const LinkLicenceSchema = z.object({
  shopId: z.string().uuid(),
  branchType: z.string().optional(),
});

export const ConfirmUploadSchema = z.object({
  storageKey: z.string().min(1),
});

export const UploadRequestSchema = z.object({
  contentType: z.string().min(1),
});

export const CreateMerchantDocumentSchema = z.object({
  type: z.string().min(1),
  documentNumber: z.string().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
});
