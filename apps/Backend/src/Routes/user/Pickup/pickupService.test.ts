// No test contract provided for Pickup (not in implementation.md's locked list).
// Minimal self-check for the two real money-moving behaviours: BALANCE payout
// release at pickup-confirm, and deposit refund + RELEASED on a clean return.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  createBookableVehicle,
  createMerchant,
  createRider,
  createUser,
  futureWindow,
  insertBooking,
  passIdentityCheck,
} from "../../../test/fixtures.ts";
import { createHold } from "../Bookings/bookingsService.ts";
import { createPaymentIntent, handlePaymentWebhook } from "../Payments/paymentsService.ts";
import {
  BookingNotReturnableError,
  ClaimExceedsDepositError,
  confirmInspection,
  merchantReturn,
  WalkinClaimError,
} from "./pickupService.ts";

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
  // Cashfree says PAID, because these suites are about what happens AFTER
  // a payment -- confirmPaidOrder never asks the vendor itself.
  getOrder: async (orderId: string) => ({
    orderStatus: "PAID" as const,
    paymentSessionId: `session_${orderId}`,
  }),
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

  // Handover now requires the shop staff to have confirmed the rider's
  // identity first -- that check is the only thing binding a human to a
  // licence since automated face matching was dropped.
  await passIdentityCheck(pool, held.bookings[0]!.id);

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

/** A booking that has actually been collected — the only kind that can be returned. */
async function pickedUpBooking(dayOffset: number) {
  const b = await confirmedBookingWithPayment(dayOffset);
  await confirmInspection(pool, { userId: b.userId, bookingId: b.bookingId, storageKey: `k_${dayOffset}` });
  const merchant = await pool.query(`select merchant_user_id from shops where id = $1`, [b.shopId]);
  return { ...b, merchantUserId: merchant.rows[0].merchant_user_id as string };
}

