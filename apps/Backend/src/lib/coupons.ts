import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { countRentalDays } from "./pricing.ts";

/**
 * Coupon eligibility and discount (migration 0022). One function decides
 * whether a coupon applies to a cart and how much it takes off each booking;
 * the hold, the checkout preview and the "coupons for you" list all call it, so
 * what the customer is shown is what they are charged.
 */

/** Every rule a coupon can carry. `.strict()` so a typo'd rule is a 400, not a rule silently ignored. */
export const CouponConditionsSchema = z
  .object({
    /** No earlier confirmed or completed rental on the account. */
    firstBookingOnly: z.boolean().optional(),
    /** "Number of rides": completed rentals on the account, inclusive bounds. */
    minCompletedRentals: z.number().int().min(0).optional(),
    maxCompletedRentals: z.number().int().min(0).optional(),
    /** Every rider in the cart, by date of birth, at pickup. */
    minRiderAge: z.number().int().min(16).max(100).optional(),
    maxRiderAge: z.number().int().min(16).max(100).optional(),
    /** Pickup within N days either side of the account holder's birthday. */
    birthdayWindowDays: z.number().int().min(0).max(31).optional(),
    /** Account created within the last N days. */
    newUserWithinDays: z.number().int().min(1).optional(),
    minRentalDays: z.number().int().min(1).optional(),
    /** Pickup weekday in IST: 0 = Sunday ... 6 = Saturday. */
    pickupWeekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
    /** Only these scooter models get the discount. */
    modelIds: z.array(z.string().uuid()).min(1).optional(),
  })
  .strict()
  .refine((c) => c.minCompletedRentals == null || c.maxCompletedRentals == null || c.minCompletedRentals <= c.maxCompletedRentals, {
    message: "minCompletedRentals must not exceed maxCompletedRentals",
  })
  .refine((c) => c.minRiderAge == null || c.maxRiderAge == null || c.minRiderAge <= c.maxRiderAge, {
    message: "minRiderAge must not exceed maxRiderAge",
  });
export type CouponConditions = z.infer<typeof CouponConditionsSchema>;

export type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENT" | "FLAT";
  value: number;
  funded_by: "PLATFORM" | "SHOP";
  shop_ids: string[] | null;
  max_discount: number | null;
  min_order_amount: number;
  max_uses: number | null;
  used_count: number;
  per_user_limit: number | null;
  per_shop_limit: number | null;
  conditions: CouponConditions;
};

export type CartItem = {
  vehicleId: string;
  shopId: string;
  modelId: string;
  riderId: string;
  rentalAmount: number;
};

export type CouponEvaluation =
  | { ok: true; discount: number; perItem: number[]; fundedBy: "PLATFORM" | "SHOP" }
  | { ok: false; reason: string };

const LIVE = `status = 'ACTIVE' and deleted_at is null and valid_from <= now() and valid_until >= now()`;

function toCoupon(row: Record<string, unknown>): CouponRow {
  return {
    ...(row as unknown as CouponRow),
    value: Number(row.value),
    max_discount: row.max_discount == null ? null : Number(row.max_discount),
    min_order_amount: Number(row.min_order_amount ?? 0),
    used_count: Number(row.used_count ?? 0),
    conditions: (row.conditions ?? {}) as CouponConditions,
  };
}

/** A live coupon by code (case-insensitive), or null. */
export async function loadLiveCoupon(client: Pool | PoolClient, code: string): Promise<CouponRow | null> {
  const { rows } = await client.query(`select * from coupons where upper(code) = upper($1) and ${LIVE}`, [code]);
  return rows[0] ? toCoupon(rows[0]) : null;
}

export async function listLiveCoupons(client: Pool | PoolClient): Promise<CouponRow[]> {
  const { rows } = await client.query(`select * from coupons where ${LIVE} order by created_at desc limit 100`);
  return rows.map(toCoupon);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istParts(date: Date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth(), day: ist.getUTCDate(), weekday: ist.getUTCDay() };
}

/** Whole years between a date of birth and a moment, in IST. */
export function ageAt(dob: Date, at: Date): number {
  const d = istParts(dob);
  const a = istParts(at);
  let age = a.year - d.year;
  if (a.month < d.month || (a.month === d.month && a.day < d.day)) age -= 1;
  return age;
}

