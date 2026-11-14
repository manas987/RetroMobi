import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createMerchant, insertBooking, createBookableVehicle } from "../../../test/fixtures.ts";
import { ForeignStorageKeyError } from "../../../lib/storage.ts";
import {
  ShopHasActiveBookingsError,
  ShopOtherStateError,
  addShopMedia,
  attachShopDocumentFile,
  createShop,
  createShopDocument,
  listShopDocuments,
  listShopMedia,
  listShops,
  reorderShopMedia,
  softDeleteShop,
  softDeleteShopDocument,
  softDeleteShopMedia,
  updateShop,
} from "./shopsService.ts";

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

const base = { name: "S", addressLine1: "1 Road", city: "Dehradun", pincode: "248001" };

describe("shop page", () => {
  test("a second shop must be in the same state as the first", async () => {
    const merchant = await createMerchant(pool);
    const first = await createShop(pool, merchant.id, { ...base, state: "Uttarakhand" });
    await expect(createShop(pool, merchant.id, { ...base, state: "Delhi" })).rejects.toBeInstanceOf(ShopOtherStateError);
    const second = await createShop(pool, merchant.id, { ...base, state: " uttarakhand " });
    await expect(updateShop(pool, merchant.id, second.id, { state: "Delhi" })).rejects.toBeInstanceOf(ShopOtherStateError);
    await softDeleteShop(pool, merchant.id, second.id);
    // With one shop left, moving it to another state is fine.
    const moved = await updateShop(pool, merchant.id, first.id, { state: "Delhi" });
    expect(moved.state).toBe("Delhi");
  });

  test("landmark round-trips through create and update", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id, { ...base, state: "Uttarakhand", landmark: "Opposite SBI ATM" });
    expect(shop.landmark).toBe("Opposite SBI ATM");
    expect((await updateShop(pool, merchant.id, shop.id, { landmark: "Near the clock tower" })).landmark).toBe("Near the clock tower");
  });

  test("a shop paper only takes its own upload, goes back to PENDING, and can be removed", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id, { ...base, state: "Uttarakhand" });
    const other = await createShop(pool, merchant.id, { ...base, state: "Uttarakhand" });
    const doc = await createShopDocument(pool, merchant.id, shop.id, { type: "SHOP_ACT" });
    await expect(attachShopDocumentFile(pool, merchant.id, shop.id, doc.id, `shops/${other.id}/documents/${doc.id}/1700000000000`))
      .rejects.toBeInstanceOf(ForeignStorageKeyError);
    await pool.query(`update shop_documents set status = 'REJECTED' where id = $1`, [doc.id]);
    const attached = await attachShopDocumentFile(pool, merchant.id, shop.id, doc.id, `shops/${shop.id}/documents/${doc.id}/1700000000000`);
    expect(attached.status).toBe("PENDING");
    await softDeleteShopDocument(pool, merchant.id, shop.id, doc.id);
    expect(await listShopDocuments(pool, shop.id)).toEqual([]);
  });

  test("shop photos: add, reorder, delete; another shop's key is refused", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id, { ...base, state: "Uttarakhand" });
    const other = await createShop(pool, merchant.id, { ...base, state: "Uttarakhand" });
    const key = (id: string) => `shops/${id}/media/${crypto.randomUUID()}`;
    await expect(addShopMedia(pool, merchant.id, shop.id, { storageKey: key(other.id) })).rejects.toBeInstanceOf(ForeignStorageKeyError);
    const a = await addShopMedia(pool, merchant.id, shop.id, { storageKey: key(shop.id) });
    const b = await addShopMedia(pool, merchant.id, shop.id, { storageKey: key(shop.id), displayOrder: 1 });
    await reorderShopMedia(pool, shop.id, [{ id: a.id, displayOrder: 1 }, { id: b.id, displayOrder: 0 }]);
    expect((await listShopMedia(pool, shop.id)).map((m: { id: string }) => m.id)).toEqual([b.id, a.id]);
    await softDeleteShopMedia(pool, merchant.id, shop.id, a.id);
    expect(await listShopMedia(pool, shop.id)).toHaveLength(1);
  });
});
