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
import { BookingNotCancellableError, cancelBooking, createHold, listMyBookings } from "./bookingsService.ts";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

/** The order's handover code, issued when it was paid. */
const handoverCodeOf = async (groupId: string) =>
  String((await pool.query("select handover_code from booking_groups where id = $1", [groupId])).rows[0].handover_code);

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
  // Cashfree says PAID, because these suites are about what happens AFTER
  // a payment -- confirmPaidOrder never asks the vendor itself.
  getOrder: async (orderId: string) => ({
    orderStatus: "PAID" as const,
    paymentSessionId: `session_${orderId}`,
  }),
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

test("pickup licence fallback is scoped, blocks handover until approved, and refunds one refused booking once", async () => {
  const { approvePickupLicence, assertHandoverAllowed, IdentityCheckMissingError } = await import("../../merchant/Operations/identityService.ts");
  const { createMerchant, createShop } = await import("../../../test/fixtures.ts");
  const previous = process.env.PICKUP_LICENCE_FALLBACK;
  process.env.PICKUP_LICENCE_FALLBACK = "true";
  try {
    const user = await createUser(pool);
    const merchant = await createMerchant(pool);
    const stranger = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id);
    const items = [];
    const sessions = [];
    for (let i = 0; i < 2; i++) {
      const rider = await createRider(pool, user.id, { verified: false });
      const vehicle = await createBookableVehicle(pool, { shopId: shop.id });
      const session = await pool.query(
        `insert into rider_verification_sessions (rider_id, user_id, method, provider, state, rejection_code, verification_id, policy_version, consent_text, consent_at, expires_at)
         values ($1, $2, 'DL_NUMBER', 'TEST', 'MANUAL_REVIEW_REQUIRED', $3, $4, 'v1', 'test consent', now(), now() + interval '1 day') returning id`,
        [rider.id, user.id, i === 0 ? "PROVIDER_OUTAGE" : "LICENCE_INVALID", crypto.randomUUID()],
      );
      sessions.push(session.rows[0].id);
      items.push({ vehicleId: vehicle.id, riderId: rider.id, pickupLicenceAccepted: true as const });
    }
    const window = futureWindow(40, 1);
    await expect(createHold(pool, { userId: user.id, items, ...window })).rejects.toThrow("not eligible");
    await pool.query("update rider_verification_sessions set rejection_code = 'PROVIDER_UNAVAILABLE' where id = $1", [sessions[1]]);
    await expect(createHold(pool, { userId: user.id, items, ...window })).rejects.toThrow("not eligible");
    await pool.query("update rider_verification_sessions set rejection_code = 'PROVIDER_OUTAGE' where id = $1", [sessions[1]]);
    await expect(createHold(pool, { userId: user.id, items: items.map(({ vehicleId, riderId }) => ({ vehicleId, riderId })), ...window })).rejects.toThrow("not eligible");
    const held = await createHold(pool, { userId: user.id, items, ...window });
    const refuseId = held.bookings[0]!.id;
    const approveId = held.bookings[1]!.id;
    await createPaymentIntent(pool, { groupId: held.groupId, userId: user.id }, fakeCashfree);
    await handlePaymentWebhook(pool, {
      providerEventId: `evt_pickup_licence_${held.groupId}`,
      type: "PAYMENT_SUCCESS", orderId: `order_${held.groupId}`, payload: {},
    }, fakeCashfree);

    const client = await pool.connect();
    try {
      await expect(assertHandoverAllowed(client, { bookingId: approveId, requireIdentityCheck: true })).rejects.toBeInstanceOf(IdentityCheckMissingError);
      const code = await handoverCodeOf(held.groupId);
      await expect(approvePickupLicence(pool, stranger.id, shop.id, approveId, code)).rejects.toThrow();
      await approvePickupLicence(pool, merchant.id, shop.id, approveId, code);
      await assertHandoverAllowed(client, { bookingId: approveId, requireIdentityCheck: true });
    } finally { client.release(); }

    const refusal = { merchantUserId: merchant.id, shopId: shop.id, reason: "MISSING" as const };
    await expect(cancelBooking(pool, { bookingId: approveId, refusal }, fakeCashfree)).rejects.toBeInstanceOf(BookingNotCancellableError);
    await expect(cancelBooking(pool, { bookingId: refuseId, refusal, now: new Date(window.pickupAt.getTime() - 1) }, fakeCashfree)).rejects.toThrow("between scheduled pickup and return");
    const listed = await listMyBookings(pool, user.id);
    expect(listed.find((row) => row.id === approveId)?.pickup_licence_checked).toBe(true);
    expect(listed.find((row) => row.id === refuseId)?.pickup_licence_checked).toBe(false);
    let refundCalls = 0;
    const provider = { ...fakeCashfree, refund: async (args: { refundId: string }) => {
      refundCalls++;
      return fakeCashfree.refund(args);
    } };
    const args = { bookingId: refuseId, refusal, now: window.pickupAt };
    const [first, retry] = await Promise.all([cancelBooking(pool, args, provider), cancelBooking(pool, args, provider)]);
    expect(first).toEqual(retry);
    expect(first.refundAmount).toBe(200_000);
    expect(refundCalls).toBe(1);
    const { rows } = await pool.query("select id, deleted_at, pickup_licence_ack_at from bookings where group_id = $1", [held.groupId]);
    expect(rows.filter((row) => row.deleted_at).map((row) => row.id)).toEqual([refuseId]);
    expect(rows.every((row) => row.pickup_licence_ack_at)).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.PICKUP_LICENCE_FALLBACK;
    else process.env.PICKUP_LICENCE_FALLBACK = previous;
  }
});

