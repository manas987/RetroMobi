import { z } from "zod";

export const InspectionUploadSchema = z.object({
  contentType: z.string().min(1),
});

export const InspectionConfirmSchema = z.object({
  storageKey: z.string().min(1),
});
