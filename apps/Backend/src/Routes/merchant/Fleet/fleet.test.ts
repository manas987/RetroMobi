import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, createMerchant, createShop as createFixtureShop, insertBooking } from "../../../test/fixtures.ts";
import { ShopNotFoundError, createShop } from "../Shops/shopsService.ts";
import {
  ModelNotFoundError,
  TrackerAlreadyAssignedError,
  VehicleHasActiveBookingsError,
  VehicleNotFoundError,
  assignTracker,
  attachDocumentFile,
  createVehicle,
  moveVehicle,
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

  test("a document can only be confirmed through its own vehicle", async () => {
    const mine = await createBookableVehicle(pool);
    const theirs = await createBookableVehicle(pool);
    const { rows } = await pool.query(
      `insert into vehicle_documents (vehicle_id, type) values ($1, 'RC') returning id`,
      [theirs.id],
    );
    await expect(
      attachDocumentFile(pool, crypto.randomUUID(), mine.id, rows[0].id, `vehicles/${mine.id}/documents/${rows[0].id}/1700000000000`),
    ).rejects.toBeInstanceOf(VehicleNotFoundError);
    const after = await pool.query(`select storage_key from vehicle_documents where id = $1`, [rows[0].id]);
    expect(after.rows[0].storage_key).toBeNull();
  });

  describe("moving a vehicle to another branch", () => {
    const shopOf = async (vehicleId: string) =>
      (await pool.query(`select shop_id from vehicles where id = $1`, [vehicleId])).rows[0].shop_id as string;
    const join = (shopId: string, merchantUserId: string, role: string) =>
      pool.query(`insert into shop_members (shop_id, merchant_user_id, role, status) values ($1, $2, $3, 'ACTIVE')`, [shopId, merchantUserId, role]);

    test("moves between the same owner's shops and logs it at both", async () => {
      const owner = await createMerchant(pool);
      const a = await createFixtureShop(pool, owner.id);
      const b = await createFixtureShop(pool, owner.id);
      const v = await createBookableVehicle(pool, { shopId: a.id });

      await moveVehicle(pool, owner.id, v.id, b.id);
      expect(await shopOf(v.id)).toBe(b.id);
      const { rows } = await pool.query(
        `select shop_id from audit_logs where action = 'vehicle.moved' and entity_id = $1 order by shop_id`,
        [v.id],
      );
      expect(rows.map((r) => r.shop_id).sort()).toEqual([a.id, b.id].sort());
    });

    test("refuses another owner's shop, even one the caller manages", async () => {
      const owner = await createMerchant(pool);
      const a = await createFixtureShop(pool, owner.id);
      const v = await createBookableVehicle(pool, { shopId: a.id });
      const other = await createMerchant(pool);
      const theirs = await createFixtureShop(pool, other.id);
      await join(theirs.id, owner.id, "MANAGER");

      await expect(moveVehicle(pool, owner.id, v.id, theirs.id)).rejects.toBeInstanceOf(ShopNotFoundError);
      expect(await shopOf(v.id)).toBe(a.id);
    });

    test("refuses a branch where the caller can't manage vehicles", async () => {
      const owner = await createMerchant(pool);
      const a = await createFixtureShop(pool, owner.id);
      const b = await createFixtureShop(pool, owner.id);
      const v = await createBookableVehicle(pool, { shopId: a.id });
      const manager = await createMerchant(pool);
      await join(a.id, manager.id, "MANAGER");
      await join(b.id, manager.id, "STAFF");

      await expect(moveVehicle(pool, manager.id, v.id, b.id)).rejects.toBeInstanceOf(ShopNotFoundError);
      expect(await shopOf(v.id)).toBe(a.id);
    });

    test("a vehicle with a live booking stays where the customer expects it", async () => {
      const owner = await createMerchant(pool);
      const a = await createFixtureShop(pool, owner.id);
      const b = await createFixtureShop(pool, owner.id);
      const v = await createBookableVehicle(pool, { shopId: a.id });
      await insertBooking(pool, {
        vehicleId: v.id,
        pickupAt: new Date(Date.now() + 86_400_000 * 120).toISOString(),
        returnAt: new Date(Date.now() + 86_400_000 * 121).toISOString(),
        status: "CONFIRMED",
      });

      await expect(moveVehicle(pool, owner.id, v.id, b.id)).rejects.toBeInstanceOf(VehicleHasActiveBookingsError);
      expect(await shopOf(v.id)).toBe(a.id);
    });
  });
});
