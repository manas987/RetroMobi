import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, uniquePhone, futureWindow } from "../../../test/fixtures.ts";
import { WalkinUnavailableError, createWalkinRental } from "./operationsService.ts";

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
