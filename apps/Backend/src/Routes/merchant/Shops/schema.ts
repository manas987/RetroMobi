import { z } from "zod";

const pincodeSchema = z.string().regex(/^\d{6}$/, "pincode must be 6 digits");
const gstinSchema = z.string().length(15, "gstin must be 15 characters");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM, 24-hour");

export const CreateShopSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  addressLine1: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: pincodeSchema,
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  gstin: gstinSchema.optional(),
});

export const UpdateShopSchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    addressLine1: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    pincode: pincodeSchema.optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    gstin: gstinSchema.optional(),
    status: z.enum(["OPEN", "CLOSED"]).optional(),
  })
  .strict();

export const SetShopHoursSchema = z.object({
  hours: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        opensAt: timeSchema,
        closesAt: timeSchema,
      }),
    )
    .max(7),
});