/** Days between `at` and the nearest birthday (this year's, last year's or next year's). */
export function daysFromBirthday(dob: Date, at: Date): number {
  const d = istParts(dob);
  const a = istParts(at);
  const today = Date.UTC(a.year, a.month, a.day);
  let best = Infinity;
  for (const year of [a.year - 1, a.year, a.year + 1]) {
    // Feb 29 becomes Feb 28 in a non-leap year (Date.UTC would roll it to Mar 1).
    const day = d.month === 1 && d.day === 29 && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1 ? 28 : d.day;
    best = Math.min(best, Math.abs(today - Date.UTC(year, d.month, day)) / 86_400_000);
  }
  return best;
}

/**
 * Splits `discount` across items in proportion to their rental, in whole paise,
 * so the parts always sum to exactly `discount` and none exceeds its rental.
 */
export function allocate(discount: number, rentals: number[]): number[] {
  const base = rentals.reduce((s, r) => s + r, 0);
  if (base === 0 || discount === 0) return rentals.map(() => 0);
  const parts = rentals.map((r) => Math.floor((discount * r) / base));
  let left = discount - parts.reduce((s, p) => s + p, 0);
  // The leftover paise go to the biggest rentals first, which can always absorb them.
  const order = rentals.map((r, i) => [r, i] as const).sort((x, y) => y[0] - x[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length) {
    const i = order[k]![1];
    if (parts[i]! < rentals[i]!) {
      parts[i]! += 1;
      left -= 1;
    }
  }
  return parts;
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

export async function evaluateCoupon(
  client: Pool | PoolClient,
  coupon: CouponRow,
  ctx: { userId: string; pickupAt: Date; returnAt: Date; items: CartItem[] },
): Promise<CouponEvaluation> {
  const c = coupon.conditions;

  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
    return { ok: false, reason: "This coupon has been fully used." };
  }

  if (coupon.per_user_limit != null) {
    const { rows } = await client.query(
      `select count(distinct booking_group_id)::int as n from coupon_redemptions where coupon_id = $1 and user_id = $2`,
      [coupon.id, ctx.userId],
    );
    if (rows[0].n >= coupon.per_user_limit) return { ok: false, reason: "You have already used this coupon." };
  }

  // Which bookings the discount can touch: the coupon's shops and models, minus
  // any shop where it has already been used up.
  let exhaustedShops = new Set<string>();
  if (coupon.per_shop_limit != null) {
    const { rows } = await client.query(
      `select shop_id from coupon_redemptions where coupon_id = $1
        group by shop_id having count(distinct booking_group_id) >= $2`,
      [coupon.id, coupon.per_shop_limit],
    );
    exhaustedShops = new Set(rows.map((r) => String(r.shop_id)));
  }
  const eligible = ctx.items.map(
    (item) =>
      (coupon.shop_ids == null || coupon.shop_ids.includes(item.shopId)) &&
      (c.modelIds == null || c.modelIds.includes(item.modelId)) &&
      !exhaustedShops.has(item.shopId),
  );
  if (!eligible.some(Boolean)) return { ok: false, reason: "This coupon isn't valid for these scooters." };

  const base = ctx.items.reduce((s, item, i) => s + (eligible[i] ? item.rentalAmount : 0), 0);
  if (base < coupon.min_order_amount) {
    return { ok: false, reason: `This coupon needs a rental total of at least ${rupees(coupon.min_order_amount)}.` };
  }

  if (c.minRentalDays != null && countRentalDays(ctx.pickupAt, ctx.returnAt) < c.minRentalDays) {
    return { ok: false, reason: `This coupon needs a rental of at least ${c.minRentalDays} days.` };
  }
  if (c.pickupWeekdays != null && !c.pickupWeekdays.includes(istParts(ctx.pickupAt).weekday)) {
    return { ok: false, reason: "This coupon isn't valid for that pickup day." };
  }

  if (c.firstBookingOnly || c.minCompletedRentals != null || c.maxCompletedRentals != null || c.newUserWithinDays != null) {
    // A cancelled booking is not a rental the customer had, so it never counts.
    const { rows } = await client.query(
      `select
         (select count(*)::int from bookings b join booking_groups g on g.id = b.group_id
           where g.user_id = $1 and b.deleted_at is null and b.status in ('CONFIRMED', 'COMPLETED')
             and not exists (select 1 from booking_cancellations bc where bc.booking_id = b.id)) as rentals,
         (select count(*)::int from bookings b join booking_groups g on g.id = b.group_id
           where g.user_id = $1 and b.deleted_at is null and b.status = 'COMPLETED') as completed,
         (select created_at from users where id = $1) as joined_at`,
      [ctx.userId],
    );
    const { rentals, completed, joined_at } = rows[0];
    if (c.firstBookingOnly && rentals > 0) return { ok: false, reason: "This coupon is for your first booking." };
    if (c.minCompletedRentals != null && completed < c.minCompletedRentals) {
      return { ok: false, reason: `This coupon unlocks after ${c.minCompletedRentals} completed rentals.` };
    }
    if (c.maxCompletedRentals != null && completed > c.maxCompletedRentals) {
      return { ok: false, reason: "This coupon is no longer available on your account." };
    }
    if (c.newUserWithinDays != null && Date.now() - new Date(joined_at).getTime() > c.newUserWithinDays * 86_400_000) {
      return { ok: false, reason: `This coupon is for accounts less than ${c.newUserWithinDays} days old.` };
    }
  }

  if (c.minRiderAge != null || c.maxRiderAge != null) {
    const { rows } = await client.query(`select id, dob from riders where id = any($1::uuid[])`, [
      ctx.items.map((i) => i.riderId),
    ]);
    for (const item of ctx.items) {
      const dob = rows.find((r) => r.id === item.riderId)?.dob;
      if (!dob) return { ok: false, reason: "We need every rider's date of birth to apply this coupon." };
      const age = ageAt(new Date(dob), ctx.pickupAt);
      if ((c.minRiderAge != null && age < c.minRiderAge) || (c.maxRiderAge != null && age > c.maxRiderAge)) {
        return { ok: false, reason: "This coupon isn't valid for every rider's age." };
      }
    }
  }

  if (c.birthdayWindowDays != null) {
    // The account holder is rider #1, created at signup (migration 0006).
    const { rows } = await client.query(
      `select dob from riders where user_id = $1 and deleted_at is null order by created_at limit 1`,
      [ctx.userId],
    );
    const dob = rows[0]?.dob;
    if (!dob || daysFromBirthday(new Date(dob), ctx.pickupAt) > c.birthdayWindowDays) {
      return { ok: false, reason: "This is a birthday coupon. Pick up around your birthday to use it." };
    }
  }

  let discount = coupon.type === "PERCENT" ? Math.round((base * coupon.value) / 100) : coupon.value;
  if (coupon.max_discount != null) discount = Math.min(discount, coupon.max_discount);
  discount = Math.min(discount, base);

  const shares = allocate(
    discount,
    ctx.items.map((item, i) => (eligible[i] ? item.rentalAmount : 0)),
  );
  return { ok: true, discount, perItem: shares, fundedBy: coupon.funded_by };
}

/**
 * Called inside the payment-confirmation transaction: one redemption row per
 * discounted booking. The limits above count these, so only paid holds use a
 * coupon up. `used_count` is kept in step for the admin list and the hard-delete guard.
 */
export async function recordRedemptions(client: PoolClient, groupId: string): Promise<void> {
  const { rowCount } = await client.query(
    `insert into coupon_redemptions (coupon_id, user_id, booking_group_id, booking_id, shop_id, discount_amount, funded_by)
     select g.coupon_id, g.user_id, g.id, b.id, v.shop_id, b.discount_amount, c.funded_by
       from booking_groups g
       join coupons c on c.id = g.coupon_id
       join bookings b on b.group_id = g.id and b.deleted_at is null and b.discount_amount > 0
       join vehicles v on v.id = b.vehicle_id
      where g.id = $1
     on conflict (booking_id) do nothing`,
    [groupId],
  );
  if (rowCount) {
    await client.query(
      `update coupons set used_count = used_count + 1 where id = (select coupon_id from booking_groups where id = $1)`,
      [groupId],
    );
  }
}
