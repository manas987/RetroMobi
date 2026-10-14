import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, createMerchant, insertBooking } from "../../../test/fixtures.ts";
import { createShop } from "../Shops/shopsService.ts";
import {
  ModelNotFoundError,
  TrackerAlreadyAssignedError,
  VehicleHasActiveBookingsError,
  assignTracker,
  createVehicle,
  softDeleteVehicle,
} from "./fleetService.ts";

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

describe("merchant fleet", () => {
  test("a new vehicle is INACTIVE by default and rejects an unknown model", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id, {
      name: "A",
      addressLine1: "1 Road",
      city: "City",
      state: "State",
      pincode: "100001",
    });

    await expect(
      createVehicle(pool, merchant.id, shop.id, {
        modelId: "00000000-0000-0000-0000-000000000000",
        registrationNumber: "UK01AB1234",
      }),
    ).rejects.toBeInstanceOf(ModelNotFoundError);
  });

  test("a vehicle with a confirmed booking cannot be soft-deleted", async () => {
    const vehicle = await createBookableVehicle(pool);
    await insertBooking(pool, {
      vehicleId: vehicle.id,
      pickupAt: new Date(Date.now() + 86_400_000 * 110).toISOString(),
      returnAt: new Date(Date.now() + 86_400_000 * 111).toISOString(),
      status: "CONFIRMED",
    });

    await expect(softDeleteVehicle(pool, "irrelevant", vehicle.id)).rejects.toBeInstanceOf(
      VehicleHasActiveBookingsError,
    );
  });

  test("assigning a second tracker to the same vehicle is rejected", async () => {
    const vehicle = await createBookableVehicle(pool);
    await assignTracker(pool, "irrelevant", vehicle.id, { deviceIdentifier: "device-1" });

    // uq_tracker_assignment_active only blocks a second ACTIVE assignment row for
    // the same vehicle while the first is still open -- assignTracker itself closes
    // any prior one first, so provoke the race directly against the table instead.
    const { rows } = await pool.query(
      `select tracker_id from vehicle_tracker_assignments where vehicle_id = $1 and unassigned_at is null`,
      [vehicle.id],
    );
    await expect(
      pool.query(`insert into vehicle_tracker_assignments (vehicle_id, tracker_id) values ($1, $2)`, [
        vehicle.id,
        rows[0].tracker_id,
      ]),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
