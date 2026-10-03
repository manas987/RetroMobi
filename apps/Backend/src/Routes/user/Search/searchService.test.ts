import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  createBookableVehicle,
  createMerchant,
  createModel,
  createShop,
  futureWindow,
  insertBooking,
} from "../../../test/fixtures.ts";
import { sweepExpiredHolds } from "../../../lib/holds.ts";
import { DistanceSortUnavailableError, searchVehicles } from "./searchService.ts";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

/** A city of its own, so results are never polluted by other tests' fixtures. */
async function isolatedCity() {
  const merchant = await createMerchant(pool);
  const shop = await createShop(pool, merchant.id);
  return { merchantId: merchant.id, shopId: shop.id, city: shop.city };
}

function vehicleIdsIn(results: Array<{ primaryOffer: { vehicleId: string } }>) {
  return results.map((r) => r.primaryOffer.vehicleId);
}

describe("searchVehicles", () => {
  test("returns an ACTIVE vehicle that is free for the window", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(500);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    expect(vehicleIdsIn(results)).toContain(v.id);
  });

  // The marketplace toggle. RetroMobi is a fleet system first.
  test("an INACTIVE vehicle never appears, however free it is", async () => {
    const { shopId, city } = await isolatedCity();
    const listed = await createBookableVehicle(pool, { shopId, status: "ACTIVE" });
    const unlisted = await createBookableVehicle(pool, { shopId, status: "INACTIVE" });
    const { pickupAt, returnAt } = futureWindow(510);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    const ids = vehicleIdsIn(results);
    expect(ids).toContain(listed.id);
    expect(ids).not.toContain(unlisted.id);
  });

  test("a vehicle booked for an overlapping window is excluded", async () => {
    const { shopId, city } = await isolatedCity();
    const free = await createBookableVehicle(pool, { shopId });
    const booked = await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(520);

    await insertBooking(pool, {
      vehicleId: booked.id,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
    });

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    const ids = vehicleIdsIn(results);
    expect(ids).toContain(free.id);
    expect(ids).not.toContain(booked.id);
  });

  test("a WALK-IN booking hides the vehicle from the marketplace too", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(530);

    await insertBooking(pool, {
      vehicleId: v.id,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      source: "OFFLINE",
    });

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    expect(vehicleIdsIn(results)).not.toContain(v.id);
  });

  test("a vehicle marked unavailable for the window is excluded", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(540);

    await pool.query(
      `insert into vehicle_unavailability (vehicle_id, start_at, end_at, reason)
       values ($1, $2, $3, 'SERVICE')`,
      [v.id, pickupAt.toISOString(), returnAt.toISOString()],
    );

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    expect(vehicleIdsIn(results)).not.toContain(v.id);
  });

  test("a booking outside the requested window does not hide the vehicle", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const booked = futureWindow(550, 2);
    const wanted = futureWindow(560, 2);

    await insertBooking(pool, {
      vehicleId: v.id,
      pickupAt: booked.pickupAt.toISOString(),
      returnAt: booked.returnAt.toISOString(),
    });

    const { results } = await searchVehicles(pool, {
      city,
      pickupAt: wanted.pickupAt,
      returnAt: wanted.returnAt,
    });
    expect(vehicleIdsIn(results)).toContain(v.id);
  });

  test("a soft-deleted booking does not hide the vehicle", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(570);

    const b = await insertBooking(pool, {
      vehicleId: v.id,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
    });
    await pool.query(`update bookings set deleted_at = now() where id = $1`, [b.id]);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    expect(vehicleIdsIn(results)).toContain(v.id);
  });
});

describe("grouping by model", () => {
  test("three vehicles of one model collapse to a single result", async () => {
    const { shopId, city } = await isolatedCity();
    const model = await createModel(pool);
    for (let i = 0; i < 3; i += 1) {
      await createBookableVehicle(pool, { shopId, modelId: model.id });
    }
    const { pickupAt, returnAt } = futureWindow(600);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    const forModel = results.filter((r) => r.model.id === model.id);

    expect(forModel).toHaveLength(1);
    expect(forModel[0]!.offerCount).toBe(3);
  });

  test("by default the primary offer is the cheapest one", async () => {
    const { shopId, city } = await isolatedCity();
    const model = await createModel(pool);
    await createBookableVehicle(pool, { shopId, modelId: model.id, amount: 90_000 });
    const cheapest = await createBookableVehicle(pool, {
      shopId,
      modelId: model.id,
      amount: 30_000,
    });
    const { pickupAt, returnAt } = futureWindow(610);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt, sort: "price" });
    const forModel = results.find((r) => r.model.id === model.id);

    expect(forModel?.primaryOffer.vehicleId).toBe(cheapest.id);
  });

  test("two models produce two results", async () => {
    const { shopId, city } = await isolatedCity();
    const a = await createModel(pool);
    const b = await createModel(pool);
    await createBookableVehicle(pool, { shopId, modelId: a.id });
    await createBookableVehicle(pool, { shopId, modelId: b.id });
    const { pickupAt, returnAt } = futureWindow(620);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });
});

