import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { uniquePhone } from "../../../test/fixtures.ts";
import { CouponInUseError, createCoupon, hardDeleteCoupon } from "./couponsService.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("admin coupons", () => {
  test("coupon codes are uppercased, and a used coupon cannot be hard-deleted", async () => {
    const code = `summer${uniquePhone().slice(-6)}`;
    const coupon = await createCoupon(pool, "00000000-0000-0000-0000-000000000000", {
      code,
      type: "PERCENT",
      value: 10,
      validFrom: new Date(Date.now() - 86_400_000),
      validUntil: new Date(Date.now() + 86_400_000),
    });
    expect(coupon.code).toBe(code.toUpperCase());

    // Simulate the payment webhook incrementing used_count.
    await pool.query(`update coupons set used_count = 1 where id = $1`, [coupon.id]);

    await expect(hardDeleteCoupon(pool, "00000000-0000-0000-0000-000000000000", coupon.id)).rejects.toBeInstanceOf(
      CouponInUseError,
    );

    const { rows } = await pool.query(`select 1 from coupons where id = $1`, [coupon.id]);
    expect(rows).toHaveLength(1);
  });
});
