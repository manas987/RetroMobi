import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createMerchant, insertBooking, createBookableVehicle } from "../../../test/fixtures.ts";
import { ShopHasActiveBookingsError, createShop, listShops, softDeleteShop, updateShop } from "./shopsService.ts";

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

describe("merchant shops", () => {
  test("creating a shop makes the creator an OWNER member immediately", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id, {
      name: "Hilltop Rentals",
      addressLine1: "1 Mall Road",
      city: "Mussoorie",
      state: "Uttarakhand",
      pincode: "248179",
    });

    const shops = await listShops(pool, merchant.id);
    expect(shops).toHaveLength(1);
    expect(shops[0].id).toBe(shop.id);
    expect(shops[0].role).toBe("OWNER");
  });

  test("updating never touches verification_status even if asked", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id, {
      name: "A",
      addressLine1: "1 Road",
      city: "City",
      state: "State",
      pincode: "100001",
    });
    const updated = await updateShop(pool, merchant.id, shop.id, { name: "B" } as any);
    expect(updated.name).toBe("B");
    expect(updated.verification_status).toBe("UNVERIFIED");
  });

  test("a shop with a confirmed booking cannot be soft-deleted", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id, {
      name: "C",
      addressLine1: "1 Road",
      city: "City",
      state: "State",
      pincode: "100001",
    });
    const vehicle = await createBookableVehicle(pool, { shopId: shop.id });
    await insertBooking(pool, {
      vehicleId: vehicle.id,
      pickupAt: new Date(Date.now() + 86_400_000 * 100).toISOString(),
      returnAt: new Date(Date.now() + 86_400_000 * 101).toISOString(),
      status: "CONFIRMED",
    });

    await expect(softDeleteShop(pool, merchant.id, shop.id)).rejects.toBeInstanceOf(
      ShopHasActiveBookingsError,
    );
  });
});
