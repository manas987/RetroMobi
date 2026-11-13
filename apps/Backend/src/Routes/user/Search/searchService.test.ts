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
import { setMediaPublication } from "../../merchant/Fleet/fleetService.ts";
import {
  DistanceSortUnavailableError,
  getVehicleDetail,
  searchVehicles,
  VehicleNotFoundError,
} from "./searchService.ts";

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
    // Weekend rates set too: the fixture defaults both to the same weekend
    // price, so a window that lands on a weekend made this a coin toss.
    await createBookableVehicle(pool, { shopId, modelId: model.id, amount: 90_000, weekendAmount: 90_000 });
    const cheapest = await createBookableVehicle(pool, {
      shopId,
      modelId: model.id,
      amount: 30_000,
      weekendAmount: 30_000,
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

  test("the same model at two different shops produces two results, not one", async () => {
    const shopA = await isolatedCity();
    const shopB = await createShop(pool, (await createMerchant(pool)).id, { city: shopA.city });
    const model = await createModel(pool);
    await createBookableVehicle(pool, { shopId: shopA.shopId, modelId: model.id });
    await createBookableVehicle(pool, { shopId: shopB.id, modelId: model.id });
    const { pickupAt, returnAt } = futureWindow(630);

    const { results } = await searchVehicles(pool, { city: shopA.city, pickupAt, returnAt });
    const forModel = results.filter((r) => r.model.id === model.id);

    expect(forModel).toHaveLength(2);
    expect(forModel.every((r) => r.offerCount === 1)).toBe(true);
  });

  test("offerVehicleIds lists every unit in the group, ranked like primaryOffer", async () => {
    const { shopId, city } = await isolatedCity();
    const model = await createModel(pool);
    const cheap = await createBookableVehicle(pool, { shopId, modelId: model.id, amount: 20_000 });
    const pricey = await createBookableVehicle(pool, { shopId, modelId: model.id, amount: 80_000 });
    const { pickupAt, returnAt } = futureWindow(640);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt, sort: "price" });
    const forModel = results.find((r) => r.model.id === model.id)!;

    expect(forModel.offerVehicleIds).toEqual([cheap.id, pricey.id]);
  });
});

describe("shopId-scoped search", () => {
  test("returns only that shop's vehicles, across any city", async () => {
    const a = await isolatedCity();
    const b = await isolatedCity();
    const inA = await createBookableVehicle(pool, { shopId: a.shopId });
    const inB = await createBookableVehicle(pool, { shopId: b.shopId });
    const { pickupAt, returnAt } = futureWindow(650);

    const { results } = await searchVehicles(pool, { shopId: a.shopId, pickupAt, returnAt });
    const ids = vehicleIdsIn(results);
    expect(ids).toContain(inA.id);
    expect(ids).not.toContain(inB.id);
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

describe("licence", () => {
  test("a vehicle with no licence link is excluded from city and shop search and blocked on a direct link", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId, withLicence: false });
    const window = futureWindow(1100);

    expect((await searchVehicles(pool, { city, ...window })).results).toEqual([]);
    expect((await searchVehicles(pool, { shopId, ...window })).results).toEqual([]);
    expect(await getVehicleDetail(pool, v.id, window)).toMatchObject({ listingEligible: false, licence: null, quote: null });
  });

  test("a vehicle named on an ACTIVE shop licence reports it", async () => {
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id);
    const v = await createBookableVehicle(pool, { shopId: shop.id, withLicence: false });
    const { pickupAt, returnAt } = futureWindow(1110);

    const license = await pool.query(
      `insert into shop_licenses (merchant_user_id, licence_number, issuing_authority, expires_at, status)
       values ($1, 'UK14/RAM/2024/0001', 'ARTO Dehradun', '2030-01-01', 'ACTIVE') returning id`,
      [merchant.id],
    );
    await pool.query(
      `insert into license_vehicles (license_id, vehicle_id, registration_number) values ($1, $2, 'TEST-REG')`,
      [license.rows[0].id, v.id],
    );

    const { results } = await searchVehicles(pool, { city: shop.city, pickupAt, returnAt });
    expect(results[0]!.primaryOffer.licence).toEqual({
      licenceNumber: "UK14/RAM/2024/0001",
      issuingAuthority: "ARTO Dehradun",
      validUntil: "2030-01-01",
    });
  });

  test("a licence must be active and cover the full rental window", async () => {
    const { shopId, city } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const window = futureWindow(20);
    await pool.query(
      `update shop_licenses set status = 'PENDING'
        where id = (select license_id from license_vehicles where vehicle_id = $1)`,
      [v.id],
    );
    expect((await searchVehicles(pool, { city, ...window })).results).toEqual([]);
    await pool.query(
      `update shop_licenses set status = 'ACTIVE', expires_at = ($2::timestamptz at time zone 'Asia/Kolkata')::date
        where id = (select license_id from license_vehicles where vehicle_id = $1)`,
      [v.id, window.pickupAt],
    );
    expect((await searchVehicles(pool, { city, ...window })).results).toEqual([]);
  });
});

