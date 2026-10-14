import { z } from "zod";

export const CreateReviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const UpdateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().optional(),
  })
  .refine((b) => b.rating !== undefined || b.comment !== undefined, {
    message: "at least one of rating or comment is required",
  });

export const ListShopReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
