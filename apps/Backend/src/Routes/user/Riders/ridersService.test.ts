// No test contract was provided for Riders (implementation.md lists it under
// "already written for you" only for pricing/permissions/bookings/payments/search).
// Added this one myself -- lazy/minimal, just pinning the two behaviours spelled
// out in backend.md's Riders table that are easy to get wrong silently: the
// delete-blocked-by-active-booking rule, and licence-record immutability.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  createBookableVehicle,
  createRider as createVerifiedRider,
  createUser,
  futureWindow,
} from "../../../test/fixtures.ts";
import { createHold } from "../Bookings/bookingsService.ts";
import {
  RiderHasActiveBookingError,
  createRider,
  deleteRider,
  listRiders,
  updateRider,
} from "./ridersService.ts";

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

describe("ridersService", () => {
  test("deleting a rider with a HOLD booking is rejected", async () => {
    const user = await createUser(pool);
    // The fixture's rider, not this module's createRider plus a hand-rolled
    // licence row: since the eligibility engine landed, booking needs a
    // verification session, an RTO status and a category that entitles the
    // rider to the vehicle's class. Hand-rolling that here would be a second
    // copy of the gate's requirements, drifting from fixtures.ts.
    const rider = await createVerifiedRider(pool, user.id);
    const vehicle = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(900);

    await createHold(pool, {
      userId: user.id,
      items: [{ vehicleId: vehicle.id, riderId: rider.id }],
      pickupAt,
      returnAt,
    });

    await expect(deleteRider(pool, user.id, rider.id)).rejects.toBeInstanceOf(
      RiderHasActiveBookingError,
    );
  });

  test("deleting a rider with no bookings soft-deletes them", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { name: "Lone Rider" });

    await deleteRider(pool, user.id, rider.id);

    const riders = await listRiders(pool, user.id);
    expect(riders.find((r: any) => r.id === rider.id)).toBeUndefined();
  });

  test("updating name/dob does not touch the licence verification", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { name: "Before Name" });
    await pool.query(
      `insert into driving_licence_verifications (rider_id, provider, licence_number, status, expires_on, verified_at)
       values ($1, 'TEST', 'DLTEST2', 'VERIFIED', '2035-01-01', now())`,
      [rider.id],
    );

    await updateRider(pool, user.id, rider.id, { name: "After Name" });

    const { rows } = await pool.query(
      `select status, licence_number from driving_licence_verifications where rider_id = $1`,
      [rider.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("VERIFIED");
    expect(rows[0].licence_number).toBe("DLTEST2");
  });
});