describe("fuelType filter", () => {
  test("excludes a model of the other fuel type", async () => {
    const { shopId, city } = await isolatedCity();
    const { rows } = await pool.query(
      `insert into vehicle_models (make, model, fuel_type) values ('Ather', $1, 'ELECTRIC') returning id`,
      [`450X${Date.now()}`],
    );
    await createBookableVehicle(pool, { shopId, modelId: rows[0].id });
    const { pickupAt, returnAt } = futureWindow(1130);

    const { results } = await searchVehicles(pool, { city, pickupAt, returnAt, fuelType: "PETROL" });
    expect(results).toHaveLength(0);
  });
});

describe("bodyType filter", () => {
  test("excludes a model of another body type and keeps a matching one", async () => {
    const { shopId, city } = await isolatedCity();
    const stamp = Date.now();
    const { rows: scooter } = await pool.query(
      `insert into vehicle_models (make, model, body_type) values ('Honda', $1, 'SCOOTER') returning id`,
      [`Activa${stamp}`],
    );
    const { rows: motorcycle } = await pool.query(
      `insert into vehicle_models (make, model, body_type) values ('Bajaj', $1, 'MOTORCYCLE') returning id`,
      [`Pulsar${stamp}`],
    );
    await createBookableVehicle(pool, { shopId, modelId: scooter[0].id });
    await createBookableVehicle(pool, { shopId, modelId: motorcycle[0].id });
    const { pickupAt, returnAt } = futureWindow(1140);

    const scooters = await searchVehicles(pool, { city, pickupAt, returnAt, bodyType: "SCOOTER" });
    expect(scooters.results).toHaveLength(1);
    expect(scooters.results[0]!.model.bodyType).toBe("SCOOTER");

    const both = await searchVehicles(pool, { city, pickupAt, returnAt, bodyType: "SCOOTER,MOTORCYCLE" });
    expect(both.results).toHaveLength(2);
  });
});

