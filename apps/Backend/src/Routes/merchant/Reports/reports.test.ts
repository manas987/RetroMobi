import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, createMerchant, createShop, insertBooking } from "../../../test/fixtures.ts";
import { shopSummary } from "./reportsService.ts";

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

// 10:00 IST on the given day, as an instant.
const ist = (day: string, hour = 10) => `${day}T${String(hour).padStart(2, "0")}:00:00+05:30`;

async function setup() {
  const merchant = await createMerchant(pool);
  const shop = await createShop(pool, merchant.id);
  const a = await createBookableVehicle(pool, { shopId: shop.id });
  const b = await createBookableVehicle(pool, { shopId: shop.id });
  return { merchant, shopId: shop.id, a, b };
}

describe("shop summary", () => {
  test("counts rentals by IST start day and source, ignoring HOLDs", async () => {
    const { shopId, a, b } = await setup();
    await insertBooking(pool, { vehicleId: a.id, pickupAt: ist("2031-03-02"), returnAt: ist("2031-03-03") });
    await insertBooking(pool, { vehicleId: b.id, pickupAt: ist("2031-03-02"), returnAt: ist("2031-03-02", 18), source: "OFFLINE" });
    await insertBooking(pool, { vehicleId: b.id, pickupAt: ist("2031-03-04"), returnAt: ist("2031-03-05"), status: "HOLD" });

    const s = await shopSummary(pool, shopId, { from: "2031-03-01", to: "2031-03-05" }, false);
    expect(s.rangeDays).toBe(5);
    expect(s.days.find((d) => d.date === "2031-03-02")).toEqual({ date: "2031-03-02", online: 1, walkin: 1 });
    expect(s.days.find((d) => d.date === "2031-03-04")).toEqual({ date: "2031-03-04", online: 0, walkin: 0 });
    expect(s.totals).toEqual({ online: 1, walkin: 1 });
    expect(s.money).toBeUndefined();
  });

  test("a booking just after midnight IST lands on the IST day, not the UTC one", async () => {
    const { shopId, a } = await setup();
    // 00:30 IST on the 10th is 19:00 UTC on the 9th.
    await insertBooking(pool, { vehicleId: a.id, pickupAt: "2031-04-10T00:30:00+05:30", returnAt: ist("2031-04-10", 20) });
    const s = await shopSummary(pool, shopId, { from: "2031-04-09", to: "2031-04-10" }, false);
    expect(s.days.map((d) => d.online)).toEqual([0, 1]);
  });

  test("busy days count every IST day a vehicle is out, clipped to the range", async () => {
    const { shopId, a, b } = await setup();
    // Out 28 May -> 3 June; the range is 1-5 June, so 3 busy days (1, 2, 3).
    await insertBooking(pool, { vehicleId: a.id, pickupAt: ist("2031-05-28"), returnAt: ist("2031-06-03") });
    const s = await shopSummary(pool, shopId, { from: "2031-06-01", to: "2031-06-05" }, false);
    expect(s.vehicles.find((v) => v.id === a.id)?.busyDays).toBe(3);
    expect(s.vehicles.find((v) => v.id === b.id)?.busyDays).toBe(0);
  });

  test("money appears only when asked for, from payouts and walk-in cash", async () => {
    const { merchant, shopId, a, b } = await setup();
    const online = await insertBooking(pool, { vehicleId: a.id, pickupAt: ist("2031-07-02"), returnAt: ist("2031-07-03") });
    const walkin = await insertBooking(pool, { vehicleId: b.id, pickupAt: ist("2031-07-02"), returnAt: ist("2031-07-02", 18), source: "OFFLINE" });
    const failed = await insertBooking(pool, { vehicleId: a.id, pickupAt: ist("2031-07-03"), returnAt: ist("2031-07-03", 18) });
    await pool.query(`update bookings set rental_amount = 80000 where id = $1`, [walkin.id]);
    await pool.query(
      `insert into payouts (merchant_user_id, booking_id, stage, amount, status)
       values ($1, $2, 'UPFRONT', 10000, 'PAID'), ($1, $2, 'BALANCE', 30000, 'PENDING'), ($1, $3, 'UPFRONT', 99999, 'FAILED')`,
      [merchant.id, online.id, failed.id],
    );

    const s = await shopSummary(pool, shopId, { from: "2031-07-01", to: "2031-07-03" }, true);
    expect(s.money).toEqual({ paid: 10000, pending: 30000, walkinCash: 80000 });
    const day = s.days.find((d) => d.date === "2031-07-02")!;
    expect(day.onlineEarnings).toBe(40000);
    expect(day.walkinCash).toBe(80000);

    const hidden = await shopSummary(pool, shopId, { from: "2031-07-01", to: "2031-07-03" }, false);
    expect(hidden.money).toBeUndefined();
    expect("onlineEarnings" in hidden.days[0]!).toBe(false);
  });

  test("all time starts at the shop's first rental", async () => {
    const { shopId, a } = await setup();
    await insertBooking(pool, { vehicleId: a.id, pickupAt: ist("2031-08-20"), returnAt: ist("2031-08-21") });
    await insertBooking(pool, { vehicleId: a.id, pickupAt: ist("2031-09-02"), returnAt: ist("2031-09-03") });

    const s = await shopSummary(pool, shopId, { to: "2031-09-05" }, false);
    expect(s.from).toBe("2031-08-20");
    expect(s.rangeDays).toBe(17);
    expect(s.totals.online).toBe(2);

    const empty = await setup();
    const none = await shopSummary(pool, empty.shopId, { to: "2031-09-05" }, false);
    expect(none.from).toBe("2031-09-05");
    expect(none.rangeDays).toBe(1);
  });

  test("each vehicle reports its rides and, for owners, what it earned", async () => {
    const { merchant, shopId, a, b } = await setup();
    const online = await insertBooking(pool, { vehicleId: a.id, pickupAt: ist("2031-10-02"), returnAt: ist("2031-10-03") });
    const walkin = await insertBooking(pool, { vehicleId: a.id, pickupAt: ist("2031-10-04"), returnAt: ist("2031-10-04", 18), source: "OFFLINE" });
    await pool.query(`update bookings set rental_amount = 50000 where id = $1`, [walkin.id]);
    await pool.query(
      `insert into payouts (merchant_user_id, booking_id, stage, amount, status)
       values ($1, $2, 'UPFRONT', 10000, 'PAID'), ($1, $2, 'BALANCE', 20000, 'FAILED')`,
      [merchant.id, online.id],
    );

    const s = await shopSummary(pool, shopId, { from: "2031-10-01", to: "2031-10-05" }, true);
    expect(s.vehicles.find((v) => v.id === a.id)).toMatchObject({ rides: 2, earnings: 60000 });
    expect(s.vehicles.find((v) => v.id === b.id)).toMatchObject({ rides: 0, earnings: 0 });

    const hidden = await shopSummary(pool, shopId, { from: "2031-10-01", to: "2031-10-05" }, false);
    expect("earnings" in hidden.vehicles[0]!).toBe(false);
  });
});
