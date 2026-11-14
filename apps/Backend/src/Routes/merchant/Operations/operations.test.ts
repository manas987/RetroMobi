import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, insertBooking, uniquePhone, futureWindow } from "../../../test/fixtures.ts";
import { WalkinUnavailableError, createWalkinRental, listBookings } from "./operationsService.ts";

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

describe("merchant walk-in rentals", () => {
  test("a walk-in books the vehicle with no payment, deposit, or payout rows", async () => {
    const vehicle = await createBookableVehicle(pool, { amount: 50_000, depositAmount: 200_000 });
    const { pickupAt, returnAt } = futureWindow(700, 1);

    const result = await createWalkinRental(pool, {
      merchantUserId: "00000000-0000-0000-0000-000000000000",
      vehicleId: vehicle.id,
      walkinName: "Walk In Customer",
      walkinPhone: uniquePhone(),
      walkinDlNumber: "DL12345",
      pickupAt,
      returnAt,
    });

    const { rows: booking } = await pool.query(`select * from bookings where id = $1`, [result.id]);
    expect(booking[0].status).toBe("CONFIRMED");
    expect(booking[0].source).toBe("OFFLINE");
    expect(Number(booking[0].security_deposit_amount)).toBe(200_000);

    const { rows: payments } = await pool.query(`select 1 from payments where booking_group_id is null`);
    const { rows: deposits } = await pool.query(
      `select 1 from security_deposits where booking_id = $1`,
      [result.id],
    );
    const { rows: payouts } = await pool.query(`select 1 from payouts where booking_id = $1`, [result.id]);
    expect(deposits).toHaveLength(0);
    expect(payouts).toHaveLength(0);
  });

  test("an unlisted (INACTIVE) vehicle can still be rented as a walk-in", async () => {
    const vehicle = await createBookableVehicle(pool, { status: "INACTIVE" });
    const { pickupAt, returnAt } = futureWindow(710, 1);
    const result = await createWalkinRental(pool, {
      merchantUserId: "00000000-0000-0000-0000-000000000000",
      vehicleId: vehicle.id,
      walkinName: "Counter Customer",
      walkinPhone: uniquePhone(),
      walkinDlNumber: "DL999",
      pickupAt,
      returnAt,
    });
    expect(result.id).toBeTruthy();
  });

  test("double-booking the same vehicle window is rejected by the exclusion constraint", async () => {
    const vehicle = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(710, 1);

    await createWalkinRental(pool, {
      merchantUserId: "00000000-0000-0000-0000-000000000000",
      vehicleId: vehicle.id,
      walkinName: "First",
      walkinPhone: uniquePhone(),
      walkinDlNumber: "DL1",
      pickupAt,
      returnAt,
    });

    await expect(
      createWalkinRental(pool, {
        merchantUserId: "00000000-0000-0000-0000-000000000000",
        vehicleId: vehicle.id,
        walkinName: "Second",
        walkinPhone: uniquePhone(),
        walkinDlNumber: "DL2",
        pickupAt,
        returnAt,
      }),
    ).rejects.toBeInstanceOf(WalkinUnavailableError);
  });
});

describe("merchant bookings list filters", () => {
  test("a date range returns bookings that overlap it, not only those starting inside it", async () => {
    const v = await createBookableVehicle(pool);
    const before = await insertBooking(pool, { vehicleId: v.id, pickupAt: "2032-01-28T10:00:00+05:30", returnAt: "2032-02-02T10:00:00+05:30" });
    const inside = await insertBooking(pool, { vehicleId: v.id, pickupAt: "2032-02-10T10:00:00+05:30", returnAt: "2032-02-11T10:00:00+05:30" });
    await insertBooking(pool, { vehicleId: v.id, pickupAt: "2032-01-10T10:00:00+05:30", returnAt: "2032-01-11T10:00:00+05:30" });

    const rows = await listBookings(pool, v.shopId, {
      from: new Date("2032-02-01T00:00:00+05:30"),
      to: new Date("2032-02-29T23:59:59+05:30"),
    });
    expect(rows.map((r) => r.id).sort()).toEqual([before.id, inside.id].sort());
  });

  test("search matches a plate typed without spaces, and source narrows to walk-ins", async () => {
    const v = await createBookableVehicle(pool);
    const iso = (w: { pickupAt: Date; returnAt: Date }) => ({ pickupAt: w.pickupAt.toISOString(), returnAt: w.returnAt.toISOString() });
    const walkin = await insertBooking(pool, { vehicleId: v.id, ...iso(futureWindow(200, 1)), source: "OFFLINE" });
    await insertBooking(pool, { vehicleId: v.id, ...iso(futureWindow(210, 1)) });
    const { rows } = await pool.query(`select registration_number from vehicles where id = $1`, [v.id]);

    expect((await listBookings(pool, v.shopId, { q: rows[0].registration_number })).length).toBe(2);
    expect((await listBookings(pool, v.shopId, { source: "OFFLINE" })).map((r) => r.id)).toEqual([walkin.id]);
    expect((await listBookings(pool, v.shopId, { q: "100%_" })).length).toBe(0);
  });

  test("id_checked says whether the shop has checked the rider's ID", async () => {
    const v = await createBookableVehicle(pool);
    const iso = (w: { pickupAt: Date; returnAt: Date }) => ({ pickupAt: w.pickupAt.toISOString(), returnAt: w.returnAt.toISOString() });
    const b = await insertBooking(pool, { vehicleId: v.id, ...iso(futureWindow(220, 1)) });
    expect((await listBookings(pool, v.shopId, {}))[0].id_checked).toBe(false);

    await pool.query(
      `insert into pickup_identity_checks (booking_id, rider_id, checked_by, photo_matched, physical_dl_seen)
       select b.id, b.rider_id, s.merchant_user_id, true, true
         from bookings b join vehicles v on v.id = b.vehicle_id join shops s on s.id = v.shop_id where b.id = $1`,
      [b.id],
    );
    expect((await listBookings(pool, v.shopId, {}))[0].id_checked).toBe(true);
  });
});
