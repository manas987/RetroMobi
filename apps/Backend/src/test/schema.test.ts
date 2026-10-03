import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import { createBookableVehicle, createRider, createUser, futureWindow, insertBooking } from "./fixtures.ts";

const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test" });
beforeAll(async () => { await applyMigrations(pool); });
afterAll(async () => { await pool.end(); });

describe("fixtures", () => {
  test("build a bookable vehicle and a rider", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id);
    const v = await createBookableVehicle(pool);
    expect(v.id).toBeTruthy();
    expect(rider.id).toBeTruthy();
  });

  test("the exclusion constraint actually rejects an overlap", async () => {
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(900);
    await insertBooking(pool, { vehicleId: v.id, pickupAt: pickupAt.toISOString(), returnAt: returnAt.toISOString() });
    await expect(
      insertBooking(pool, { vehicleId: v.id, pickupAt: pickupAt.toISOString(), returnAt: returnAt.toISOString() })
    ).rejects.toThrow();
  });

  test("a soft-deleted booking frees the slot", async () => {
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(910);
    const b = await insertBooking(pool, { vehicleId: v.id, pickupAt: pickupAt.toISOString(), returnAt: returnAt.toISOString() });
    await pool.query(`update bookings set deleted_at = now() where id = $1`, [b.id]);
    const again = await insertBooking(pool, { vehicleId: v.id, pickupAt: pickupAt.toISOString(), returnAt: returnAt.toISOString() });
    expect(again.id).toBeTruthy();
  });

  test("a walk-in booking needs no rider or group", async () => {
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(920);
    const b = await insertBooking(pool, { vehicleId: v.id, pickupAt: pickupAt.toISOString(), returnAt: returnAt.toISOString(), source: "OFFLINE" });
    expect(b.id).toBeTruthy();
  });
});