describe("merchantReturn", () => {
  test("claim:false releases the deposit", async () => {
    const b = await pickedUpBooking(2010);

    const result = await merchantReturn(
      pool,
      { merchantUserId: b.merchantUserId, bookingId: b.bookingId, claim: false },
      fakeCashfree,
      async () => ({ id: "unused", assignedTo: null }),
    );
    // The merchant's screen reads this out to the customer before they leave.
    expect(result.depositReleased).toBeGreaterThan(0);

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

  test("claim:true opens a ticket and marks the deposit CLAIMED", async () => {
    const b = await pickedUpBooking(2020);

    const result = await merchantReturn(
      pool,
      { merchantUserId: b.merchantUserId, bookingId: b.bookingId, claim: true, reason: "scratch", amount: 500 },
      fakeCashfree,
      async () => ({ id: "ticket-1", assignedTo: null }),
    );

    expect(result.ticketId).toBe("ticket-1");
    // CLAIMED, not HELD -- this is what Phase 16's settleDeposit looks for to
    // distinguish a raised claim from a deposit nobody has touched.
    const deposit = await pool.query(`select status from security_deposits where booking_id = $1`, [
      b.bookingId,
    ]);
    expect(deposit.rows[0].status).toBe("CLAIMED");
  });

  // The whole point of the return being final: the merchant cannot find damage
  // an hour later and claim against a deposit that is already on its way back.
  test("a clean return cannot be followed by a claim", async () => {
    const b = await pickedUpBooking(2030);
    const args = { merchantUserId: b.merchantUserId, bookingId: b.bookingId };
    const ticket = async () => ({ id: "ticket-late", assignedTo: null });

    await merchantReturn(pool, { ...args, claim: false }, fakeCashfree, ticket);
    await expect(
      merchantReturn(pool, { ...args, claim: true, reason: "found a dent" }, fakeCashfree, ticket),
    ).rejects.toThrow(BookingNotReturnableError);

    // Still exactly one refund, and the deposit is still RELEASED.
    const refunds = await pool.query(`select count(*)::int as n from refunds where booking_id = $1`, [b.bookingId]);
    expect(refunds.rows[0].n).toBe(1);
    const deposit = await pool.query(`select status from security_deposits where booking_id = $1`, [b.bookingId]);
    expect(deposit.rows[0].status).toBe("RELEASED");
  });

  test("a booking that was never picked up cannot be returned", async () => {
    const b = await confirmedBookingWithPayment(2040);
    const merchant = await pool.query(`select merchant_user_id from shops where id = $1`, [b.shopId]);

    await expect(
      merchantReturn(
        pool,
        { merchantUserId: merchant.rows[0].merchant_user_id, bookingId: b.bookingId, claim: false },
        fakeCashfree,
        async () => ({ id: "unused", assignedTo: null }),
      ),
    ).rejects.toThrow(BookingNotReturnableError);

    // Not completed, and the deposit is untouched -- the customer is not charged
    // out for a scooter they never collected.
    const booking = await pool.query(`select status, actual_return_at from bookings where id = $1`, [b.bookingId]);
    expect(booking.rows[0].status).toBe("CONFIRMED");
    expect(booking.rows[0].actual_return_at).toBeNull();
    const deposit = await pool.query(`select status from security_deposits where booking_id = $1`, [b.bookingId]);
    expect(deposit.rows[0].status).toBe("HELD");
  });

  // The reason this function is now in a transaction at all.
  test("a failing refund leaves the booking and deposit untouched", async () => {
    const b = await pickedUpBooking(2050);
    const brokenCashfree = {
      ...fakeCashfree,
      refund: async () => { throw new Error("cashfree is down"); },
    };

    await expect(
      merchantReturn(
        pool,
        { merchantUserId: b.merchantUserId, bookingId: b.bookingId, claim: false },
        brokenCashfree,
        async () => ({ id: "unused", assignedTo: null }),
      ),
    ).rejects.toThrow("cashfree is down");

    // Before the transaction, this left a COMPLETED booking with a deposit stuck
    // HELD forever, and nothing retried it.
    const booking = await pool.query(`select status, actual_return_at from bookings where id = $1`, [b.bookingId]);
    expect(booking.rows[0].status).toBe("CONFIRMED");
    expect(booking.rows[0].actual_return_at).toBeNull();
    const deposit = await pool.query(`select status from security_deposits where booking_id = $1`, [b.bookingId]);
    expect(deposit.rows[0].status).toBe("HELD");
  });
});

describe("merchantReturn: who can, and what can be claimed", () => {
  const noTicket = async () => ({ id: "unused", assignedTo: null });

  test("a STAFF member of the shop can record a return, not just the owner", async () => {
    const b = await pickedUpBooking(2030);
    const staff = await createMerchant(pool);
    await pool.query(
      `insert into shop_members (shop_id, merchant_user_id, role, status) values ($1, $2, 'STAFF', 'ACTIVE')`,
      [b.shopId, staff.id],
    );
    const result = await merchantReturn(pool, { merchantUserId: staff.id, bookingId: b.bookingId, claim: false }, fakeCashfree, noTicket);
    expect(result.depositReleased).toBeGreaterThan(0);
  });

  test("someone who isn't a member of the shop still can't", async () => {
    const b = await pickedUpBooking(2040);
    const stranger = await createMerchant(pool);
    await expect(
      merchantReturn(pool, { merchantUserId: stranger.id, bookingId: b.bookingId, claim: false }, fakeCashfree, noTicket),
    ).rejects.toThrow();
  });

  test("a claim larger than the deposit held is refused and nothing changes", async () => {
    const b = await pickedUpBooking(2050);
    await expect(
      merchantReturn(
        pool,
        { merchantUserId: b.merchantUserId, bookingId: b.bookingId, claim: true, reason: "dent", amount: 999_999_999 },
        fakeCashfree,
        noTicket,
      ),
    ).rejects.toBeInstanceOf(ClaimExceedsDepositError);
    const { rows } = await pool.query(`select actual_return_at from bookings where id = $1`, [b.bookingId]);
    expect(rows[0].actual_return_at).toBeNull();
  });

  test("a walk-in can be returned, but its cash deposit can't be claimed through RetroMobi", async () => {
    const vehicle = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(2060);
    const walkin = await insertBooking(pool, {
      vehicleId: vehicle.id,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      source: "OFFLINE",
    });
    await pool.query(`update bookings set actual_pickup_at = now() where id = $1`, [walkin.id]);
    const { rows } = await pool.query(
      `select s.merchant_user_id from vehicles v join shops s on s.id = v.shop_id where v.id = $1`,
      [vehicle.id],
    );
    const merchantUserId = rows[0].merchant_user_id as string;

    await expect(
      merchantReturn(pool, { merchantUserId, bookingId: walkin.id, claim: true, reason: "dent", amount: 500 }, fakeCashfree, noTicket),
    ).rejects.toBeInstanceOf(WalkinClaimError);

    const result = await merchantReturn(pool, { merchantUserId, bookingId: walkin.id, claim: false }, fakeCashfree, noTicket);
    expect(result).toEqual({ ticketId: null, depositReleased: null });
  });
});