describe("getVehicleDetail", () => {
  test("only verified inventory is listed, but direct links return its booking eligibility", async () => {
    const { shopId, city } = await isolatedCity();
    const listed = await createBookableVehicle(pool, { shopId });
    const pending = await createBookableVehicle(pool, { shopId });
    const expired = await createBookableVehicle(pool, { shopId, withLicence: false });
    const otherMerchant = await createMerchant(pool);
    const unverifiedShop = await createShop(pool, otherMerchant.id, { city });
    const unverifiedShopVehicle = await createBookableVehicle(pool, { shopId: unverifiedShop.id });
    await pool.query("update vehicles set verification_status = 'PENDING' where id = $1", [pending.id]);
    await pool.query("update shops set verification_status = 'UNVERIFIED' where id = $1", [unverifiedShop.id]);
    await pool.query(
      `with licence as (
        insert into shop_licenses (merchant_user_id, licence_number, status, expires_at)
        select merchant_user_id, 'EXPIRED-TEST', 'ACTIVE', current_date - 1 from shops where id = $1 returning id
      ) insert into license_vehicles (license_id, vehicle_id, registration_number)
        select licence.id, v.id, v.registration_number from licence cross join vehicles v where v.id = $2`,
      [shopId, expired.id],
    );
    const window = futureWindow(25);
    const { results } = await searchVehicles(pool, { city, ...window });
    expect(results.map((result) => result.primaryOffer.vehicleId)).toEqual([listed.id]);
    for (const vehicle of [pending, expired, unverifiedShopVehicle]) {
      const detail = await getVehicleDetail(pool, vehicle.id, window);
      expect(detail.listingEligible).toBe(false);
      expect(detail.quote).toBeNull();
    }
    expect((await getVehicleDetail(pool, listed.id, window)).listingEligible).toBe(true);
  });

  test("detail uses the same special rate as Browse", async () => {
    const { shopId, city } = await isolatedCity();
    const vehicle = await createBookableVehicle(pool, { shopId });
    const window = { pickupAt: new Date("2029-01-06T04:30:00Z"), returnAt: new Date("2029-01-07T04:30:00Z") };
    await pool.query(
      `insert into special_pricings (vehicle_pricing_id, name, amount, weekend_amount, effective_from, effective_until)
       select id, 'Test weekend', 74000, 84000, '2029-01-06', '2029-01-07' from vehicle_pricing where vehicle_id = $1`,
      [vehicle.id],
    );
    const offer = (await searchVehicles(pool, { city, ...window })).results[0]!.primaryOffer;
    const detail = await getVehicleDetail(pool, vehicle.id, window);
    expect(detail.quote).toEqual({ pricePerDay: 84000, rentalAmount: 84000 });
    expect(detail.quote!.pricePerDay).toBe(offer.pricePerDay);
    expect(detail.datesAvailable).toBe(true);
  });

  test("returns pricing and shop identity for a real vehicle", async () => {
    const { shopId } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId, amount: 55_000 });

    const detail = await getVehicleDetail(pool, v.id);
    expect(detail.vehicleId).toBe(v.id);
    expect(detail.amount).toBe(55_000);
    expect(detail.shopId).toBe(shopId);
  });

  test("details include only published, current photos and available accessories", async () => {
    const { shopId } = await isolatedCity();
    const v = await createBookableVehicle(pool, { shopId });
    const lead = `vehicles/${v.id}/media/${crypto.randomUUID()}`;
    const second = `vehicles/${v.id}/media/${crypto.randomUUID()}`;
    const { rows } = await pool.query(
      `insert into vehicle_media (vehicle_id, storage_key, type, published, display_order, deleted_at)
       values ($1, $2, 'IMAGE', true, 2, null), ($1, $3, 'IMAGE', true, 1, null),
         ($1, 'private-document', 'IMAGE', false, 0, null), ($1, 'removed', 'IMAGE', true, 0, now()),
         ($1, 'video', 'VIDEO', false, 0, null)
       returning id, storage_key`,
      [v.id, second, lead],
    );
    await pool.query(
      `insert into vehicle_accessories (vehicle_id, type, quantity, status)
       values ($1, 'HELMET', 2, 'AVAILABLE'), ($1, 'TOP_BOX', 1, 'UNAVAILABLE')`,
      [v.id],
    );
    const detail = await getVehicleDetail(pool, v.id);
    expect(detail.photoKeys).toEqual([lead, second]);
    expect(detail.accessories).toEqual([{ type: "HELMET", quantity: 2 }]);
    expect(await setMediaPublication(pool, v.id, rows.find((row) => row.storage_key === "private-document").id, true)).toBe(false);
    await setMediaPublication(pool, v.id, rows.find((row) => row.storage_key === lead).id, false);
    expect((await getVehicleDetail(pool, v.id)).photoKeys).toEqual([second]);
    await pool.query("update vehicles set verification_status = 'PENDING' where id = $1", [v.id]);
    expect((await getVehicleDetail(pool, v.id)).photoKeys).toEqual([]);
  });

  test("throws for an unknown vehicle id", async () => {
    await expect(
      getVehicleDetail(pool, "00000000-0000-0000-0000-000000000000"),
    ).rejects.toBeInstanceOf(VehicleNotFoundError);
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