test("beta licence declaration: unverified riders book once both statements are ticked, and the shop checks at pickup", async () => {
  const { approvePickupLicence, assertHandoverAllowed, getIdentityForPickup, HandoverCodeInvalidError, IdentityCheckMissingError } = await import("../../merchant/Operations/identityService.ts");
  const { createMerchant, createShop } = await import("../../../test/fixtures.ts");
  const previous = process.env.ONLINE_LICENCE_CHECK;
  delete process.env.ONLINE_LICENCE_CHECK;
  try {
    const user = await createUser(pool);
    const other = await createUser(pool);
    const merchant = await createMerchant(pool);
    const shop = await createShop(pool, merchant.id);
    const rider = await createRider(pool, user.id, { verified: false });
    const strangersRider = await createRider(pool, other.id, { verified: false });
    const vehicle = await createBookableVehicle(pool, { shopId: shop.id });
    const window = futureWindow(45, 1);
    const licenceDeclaration = { validLicence: true, cancelIfMissing: true } as const;
    const items = [{ vehicleId: vehicle.id, riderId: rider.id }];

    await expect(createHold(pool, { userId: user.id, items, ...window })).rejects.toThrow("Confirm both licence statements");
    await expect(createHold(pool, { userId: user.id, items: [{ vehicleId: vehicle.id, riderId: strangersRider.id }], licenceDeclaration, ...window }))
      .rejects.toThrow("from your account");

    const held = await createHold(pool, { userId: user.id, items, licenceDeclaration, ...window });
    const bookingId = held.bookings[0]!.id;
    const { rows } = await pool.query("select pickup_licence_ack_at, pickup_verification_session_id from bookings where id = $1", [bookingId]);
    expect(rows[0].pickup_licence_ack_at).toBeTruthy();
    expect(rows[0].pickup_verification_session_id).toBeNull();
    const audit = await pool.query("select after from audit_logs where entity_id = $1 and action = 'booking.licence_declared'", [bookingId]);
    expect(audit.rows[0]?.after.terms).toHaveLength(2);

    await createPaymentIntent(pool, { groupId: held.groupId, userId: user.id }, fakeCashfree);
    await handlePaymentWebhook(pool, {
      providerEventId: `evt_declared_${held.groupId}`, type: "PAYMENT_SUCCESS", orderId: `order_${held.groupId}`, payload: {},
    }, fakeCashfree);
    expect((await getIdentityForPickup(pool, merchant.id, bookingId)).pickupLicenceRequired).toBe(true);
    const client = await pool.connect();
    try {
      await expect(assertHandoverAllowed(client, { bookingId, requireIdentityCheck: true })).rejects.toBeInstanceOf(IdentityCheckMissingError);
      // The licence alone is not enough: the customer's handover code must match.
      await expect(approvePickupLicence(pool, merchant.id, shop.id, bookingId, "000000")).rejects.toBeInstanceOf(HandoverCodeInvalidError);
      await expect(assertHandoverAllowed(client, { bookingId, requireIdentityCheck: true })).rejects.toBeInstanceOf(IdentityCheckMissingError);
      await approvePickupLicence(pool, merchant.id, shop.id, bookingId, await handoverCodeOf(held.groupId));
      await assertHandoverAllowed(client, { bookingId, requireIdentityCheck: true });
    } finally { client.release(); }
  } finally {
    if (previous === undefined) delete process.env.ONLINE_LICENCE_CHECK;
    else process.env.ONLINE_LICENCE_CHECK = previous;
  }
});