describe("city matching", () => {
  test("is case-insensitive", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(700);

    const { results } = await searchVehicles(pool, {
      city: city.toUpperCase(),
      pickupAt,
      returnAt,
    });
    expect(vehicleIdsIn(results)).toContain(v.id);
  });

  test("an unknown city returns nothing rather than throwing", async () => {
    const { pickupAt, returnAt } = futureWindow(710);
    const { results } = await searchVehicles(pool, {
      city: "NowhereAtAll12345",
      pickupAt,
      returnAt,
    });
    expect(results).toHaveLength(0);
  });

  test("a vehicle in another city is not returned", async () => {
    const a = await isolatedCity();
    const b = await isolatedCity();
    const inB = await createBookableVehicle(pool, { shopId: b.shopId });
    const { pickupAt, returnAt } = futureWindow(720);

    const { results } = await searchVehicles(pool, { city: a.city, pickupAt, returnAt });
    expect(vehicleIdsIn(results)).not.toContain(inB.id);
  });
});

describe("distance", () => {
  test("distanceKm is null when the client sends no coordinates", async () => {
    const { shopId, city } = await isolatedCity();
    await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(800);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    expect(results[0]!.primaryOffer.distanceKm).toBeNull();
  });

  test("sorting by distance without coordinates is rejected", async () => {
    const { city } = await isolatedCity();
    const { pickupAt, returnAt } = futureWindow(810);

    await expect(
      searchVehicles(pool, { city, pickupAt, returnAt, sort: "distance" }),
    ).rejects.toBeInstanceOf(DistanceSortUnavailableError);
  });

  test("distanceKm is populated when coordinates are supplied", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id, { lat: 30.3165, lng: 78.0322 });
    await createBookableVehicle(pool, { shopId: shop.id });
    const { pickupAt, returnAt } = futureWindow(820);

    const { results } = await searchVehicles(pool, {
      city: shop.city,
      pickupAt,
      returnAt,
      lat: 30.3165,
      lng: 78.0322,
    });
    expect(results[0]!.primaryOffer.distanceKm).toBeLessThan(1);
  });
});

describe("pricing in results", () => {
  test("the offer carries a real total for the requested window", async () => {
    const { shopId, city } = await isolatedCity();
    await createBookableVehicle(pool, { shopId, amount: 45_000, weekendAmount: 60_000 });
    const { pickupAt, returnAt } = futureWindow(900, 3);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    const offer = results[0]!.primaryOffer;

    expect(offer.pricePerDay).toBeGreaterThan(0);
    expect(offer.totalAmount).toBeGreaterThanOrEqual(offer.pricePerDay);
  });
});

// Search itself performs NO writes -- it never sweeps or filters expired holds.
// A 30s timer in src/index.ts owns that, so search stays a pure read and can move
// to a replica. These tests drive the sweep explicitly rather than relying on the
// timer, so they never depend on wall-clock timing.
describe("expired holds", () => {
  async function placeHold(vehicleId: string, pickupAt: Date, returnAt: Date, expiresSql: string) {
    const user = await pool.query(
      `insert into users (phone) values ($1) returning id`,
      [`+9179${(Date.now() % 10_000_000).toString().padStart(7, "0")}`],
    );
    const group = await pool.query(
      `insert into booking_groups (user_id, hold_expires_at) values ($1, ${expiresSql}) returning id`,
      [user.rows[0].id],
    );
    const rider = await pool.query(
      `insert into riders (user_id, name) values ($1, 'Holder') returning id`,
      [user.rows[0].id],
    );
    await pool.query(
      `insert into bookings (group_id, rider_id, vehicle_id, source,
                             scheduled_pickup_at, scheduled_return_at, status)
       values ($1, $2, $3, 'ONLINE', $4, $5, 'HOLD')`,
      [group.rows[0].id, rider.rows[0].id, vehicleId, pickupAt.toISOString(), returnAt.toISOString()],
    );
  }

  test("an un-swept expired hold still hides the vehicle", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(1000);
    await placeHold(v.id, pickupAt, returnAt, "now() - interval '1 minute'");

    // Search does not reconcile expiry itself -- this is the accepted <=30s window.
    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    expect(vehicleIdsIn(results)).not.toContain(v.id);
  });

  test("once the sweep has run, the vehicle is listed again", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(1010);
    await placeHold(v.id, pickupAt, returnAt, "now() - interval '1 minute'");

    await sweepExpiredHolds(pool);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    expect(vehicleIdsIn(results)).toContain(v.id);
  });

  test("the sweep does not touch a live hold", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const { pickupAt, returnAt } = futureWindow(1020);
    await placeHold(v.id, pickupAt, returnAt, "now() + interval '9 minutes'");

    await sweepExpiredHolds(pool);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt });
    expect(vehicleIdsIn(results)).not.toContain(v.id);
  });
});
