import { afterAll, beforeAll, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createMerchant, createShop } from "../../../test/fixtures.ts";
import { getShopProfile } from "./shopProfileService.ts";

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

test("the public profile has the landmark and only published, live photos", async () => {
  const merchant = await createMerchant(pool);
  const shop = await createShop(pool, merchant.id);
  await pool.query(`update shops set landmark = 'Opposite SBI ATM' where id = $1`, [shop.id]);
  await pool.query(
    `insert into shop_media (shop_id, storage_key, published, display_order, deleted_at) values
       ($1, 'shown-2', true, 2, null), ($1, 'shown-1', true, 1, null),
       ($1, 'hidden', false, 0, null), ($1, 'deleted', true, 0, now())`,
    [shop.id],
  );
  const p = await getShopProfile(pool, shop.id);
  expect(p.landmark).toBe("Opposite SBI ATM");
  expect(p.photoKeys).toEqual(["shown-1", "shown-2"]);
});
