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
