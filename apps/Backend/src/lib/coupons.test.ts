import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import { createBookableVehicle, createRider, createUser, futureWindow } from "../test/fixtures.ts";
import { CouponInvalidError, createHold } from "../Routes/user/Bookings/bookingsService.ts";
import { createPaymentIntent, handlePaymentWebhook } from "../Routes/user/Payments/paymentsService.ts";
import { ageAt, allocate, CouponConditionsSchema, daysFromBirthday } from "./coupons.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

const fakeCashfree = {
  createOrder: async (args: { orderId: string; amount: number; expiresAt: Date }) => ({
    orderId: args.orderId,
    paymentSessionId: `session_${args.orderId}`,
    expiresAt: args.expiresAt,
  }),
  refund: async () => ({ refundId: `rf_${Date.now()}`, status: "PENDING" as const }),
  getOrder: async (orderId: string) => ({ orderStatus: "PAID" as const, paymentSessionId: `session_${orderId}` }),
  verifyWebhookSignature: () => true,
};

// Near enough that the fixture rider's licence is still valid at pickup.
let offset = 200 + Math.floor(Math.random() * 300);
const nextWindow = (nights = 2) => futureWindow((offset += 7), nights);

async function coupon(fields: Record<string, unknown> = {}) {
  const code = `C${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e6)}`;
  const row = {
    code,
    type: "PERCENT",
    value: 10,
    valid_from: new Date(Date.now() - 86_400_000),
    valid_until: new Date(Date.now() + 3650 * 86_400_000),
    ...fields,
  };
  const keys = Object.keys(row);
  await pool.query(
    `insert into coupons (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
    keys.map((k) => {
      const v = (row as Record<string, unknown>)[k];
      return k === "conditions" ? JSON.stringify(v) : v;
    }),
  );
  return code;
}

async function customer(dob?: string) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id, dob ? { dob } : {});
  return { userId: user.id, riderId: rider.id };
}

/** Same price every day, so the expected numbers are easy to read. */
const vehicle = (opts: { shopId?: string; amount?: number } = {}) =>
  createBookableVehicle(pool, { amount: opts.amount ?? 50_000, weekendAmount: opts.amount ?? 50_000, shopId: opts.shopId });

async function hold(userId: string, items: Array<{ vehicleId: string; riderId: string }>, couponCode?: string, nights = 2) {
  const { pickupAt, returnAt } = nextWindow(nights);
  return createHold(pool, { userId, items, pickupAt, returnAt, couponCode });
}

async function pay(groupId: string, userId: string) {
  const intent = await createPaymentIntent(pool, { groupId, userId }, fakeCashfree);
  await handlePaymentWebhook(
    pool,
    { providerEventId: `evt_${groupId}`, type: "PAYMENT_SUCCESS", orderId: intent.orderId, payload: {} },
    fakeCashfree,
  );
}

describe("pure helpers", () => {
  test("allocate splits exactly and never above a rental", () => {
    expect(allocate(10_000, [30_000, 30_000, 30_000])).toEqual([3334, 3333, 3333]);
    expect(allocate(999, [100, 0, 50_000]).reduce((s, p) => s + p, 0)).toBe(999);
    expect(allocate(150, [100, 50])).toEqual([100, 50]);
    expect(allocate(0, [100])).toEqual([0]);
  });

  test("age and birthday are judged in IST, across the year boundary", () => {
    expect(ageAt(new Date("2000-06-15"), new Date("2026-06-14T12:00:00Z"))).toBe(25);
    expect(ageAt(new Date("2000-06-15"), new Date("2026-06-15T12:00:00Z"))).toBe(26);
    expect(daysFromBirthday(new Date("1990-01-02"), new Date("2026-12-30T06:00:00Z"))).toBe(3);
    expect(daysFromBirthday(new Date("1992-02-29"), new Date("2027-02-28T06:00:00Z"))).toBe(0);
  });

  test("an unknown rule is refused, not ignored", () => {
    expect(CouponConditionsSchema.safeParse({ firstBookingOnly: true }).success).toBe(true);
    expect(CouponConditionsSchema.safeParse({ firstBookingOnley: true }).success).toBe(false);
  });
});

describe("discount on a cart", () => {
  test("a FLAT coupon is taken once per cart, split across the scooters", async () => {
    const code = await coupon({ type: "FLAT", value: 10_000 });
    const { userId, riderId } = await customer();
    const r2 = await createRider(pool, userId);
    const [a, b] = [await vehicle(), await vehicle()];
    const held = await hold(userId, [
      { vehicleId: a.id, riderId },
      { vehicleId: b.id, riderId: r2.id },
    ], code);
    expect(held.totals.discountAmount).toBe(10_000);
  });

  test("PERCENT is capped by max_discount", async () => {
    const code = await coupon({ type: "PERCENT", value: 50, max_discount: 20_000 });
    const { userId, riderId } = await customer();
    const v = await vehicle();
    const held = await hold(userId, [{ vehicleId: v.id, riderId }], code);
    expect(held.totals.discountAmount).toBe(20_000);
  });

  test("a shop-scoped coupon discounts only that shop's scooters", async () => {
    const a = await vehicle();
    const b = await vehicle();
    const code = await coupon({ type: "PERCENT", value: 10, shop_ids: [a.shopId] });
    const { userId, riderId } = await customer();
    const r2 = await createRider(pool, userId);
    const held = await hold(userId, [
      { vehicleId: a.id, riderId },
      { vehicleId: b.id, riderId: r2.id },
    ], code);
    const { rows } = await pool.query(
      `select vehicle_id, discount_amount from bookings where group_id = $1`,
      [held.groupId],
    );
    expect(Number(rows.find((r) => r.vehicle_id === b.id).discount_amount)).toBe(0);
    expect(Number(rows.find((r) => r.vehicle_id === a.id).discount_amount)).toBeGreaterThan(0);
  });

  test("below the ticket size the coupon is refused with the amount needed", async () => {
    const code = await coupon({ min_order_amount: 500_000 });
    const { userId, riderId } = await customer();
    const v = await vehicle();
    await expect(hold(userId, [{ vehicleId: v.id, riderId }], code)).rejects.toThrow("₹5,000");
  });
});

describe("who qualifies", () => {
  test("first booking only", async () => {
    const code = await coupon({ conditions: { firstBookingOnly: true } });
    const { userId, riderId } = await customer();
    const first = await hold(userId, [{ vehicleId: (await vehicle()).id, riderId }]);
    await pay(first.groupId, userId);

    await expect(hold(userId, [{ vehicleId: (await vehicle()).id, riderId }], code)).rejects.toBeInstanceOf(
      CouponInvalidError,
    );
    const newcomer = await customer();
    const ok = await hold(newcomer.userId, [{ vehicleId: (await vehicle()).id, riderId: newcomer.riderId }], code);
    expect(ok.totals.discountAmount).toBeGreaterThan(0);
  });

  test("rider age range", async () => {
    const code = await coupon({ conditions: { minRiderAge: 18, maxRiderAge: 40 } });
    const young = await customer(`${new Date().getUTCFullYear() - 21}-01-01`);
    const older = await customer("1980-01-01");
    const ok = await hold(young.userId, [{ vehicleId: (await vehicle()).id, riderId: young.riderId }], code);
    expect(ok.totals.discountAmount).toBeGreaterThan(0);
    await expect(
      hold(older.userId, [{ vehicleId: (await vehicle()).id, riderId: older.riderId }], code),
    ).rejects.toThrow("age");
  });

  test("minimum rental days", async () => {
    const code = await coupon({ conditions: { minRentalDays: 3 } });
    const { userId, riderId } = await customer();
    await expect(hold(userId, [{ vehicleId: (await vehicle()).id, riderId }], code, 1)).rejects.toThrow("3 days");
  });

  test("per-user limit counts paid redemptions, not holds", async () => {
    const code = await coupon({ per_user_limit: 1 });
    const { userId, riderId } = await customer();
    // An unpaid hold does not use it up...
    await hold(userId, [{ vehicleId: (await vehicle()).id, riderId }], code);
    const paid = await hold(userId, [{ vehicleId: (await vehicle()).id, riderId }], code);
    await pay(paid.groupId, userId);
    // ...a paid one does.
    await expect(hold(userId, [{ vehicleId: (await vehicle()).id, riderId }], code)).rejects.toThrow(
      "already used",
    );
  });
});

describe("who pays for the discount", () => {
  async function paidWith(fundedBy: "PLATFORM" | "SHOP") {
    const v = await vehicle({ amount: 100_000 });
    const code = await coupon({
      type: "FLAT",
      value: 20_000,
      funded_by: fundedBy,
      shop_ids: fundedBy === "SHOP" ? [v.shopId] : null,
    });
    const { userId, riderId } = await customer();
    const held = await hold(userId, [{ vehicleId: v.id, riderId }], code, 1);
    await pay(held.groupId, userId);
    const { rows } = await pool.query(
      `select b.rental_amount, b.discount_amount, b.merchant_discount_amount,
              (select amount from payouts p where p.booking_id = b.id and p.stage = 'UPFRONT') as upfront,
              (select status from payouts p where p.booking_id = b.id and p.stage = 'UPFRONT') as upfront_status,
              (select count(*)::int from coupon_redemptions cr where cr.booking_id = b.id) as redemptions
         from bookings b where b.group_id = $1`,
      [held.groupId],
    );
    return rows[0];
  }

  test("PLATFORM: the shop is credited on its full price", async () => {
    const b = await paidWith("PLATFORM");
    const pct = Number(process.env.PAYOUT_UPFRONT_PCT ?? 10);
    expect(Number(b.merchant_discount_amount)).toBe(0);
    expect(Number(b.upfront)).toBe(Math.round((Number(b.rental_amount) * pct) / 100));
    expect(b.upfront_status).toBe("CREDITED");
    expect(b.redemptions).toBe(1);
  });

  test("SHOP: the shop is credited on the discounted price", async () => {
    const b = await paidWith("SHOP");
    const pct = Number(process.env.PAYOUT_UPFRONT_PCT ?? 10);
    expect(Number(b.merchant_discount_amount)).toBe(20_000);
    expect(Number(b.upfront)).toBe(Math.round(((Number(b.rental_amount) - 20_000) * pct) / 100));
  });

  test("a SHOP-funded coupon must name its shops", async () => {
    await expect(coupon({ funded_by: "SHOP" })).rejects.toThrow();
  });
});
