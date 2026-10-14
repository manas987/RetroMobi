import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createBookableVehicle, createRider, createUser, futureWindow, uniquePhone } from "../../../test/fixtures.ts";
import { createHold } from "../../user/Bookings/bookingsService.ts";
import { createPaymentIntent, handlePaymentWebhook } from "../../user/Payments/paymentsService.ts";
import { merchantReturn } from "../../user/Pickup/pickupService.ts";
import {
  DepositAlreadySettledError,
  DepositSplitMismatchError,
  getDepositForTicket,
  settleDeposit,
} from "./depositService.ts";

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

async function makeSupportAdmin(): Promise<string> {
  const { rows } = await pool.query(
    `insert into admins (phone, name, role) values ($1, 'Support', 'SUPPORT') returning id`,
    [uniquePhone()],
  );
  return rows[0].id;
}

const fakeCashfree = {
  createOrder: async (args: { orderId: string; amount: number; expiresAt: Date }) => ({
    orderId: args.orderId,
    paymentSessionId: `session_${args.orderId}`,
    expiresAt: args.expiresAt,
  }),
  refund: async () => ({ refundId: `rf_${Date.now()}_${Math.random()}`, status: "PENDING" as const }),
  transfer: async () => ({ transferId: `tr_${Date.now()}`, status: "PENDING" as const }),
  verifyWebhookSignature: () => true,
};

async function claimedDepositTicket(dayOffset: number) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id);
  const vehicle = await createBookableVehicle(pool, { depositAmount: 200_000 });
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

  const { rows: shopRows } = await pool.query(
    `select s.merchant_user_id from vehicles v join shops s on s.id = v.shop_id where v.id = $1`,
    [vehicle.id],
  );

  const bookingId = held.bookings[0]!.id;
  let ticketId = "";
  await merchantReturn(
    pool,
    { merchantUserId: shopRows[0].merchant_user_id, bookingId, claim: true, reason: "scratch", amount: 500 },
    fakeCashfree,
    async (args) => {
      const { rows: t } = await pool.query(
        `insert into tickets (booking_id, opened_by_type, opened_by_id, subject, status, category)
         values ($1, $2, $3, $4, 'OPEN', 'BOOKING') returning id`,
        [args.bookingId, args.openedByType, args.openedById, args.subject],
      );
      ticketId = t[0].id;
      await pool.query(
        `insert into ticket_participants (ticket_id, party_type, party_id) values ($1, $2, $3) on conflict do nothing`,
        [ticketId, args.openedByType, args.openedById],
      );
      return { id: ticketId, assignedTo: null };
    },
  );

  return { bookingId, ticketId, groupId: held.groupId };
}

describe("settleDeposit", () => {
  test("a 60/40 split creates one refund and one DEPOSIT_CLAIM payout summing to the held amount", async () => {
    const { ticketId, bookingId } = await claimedDepositTicket(2100);

    const before = await getDepositForTicket(pool, ticketId);
    expect(before.status).toBe("CLAIMED");
    expect(before.amount).toBe(200_000);

    const refundToCustomer = Math.round(before.amount * 0.6);
    const toMerchant = before.amount - refundToCustomer;

    const adminId = await makeSupportAdmin();
    const result = await settleDeposit(
      pool,
      adminId,
      ticketId,
      { refundToCustomer, toMerchant, note: "60/40 split" },
      fakeCashfree,
    );
    expect(result.refundId).not.toBeNull();
    expect(result.payoutId).not.toBeNull();

    const { rows: deposit } = await pool.query(
      `select status, refund_amount, deducted_amount from security_deposits where booking_id = $1`,
      [bookingId],
    );
    expect(deposit[0].status).toBe("PARTIALLY_DEDUCTED");
    expect(Number(deposit[0].refund_amount) + Number(deposit[0].deducted_amount)).toBe(200_000);

    const { rows: payouts } = await pool.query(
      `select amount from payouts where booking_id = $1 and stage = 'DEPOSIT_CLAIM'`,
      [bookingId],
    );
    expect(payouts).toHaveLength(1);
    expect(Number(payouts[0].amount)).toBe(toMerchant);
  });

  test("settling the same ticket twice is refused", async () => {
    const { ticketId } = await claimedDepositTicket(2110);
    const adminId = await makeSupportAdmin();
    await settleDeposit(
      pool,
      adminId,
      ticketId,
      { refundToCustomer: 200_000, toMerchant: 0, note: "full refund" },
      fakeCashfree,
    );
    await expect(
      settleDeposit(
        pool,
        adminId,
        ticketId,
        { refundToCustomer: 200_000, toMerchant: 0, note: "again" },
        fakeCashfree,
      ),
    ).rejects.toBeInstanceOf(DepositAlreadySettledError);
  });

  test("a split that does not add up to the held amount is rejected", async () => {
    const { ticketId } = await claimedDepositTicket(2120);
    const adminId = await makeSupportAdmin();
    await expect(
      settleDeposit(
        pool,
        adminId,
        ticketId,
        { refundToCustomer: 100_000, toMerchant: 50_000, note: "doesn't add up" },
        fakeCashfree,
      ),
    ).rejects.toBeInstanceOf(DepositSplitMismatchError);
  });
});
