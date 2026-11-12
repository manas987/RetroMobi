import { z } from "zod";

export const InspectionUploadSchema = z.object({
  contentType: z.string().regex(/^video\/[\w.+-]+$/i, "Choose a video file."),
});

export const InspectionConfirmSchema = z.object({
  storageKey: z.string().min(1),
});
