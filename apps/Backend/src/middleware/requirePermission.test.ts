import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Request } from "express";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import { createBookableVehicle, createMerchant, createShop } from "../test/fixtures.ts";
import { resolveShopId } from "./requirePermission.ts";

const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

const req = (params: Record<string, string>, body: Record<string, unknown> = {}) =>
  ({ params, body, query: {} }) as unknown as Request;

describe("resolveShopId", () => {
  test("a vehicle resolves to its own shop", async () => {
    const v = await createBookableVehicle(pool);
    expect(await resolveShopId(pool, req({}, { vehicleId: v.id }))).toBe(v.shopId);
  });

  test("naming your own shop next to another shop's vehicle is refused", async () => {
    const victim = await createBookableVehicle(pool);
    const attacker = await createMerchant(pool);
    const attackerShop = await createShop(pool, attacker.id);
    // The walk-in route: no :shopId, scope comes from the body.
    expect(await resolveShopId(pool, req({}, { shopId: attackerShop.id, vehicleId: victim.id }))).toBeNull();
    expect(await resolveShopId(pool, req({ shopId: attackerShop.id }, { vehicleId: victim.id }))).toBeNull();
  });

  test("hints that agree still resolve", async () => {
    const v = await createBookableVehicle(pool);
    expect(await resolveShopId(pool, req({ shopId: v.shopId }, { vehicleId: v.id }))).toBe(v.shopId);
  });
});
