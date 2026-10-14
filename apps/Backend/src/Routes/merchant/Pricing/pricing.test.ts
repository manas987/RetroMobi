import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle as createVehicleFixture, createMerchant, createRider, createUser, futureWindow } from "../../../test/fixtures.ts";
import { addSpecial, getPricing, softDeleteSpecial, upsertPricing } from "./pricingService.ts";
import { createHold as createHoldService } from "../../user/Bookings/bookingsService.ts";

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

describe("merchant pricing", () => {
  test("changing pricing after a booking exists does not rewrite that booking's snapshot", async () => {
    const merchant = await createMerchant(pool);
    const vehicle = await createVehicleFixture(pool, { amount: 50_000, weekendAmount: 70_000 });
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id);
    const { pickupAt, returnAt } = futureWindow(600, 1);

    const held = await createHoldService(pool, {
      userId: user.id,
      items: [{ vehicleId: vehicle.id, riderId: rider.id }],
      pickupAt,
      returnAt,
    });
    const rentalBefore = held.totals.rentalAmount;

    await upsertPricing(pool, merchant.id, vehicle.id, {
      amount: 999_999,
      weekendAmount: 999_999,
      securityDepositAmount: 0,
      lateFeeAmount: 0,
    });

    const { rows } = await pool.query(`select rental_amount from bookings where id = $1`, [
      held.bookings[0]!.id,
    ]);
    expect(Number(rows[0].rental_amount)).toBe(rentalBefore);
  });

  test("addSpecial then softDeleteSpecial removes it from getPricing", async () => {
    const merchant = await createMerchant(pool);
    const vehicle = await createVehicleFixture(pool);
    const special = await addSpecial(pool, merchant.id, vehicle.id, {
      name: "Diwali",
      amount: 80_000,
      weekendAmount: 90_000,
      effectiveFrom: "2030-01-01",
      effectiveUntil: "2030-01-05",
    });

    let pricing = await getPricing(pool, vehicle.id);
    expect(pricing.specials).toHaveLength(1);

    await softDeleteSpecial(pool, merchant.id, special.id);
    pricing = await getPricing(pool, vehicle.id);
    expect(pricing.specials).toHaveLength(0);
  });
});
