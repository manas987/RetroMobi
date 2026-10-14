import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, createMerchant, uniquePhone } from "../../../test/fixtures.ts";
import { createShop } from "../../merchant/Shops/shopsService.ts";
import { decideShop, decideVehicle, listVerificationQueue } from "./verificationService.ts";

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

describe("verification is never a gate", () => {
  test("rejecting a shop changes verification_status but leaves it OPEN and searchable", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id, {
      name: "A",
      addressLine1: "1 Road",
      city: "VerifyCity",
      state: "State",
      pincode: "100001",
    });

    await pool.query(`update shops set verification_status = 'PENDING' where id = $1`, [shop.id]);
    await decideShop(pool, "00000000-0000-0000-0000-000000000000", shop.id, { status: "REJECTED" });

    const { rows } = await pool.query(`select status, verification_status from shops where id = $1`, [
      shop.id,
    ]);
    expect(rows[0].verification_status).toBe("REJECTED");
    expect(rows[0].status).toBe("OPEN");
  });

  test("approving a vehicle does not change its ACTIVE/INACTIVE marketplace status", async () => {
    const vehicle = await createBookableVehicle(pool, { status: "ACTIVE" });
    await pool.query(`update vehicles set verification_status = 'PENDING' where id = $1`, [vehicle.id]);

    await decideVehicle(pool, "00000000-0000-0000-0000-000000000000", vehicle.id, { status: "VERIFIED" });

    const { rows } = await pool.query(`select status, verification_status from vehicles where id = $1`, [
      vehicle.id,
    ]);
    expect(rows[0].verification_status).toBe("VERIFIED");
    expect(rows[0].status).toBe("ACTIVE");
  });

  test("the queue only returns PENDING rows, oldest first", async () => {
    const merchant = await createMerchant(pool);
    const pending = await createShop(pool, merchant.id, {
      name: "Pending Shop",
      addressLine1: "1 Road",
      city: "QueueCity",
      state: "State",
      pincode: "100001",
    });
    await pool.query(`update shops set verification_status = 'PENDING' where id = $1`, [pending.id]);

    const queue = await listVerificationQueue(pool, "SHOP");
    expect(queue.map((r: any) => r.id)).toContain(pending.id);
    expect(queue.every((r: any, i: number, arr: any[]) => i === 0 || arr[i - 1].created_at <= r.created_at)).toBe(
      true,
    );
  });
});
