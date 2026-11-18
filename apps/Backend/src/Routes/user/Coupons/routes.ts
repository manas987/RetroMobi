import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../../../DB/client.ts";
import { evaluateCoupon, listLiveCoupons, loadLiveCoupon } from "../../../lib/coupons.ts";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import { CouponInvalidError, priceCart } from "../Bookings/bookingsService.ts";

// Checkout asks before it holds: "what does this code take off?" and "which
// coupons can I use?". Both price the cart exactly as createHold will
// (priceCart) and judge the coupon with the same evaluateCoupon, so the number
// shown is the number charged.

const CartSchema = z.object({
  items: z
    .array(z.object({ vehicleId: z.string().uuid(), riderId: z.string().uuid() }))
    .min(1)
    .max(5),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
});
const PreviewSchema = CartSchema.extend({ couponCode: z.string().trim().min(1) });

type Cart = z.infer<typeof CartSchema>;

async function pricedCart(cart: Cart) {
  const client = await pool.connect();
  try {
    return await priceCart(client, cart);
  } finally {
    client.release();
  }
}

const router = Router();
router.use(requireAuth);

// "My coupons": every live coupon with the rules spelled out, so a customer can
// see what they could use before building a cart. Codes are not secret: the
// checkout "coupons for you" list already shows any that apply. The rules are
// returned raw; whether they fit this customer is only known once there is a cart.
router.get("/", async (_req: Request, res: Response) => {
  const { rows } = await pool.query(
    `select c.code, c.description, c.type, c.value, c.max_discount, c.min_order_amount,
            c.valid_until, c.per_user_limit, c.conditions, c.funded_by,
            (select coalesce(array_agg(s.name order by s.name), '{}') from shops s where s.id = any(c.shop_ids)) as shop_names
       from coupons c
      where c.status = 'ACTIVE' and c.deleted_at is null
        and c.valid_from <= now() and c.valid_until >= now()
        and (c.max_uses is null or c.used_count < c.max_uses)
      order by c.valid_until
      limit 100`,
  );
  res.status(200).json({ coupons: rows });
});

router.post("/preview", validate(PreviewSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof PreviewSchema>;
  const coupon = await loadLiveCoupon(pool, body.couponCode);
  if (!coupon) throw new CouponInvalidError("That coupon code isn't valid.");
  const items = await pricedCart(body);
  const result = await evaluateCoupon(pool, coupon, { ...body, userId: req.userId!, items });
  if (!result.ok) throw new CouponInvalidError(result.reason);
  res.status(200).json({ code: coupon.code, description: coupon.description, discountAmount: result.discount });
});

router.post("/applicable", validate(CartSchema), async (req: Request, res: Response) => {
  const body = req.body as Cart;
  const items = await pricedCart(body);
  const coupons = [];
  // ponytail: evaluates every live coupon per request (capped at 100 in listLiveCoupons).
  // Fine at tens of coupons; index by shop/rule if the catalogue grows into the hundreds.
  for (const coupon of await listLiveCoupons(pool)) {
    const result = await evaluateCoupon(pool, coupon, { ...body, userId: req.userId!, items });
    if (result.ok && result.discount > 0) {
      coupons.push({ code: coupon.code, description: coupon.description, discountAmount: result.discount });
    }
  }
  coupons.sort((a, b) => b.discountAmount - a.discountAmount);
  res.status(200).json({ coupons });
});

export default router;
