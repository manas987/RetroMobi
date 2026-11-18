import { z } from "zod";
import { CouponConditionsSchema } from "../../../lib/coupons.ts";

/** What any coupon is made of. Admins and merchants both create from this. */
export const CouponFieldsSchema = z.object({
  code: z.string().trim().min(1).max(32),
  description: z.string().trim().max(200).optional(),
  type: z.enum(["PERCENT", "FLAT"]),
  value: z.number().int(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
  maxUses: z.number().int().positive().optional(),
  /** Cap on a PERCENT discount, paise. */
  maxDiscount: z.number().int().positive().optional(),
  /** Ticket size: eligible rental total, paise. */
  minOrderAmount: z.number().int().min(0).optional(),
  perUserLimit: z.number().int().positive().optional(),
  perShopLimit: z.number().int().positive().optional(),
  conditions: CouponConditionsSchema.optional(),
});

type CouponFields = z.infer<typeof CouponFieldsSchema>;
const validWindow = (b: CouponFields) => b.validUntil > b.validFrom;
const validValue = (b: CouponFields) => (b.type === "PERCENT" ? b.value >= 0 && b.value <= 100 : b.value >= 0);
const VALUE_MESSAGE = "PERCENT value must be 0-100, FLAT value must be a nonnegative paise amount";

export const CreateCouponSchema = CouponFieldsSchema.extend({
  // An admin can create either kind; a SHOP-funded one must say which shops pay.
  fundedBy: z.enum(["PLATFORM", "SHOP"]).default("PLATFORM"),
  shopIds: z.array(z.string().uuid()).min(1).optional(),
})
  .refine(validWindow, { message: "validUntil must be after validFrom" })
  .refine(validValue, { message: VALUE_MESSAGE })
  .refine((b) => b.fundedBy === "PLATFORM" || (b.shopIds?.length ?? 0) > 0, {
    message: "a SHOP-funded coupon must name its shops",
  });

/** A merchant's coupon is always SHOP-funded and scoped to the shop in the URL. */
export const CreateShopCouponSchema = CouponFieldsSchema.refine(validWindow, {
  message: "validUntil must be after validFrom",
}).refine(validValue, { message: VALUE_MESSAGE });

export const SetCouponStatusSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED"]),
});

export const ListCouponsQuerySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
});
