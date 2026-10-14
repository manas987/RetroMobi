import { z } from "zod";

export const CreateTicketSchema = z.object({
  bookingId: z.string().uuid().optional(),
  subject: z.string().min(1).optional(),
  firstMessage: z.string().min(1).optional(),
});

export const PostMessageSchema = z.object({
  body: z.string().min(1),
});

export const MessagesQuerySchema = z.object({
  since: z.string().uuid().optional(),
});

export const UploadRequestSchema = z.object({
  contentType: z.string().min(1),
});

export const ConfirmAttachmentSchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
});

export const SetTicketCategorySchema = z
  .object({
    category: z.enum(["BOOKING", "APP_HELP", "OTHER"]),
    bookingId: z.string().uuid().optional(),
  })
  .refine((b) => (b.category === "BOOKING" ? Boolean(b.bookingId) : !b.bookingId), {
    message: "bookingId is required for BOOKING and must be absent otherwise",
  });
