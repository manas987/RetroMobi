import { z } from "zod";

export const CreateHoldSchema = z.object({
  items: z
    .array(z.object({ vehicleId: z.string().uuid(), riderId: z.string().uuid() }))
    .min(1)
    .max(5),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
  couponCode: z.string().min(1).optional(),
});

export const CancelBookingSchema = z.object({});

export const ExtendBookingSchema = z.object({
  newReturnAt: z.coerce.date(),
});
