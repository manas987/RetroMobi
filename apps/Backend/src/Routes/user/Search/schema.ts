import { z } from "zod";

export const SearchQuerySchema = z.object({
  // Either city or shopId must be present — enforced below, since a shop
  // page search scopes to one shop's inventory and has no city of its own.
  city: z.string().min(1).optional(),
  shopId: z.string().uuid().optional(),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  modelId: z.string().uuid().optional(),
  make: z.string().min(1).optional(),
  minRating: z.coerce.number().optional(),
  maxDistanceKm: z.coerce.number().optional(),
  // Comma-separated list, e.g. "PETROL,ELECTRIC" — any match passes.
  fuelType: z
    .string()
    .regex(/^(PETROL|ELECTRIC)(,(PETROL|ELECTRIC))*$/, "fuelType must be PETROL and/or ELECTRIC, comma-separated")
    .optional(),
  // Comma-separated list, e.g. "SCOOTER,MOTORCYCLE" — any match passes. Not
  // an enum: `vehicle_models.body_type` is free text an admin fills in, so a
  // new type must not need a redeploy here to become filterable.
  bodyType: z
    .string()
    .regex(/^[A-Z_]+(,[A-Z_]+)*$/, "bodyType must be an upper-case, comma-separated list")
    .optional(),
  minEngineCc: z.coerce.number().optional(),
  maxEngineCc: z.coerce.number().optional(),
  seatingCapacity: z.coerce.number().int().optional(),
  sort: z.enum(["price", "rating", "distance"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
  .refine((d) => !!d.city || !!d.shopId, { message: "either city or shopId is required", path: ["city"] })
  // Rental length itself is uncapped, but search is the only public,
  // unauthenticated endpoint and it prices every candidate vehicle one day at
  // a time. An unbounded window turns one request into hundreds of thousands
  // of allocations, so the *window* gets a sanity bound even though a booking
  // does not.
  .refine((d) => d.returnAt.getTime() - d.pickupAt.getTime() <= 365 * 86_400_000, {
    message: "search window cannot exceed 365 days",
    path: ["returnAt"],
  });

/**
 * The cart, as the browser holds it. One entry per cart line, because lines can
 * carry different windows. The caps mirror the cart's own: MAX_CART_ITEMS lines,
 * and each line sends both its held ids and the pool it draws extra units from.
 */
export const CartAvailabilitySchema = z.object({
  lines: z
    .array(
      z.object({
        vehicleIds: z.array(z.string().uuid()).min(1).max(25),
        pickupAt: z.coerce.date(),
        returnAt: z.coerce.date(),
      }),
    )
    .min(1)
    .max(5),
});

export const VehicleDetailParamsSchema = z.object({
  vehicleId: z.string().uuid(),
});

export const VehicleDetailWindowSchema = z.object({
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
}).refine(({ pickupAt, returnAt }) => {
  const duration = returnAt.getTime() - pickupAt.getTime();
  return duration > 0 && duration <= 365 * 86_400_000;
}, { message: "Return must follow pickup within 365 days", path: ["returnAt"] });
