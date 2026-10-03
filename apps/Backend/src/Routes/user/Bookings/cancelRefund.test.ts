// Covers the money side of cancellation, which `bookingsService.test.ts` (a
// locked contract file) does not reach: its fixtures flip a booking to CONFIRMED
// without ever creating a payment, so the refund and payout-top-up branches never
// ran. Those two branches were missing entirely on the first pass -- a cancelled
// booking recorded a refund_amount and returned no money.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, createRider, createUser, futureWindow } from "../../../test/fixtures.ts";
import { createPaymentIntent, handlePaymentWebhook } from "../Payments/paymentsService.ts";
import { BookingNotCancellableError, cancelBooking, createHold } from "./bookingsService.ts";

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
  refund: async (args: { refundId: string }) => ({ refundId: args.refundId, status: "PENDING" as const }),
  transfer: async () => ({ transferId: `tr_${Date.now()}`, status: "PENDING" as const }),
  verifyWebhookSignature: () => true,
};

/** A booking that has genuinely been paid for: real payment row, UPFRONT payout, deposit HELD. */
async function paidBooking(dayOffset: number) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id);
  const vehicle = await createBookableVehicle(pool, { amount: 100_000, weekendAmount: 100_000 });
  const { pickupAt, returnAt } = futureWindow(dayOffset, 1);

  const held = await createHold(pool, {
    userId: user.id,
    items: [{ vehicleId: vehicle.id, riderId: rider.id }],
    pickupAt,
    returnAt,
  });
  await createPaymentIntent(pool, { groupId: held.groupId, userId: user.id }, fakeCashfree);
  await handlePaymentWebhook(
    pool,
    {
      providerEventId: `evt_cancel_${held.groupId}`,
      type: "PAYMENT_SUCCESS",
      orderId: `order_${held.groupId}`,
      payload: {},
    },
    fakeCashfree,
  );

  return { userId: user.id, bookingId: held.bookings[0]!.id, groupId: held.groupId, pickupAt };
}

describe("cancelBooking refunds", () => {
  test("a paid cancellation actually issues a refund and links it to the cancellation row", async () => {
    const b = await paidBooking(400);

    const result = await cancelBooking(pool, { userId: b.userId, bookingId: b.bookingId }, fakeCashfree);

    expect(result.refundAmount).toBeGreaterThan(0);
    expect(result.refundId).not.toBeNull();

    const { rows: refunds } = await pool.query(
      `select amount, reason, status, provider_ref from refunds where booking_id = $1`,
      [b.bookingId],
    );
    expect(refunds).toHaveLength(1);
    expect(Number(refunds[0].amount)).toBe(result.refundAmount);
    expect(refunds[0].reason).toBe("CANCELLATION");
    expect(refunds[0].provider_ref).toBe(`cancel_${b.bookingId}`);

    const { rows: cancellations } = await pool.query(
      `select refund_id from booking_cancellations where booking_id = $1`,
      [b.bookingId],
    );
    expect(cancellations[0].refund_id).toBe(result.refundId);
  });

  test("refusing to refund without a provider is better than silently not refunding", async () => {
    const b = await paidBooking(410);
    await expect(cancelBooking(pool, { userId: b.userId, bookingId: b.bookingId })).rejects.toThrow();

    // The transaction rolled back, so the booking is still live and refundable.
    const { rows } = await pool.query(`select deleted_at from bookings where id = $1`, [b.bookingId]);
    expect(rows[0].deleted_at).toBeNull();
  });

  // >24h out: penalty is 10%, which is exactly what UPFRONT already paid, so the
  // merchant is square and no top-up row should appear.
  test("no CANCELLATION payout when the penalty only covers what was already paid", async () => {
    const b = await paidBooking(420);
    await cancelBooking(pool, { userId: b.userId, bookingId: b.bookingId }, fakeCashfree);

    const { rows } = await pool.query(
      `select stage from payouts where booking_id = $1 order by stage`,
      [b.bookingId],
    );
    expect(rows.map((r) => r.stage)).toEqual(["UPFRONT"]);
  });

  // 2-24h out: penalty jumps to 50% while UPFRONT only paid 10%, so the merchant
  // is owed the 40% difference. Never a clawback, only a top-up.
  test("a late cancellation tops the merchant up to the penalty they are owed", async () => {
    const b = await paidBooking(430);
    const twelveHoursBefore = new Date(b.pickupAt.getTime() - 12 * 60 * 60 * 1000);

    await cancelBooking(
      pool,
      { userId: b.userId, bookingId: b.bookingId, now: twelveHoursBefore },
      fakeCashfree,
    );

    const { rows } = await pool.query(
      `select stage, amount from payouts where booking_id = $1`,
      [b.bookingId],
    );
    const upfront = rows.find((r) => r.stage === "UPFRONT")!;
    const topUp = rows.find((r) => r.stage === "CANCELLATION");

    expect(topUp).toBeDefined();

    const { rows: bookingRows } = await pool.query(`select rental_amount from bookings where id = $1`, [
      b.bookingId,
    ]);
    const penalty = Math.round((Number(bookingRows[0].rental_amount) * 50) / 100);
    expect(Number(upfront.amount) + Number(topUp!.amount)).toBe(penalty);
  });

  test("a picked-up booking can no longer be cancelled", async () => {
    const b = await paidBooking(440);
    await pool.query(`update bookings set actual_pickup_at = now() where id = $1`, [b.bookingId]);

    await expect(
      cancelBooking(pool, { userId: b.userId, bookingId: b.bookingId }, fakeCashfree),
    ).rejects.toBeInstanceOf(BookingNotCancellableError);
  });
});
