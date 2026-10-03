import { z } from "zod";

export const SearchQuerySchema = z.object({
  city: z.string().min(1),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  modelId: z.string().uuid().optional(),
  minRating: z.coerce.number().optional(),
  maxDistanceKm: z.coerce.number().optional(),
  sort: z.enum(["price", "rating", "distance"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
