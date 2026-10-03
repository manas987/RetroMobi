// No test contract provided for Pickup (not in implementation.md's locked list).
// Minimal self-check for the two real money-moving behaviours: BALANCE payout
// release at pickup-confirm, and deposit refund + RELEASED on a clean return.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, createRider, createUser, futureWindow } from "../../../test/fixtures.ts";
import { createHold } from "../Bookings/bookingsService.ts";
import { createPaymentIntent, handlePaymentWebhook } from "../Payments/paymentsService.ts";
import { confirmInspection, merchantReturn } from "./pickupService.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

const fakeCashfree = {
  createOrder: async (args: { orderId: string; amount: number; expiresAt: Date }) => ({
    orderId: args.orderId,
    paymentSessionId: `session_${args.orderId}`,
    expiresAt: args.expiresAt,
  }),
  refund: async () => ({ refundId: `rf_${Date.now()}`, status: "PENDING" as const }),
  transfer: async () => ({ transferId: `tr_${Date.now()}`, status: "PENDING" as const }),
  verifyWebhookSignature: () => true,
};

async function confirmedBookingWithPayment(dayOffset: number) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id);
  const vehicle = await createBookableVehicle(pool);
  const { pickupAt, returnAt } = futureWindow(dayOffset);

  const held = await createHold(pool, {
    userId: user.id,
    items: [{ vehicleId: vehicle.id, riderId: rider.id }],
    pickupAt,
    returnAt,
  });
  const intent = await createPaymentIntent(pool, { groupId: held.groupId, userId: user.id }, fakeCashfree);
  await handlePaymentWebhook(
    pool,
    { providerEventId: `evt_${Date.now()}_${Math.random()}`, type: "PAYMENT_SUCCESS", orderId: intent.orderId, payload: {} },
    fakeCashfree,
  );

  const { rows } = await pool.query(`select shop_id from vehicles where id = $1`, [vehicle.id]);
  return { userId: user.id, bookingId: held.bookings[0]!.id, groupId: held.groupId, shopId: rows[0].shop_id };
}

describe("confirmInspection", () => {
  test("sets actual_pickup_at and releases the BALANCE payout", async () => {
    const b = await confirmedBookingWithPayment(2000);

    await confirmInspection(pool, { userId: b.userId, bookingId: b.bookingId, storageKey: "k1" });

    const { rows } = await pool.query(`select actual_pickup_at from bookings where id = $1`, [b.bookingId]);
    expect(rows[0].actual_pickup_at).not.toBeNull();

    const payouts = await pool.query(
      `select stage from payouts where booking_id = $1 order by stage`,
      [b.bookingId],
    );
    expect(payouts.rows.map((r) => r.stage).sort()).toEqual(["BALANCE", "UPFRONT"]);
  });
});

describe("merchantReturn", () => {
  test("claim:false releases the deposit", async () => {
    const b = await confirmedBookingWithPayment(2010);
    const merchant = await pool.query(`select merchant_user_id from shops where id = $1`, [b.shopId]);

    await merchantReturn(
      pool,
      { merchantUserId: merchant.rows[0].merchant_user_id, bookingId: b.bookingId, claim: false },
      fakeCashfree,
      async () => ({ id: "unused", assignedTo: null }),
    );

    const deposit = await pool.query(`select status from security_deposits where booking_id = $1`, [
      b.bookingId,
    ]);
    expect(deposit.rows[0].status).toBe("RELEASED");

    const booking = await pool.query(`select status, actual_return_at from bookings where id = $1`, [
      b.bookingId,
    ]);
    expect(booking.rows[0].status).toBe("COMPLETED");
    expect(booking.rows[0].actual_return_at).not.toBeNull();
  });

  test("claim:true opens a ticket and leaves the deposit HELD", async () => {
    const b = await confirmedBookingWithPayment(2020);
    const merchant = await pool.query(`select merchant_user_id from shops where id = $1`, [b.shopId]);

    const result = await merchantReturn(
      pool,
      { merchantUserId: merchant.rows[0].merchant_user_id, bookingId: b.bookingId, claim: true, reason: "scratch", amount: 500 },
      fakeCashfree,
      async () => ({ id: "ticket-1", assignedTo: null }),
    );

    expect(result.ticketId).toBe("ticket-1");
    const deposit = await pool.query(`select status from security_deposits where booking_id = $1`, [
      b.bookingId,
    ]);
    expect(deposit.rows[0].status).toBe("HELD");
  });
});
