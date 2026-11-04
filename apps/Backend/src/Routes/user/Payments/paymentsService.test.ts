import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  createBookableVehicle,
  createRider,
  createUser,
  futureWindow,
} from "../../../test/fixtures.ts";
import { createHold } from "../Bookings/bookingsService.ts";
import {
  createPaymentIntent,
  getPaymentStatus,
  handlePaymentWebhook,
  PaymentGroupNotFoundError,
} from "./paymentsService.ts";

// A PLATFORM tax invoice is only issued when RetroMobi has a GSTIN, so these tests
// supply one. Without it the platform invoice is correctly skipped.
// Truthiness, not ??= : .env ships PLATFORM_GSTIN as an empty string, which is
// not null, so ??= would leave it empty and the platform invoice would be skipped.
if (!process.env.PLATFORM_GSTIN) process.env.PLATFORM_GSTIN = "05ABCDE1234F1Z5";

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

// The Cashfree client is injected, never imported at module scope — Bun's
// mock.module is process-global and corrupts other test files.
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

async function heldGroup(dayOffset: number) {
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
  return { userId: user.id, ...held };
}

describe("createPaymentIntent", () => {
  test("the provider order expires exactly when the hold does", async () => {
    const g = await heldGroup(300);
    const intent = await createPaymentIntent(
      pool,
      { groupId: g.groupId, userId: g.userId },
      fakeCashfree,
    );

    const { rows } = await pool.query(
      `select hold_expires_at from booking_groups where id = $1`,
      [g.groupId],
    );
    expect(new Date(intent.expiresAt).getTime()).toBe(
      new Date(rows[0].hold_expires_at).getTime(),
    );
  });

  test("writes a PENDING payment row against the group", async () => {
    const g = await heldGroup(310);
    await createPaymentIntent(pool, { groupId: g.groupId, userId: g.userId }, fakeCashfree);

    const { rows } = await pool.query(
      `select status, type from payments where booking_group_id = $1`,
      [g.groupId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("PENDING");
    expect(rows[0].type).toBe("RENTAL");
  });
});

describe("handlePaymentWebhook", () => {
  async function pendingPayment(dayOffset: number) {
    const g = await heldGroup(dayOffset);
    const intent = await createPaymentIntent(
      pool,
      { groupId: g.groupId, userId: g.userId },
      fakeCashfree,
    );
    return { ...g, orderId: intent.orderId };
  }

  test("a successful payment flips the group's bookings to CONFIRMED", async () => {
    const p = await pendingPayment(320);
    await handlePaymentWebhook(
      pool,
      {
        providerEventId: `evt_${Date.now()}_a`,
        type: "PAYMENT_SUCCESS",
        orderId: p.orderId,
        payload: {},
      },
      fakeCashfree,
    );

    const { rows } = await pool.query(`select status from bookings where group_id = $1`, [
      p.groupId,
    ]);
    expect(rows.every((r) => r.status === "CONFIRMED")).toBe(true);
  });

  // Cashfree can deliver the same event twice. The DB is the referee.
  test("the same event id delivered twice is processed exactly once", async () => {
    const p = await pendingPayment(330);
    const eventId = `evt_${Date.now()}_dup`;
    const event = {
      providerEventId: eventId,
      type: "PAYMENT_SUCCESS" as const,
      orderId: p.orderId,
      payload: {},
    };

    const first = await handlePaymentWebhook(pool, event, fakeCashfree);
    const second = await handlePaymentWebhook(pool, event, fakeCashfree);

    expect(first.processed).toBe(true);
    expect(second.processed).toBe(false);

    const events = await pool.query(
      `select id from webhook_events where provider_event_id = $1`,
      [eventId],
    );
    expect(events.rows).toHaveLength(1);

    // And crucially: no duplicate side effects.
    const payouts = await pool.query(
      `select p.id from payouts p
         join bookings b on b.id = p.booking_id
        where b.group_id = $1 and p.stage = 'UPFRONT'`,
      [p.groupId],
    );
    expect(payouts.rows).toHaveLength(1);
  });

  test("confirmation releases only the UPFRONT payout, not the balance", async () => {
    const p = await pendingPayment(340);
    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_${Date.now()}_b`, type: "PAYMENT_SUCCESS", orderId: p.orderId, payload: {} },
      fakeCashfree,
    );

    const { rows } = await pool.query(
      `select p.stage from payouts p
         join bookings b on b.id = p.booking_id
        where b.group_id = $1`,
      [p.groupId],
    );
    expect(rows.map((r) => r.stage)).toEqual(["UPFRONT"]);
  });

  test("the upfront payout is PAYOUT_UPFRONT_PCT of the merchant's rental amount", async () => {
    const p = await pendingPayment(350);
    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_${Date.now()}_c`, type: "PAYMENT_SUCCESS", orderId: p.orderId, payload: {} },
      fakeCashfree,
    );

    const { rows } = await pool.query(
      `select b.rental_amount, p.amount from payouts p
         join bookings b on b.id = p.booking_id
        where b.group_id = $1 and p.stage = 'UPFRONT'`,
      [p.groupId],
    );
    const pct = Number(process.env.PAYOUT_UPFRONT_PCT ?? 10);
    expect(Number(rows[0].amount)).toBe(
      Math.round((Number(rows[0].rental_amount) * pct) / 100),
    );
  });

  test("confirmation holds the security deposit", async () => {
    const p = await pendingPayment(360);
    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_${Date.now()}_d`, type: "PAYMENT_SUCCESS", orderId: p.orderId, payload: {} },
      fakeCashfree,
    );

    const { rows } = await pool.query(
      `select d.status from security_deposits d
         join bookings b on b.id = d.booking_id
        where b.group_id = $1`,
      [p.groupId],
    );
    expect(rows[0].status).toBe("HELD");
  });

  // Two suppliers: the shop bills the rental, RetroMobi bills its fee.
  test("confirmation issues two invoices with distinct issuers", async () => {
    const p = await pendingPayment(370);
    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_${Date.now()}_e`, type: "PAYMENT_SUCCESS", orderId: p.orderId, payload: {} },
      fakeCashfree,
    );

    const { rows } = await pool.query(
      `select issuer_type, invoice_number from invoices where booking_group_id = $1 order by issuer_type`,
      [p.groupId],
    );
    expect(rows.map((r) => r.issuer_type).sort()).toEqual(["MERCHANT", "PLATFORM"]);
    expect(new Set(rows.map((r) => r.invoice_number)).size).toBe(2);
  });

  test("invoice numbers are sequential with no gaps for the same issuer", async () => {
    const a = await pendingPayment(380);
    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_${Date.now()}_f`, type: "PAYMENT_SUCCESS", orderId: a.orderId, payload: {} },
      fakeCashfree,
    );
    const b = await pendingPayment(381);
    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_${Date.now()}_g`, type: "PAYMENT_SUCCESS", orderId: b.orderId, payload: {} },
      fakeCashfree,
    );

    const { rows } = await pool.query(
      `select sequence_number from invoices
        where issuer_type = 'PLATFORM' order by sequence_number desc limit 2`,
    );
    expect(Number(rows[0].sequence_number) - Number(rows[1].sequence_number)).toBe(1);
  });

  // The pay-at-9:59 race: Cashfree should reject it, but if it lands, refund.
  test("a payment landing after the hold expired triggers a full refund", async () => {
    const p = await pendingPayment(390);
    await pool.query(
      `update booking_groups set hold_expires_at = now() - interval '1 minute' where id = $1`,
      [p.groupId],
    );

    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_${Date.now()}_h`, type: "PAYMENT_SUCCESS", orderId: p.orderId, payload: {} },
      fakeCashfree,
    );

    const refunds = await pool.query(
      `select r.amount from refunds r
         join payments pay on pay.id = r.payment_id
        where pay.booking_group_id = $1`,
      [p.groupId],
    );
    expect(refunds.rows).toHaveLength(1);

    const bookings = await pool.query(
      `select status from bookings where group_id = $1 and deleted_at is null`,
      [p.groupId],
    );
    expect(bookings.rows.every((r) => r.status !== "CONFIRMED")).toBe(true);
  });

  test("a failed payment leaves the bookings on HOLD, not CONFIRMED", async () => {
    const p = await pendingPayment(400);
    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_${Date.now()}_i`, type: "PAYMENT_FAILED", orderId: p.orderId, payload: {} },
      fakeCashfree,
    );

    const { rows } = await pool.query(`select status from bookings where group_id = $1`, [
      p.groupId,
    ]);
    expect(rows.every((r) => r.status !== "CONFIRMED")).toBe(true);
  });
});

// A client whose order status is whatever the test says it is. The default
// fakeCashfree always says PAID, which is right for the confirmation suites
// and useless for the ones below.
function cashfreeSaying(orderStatus: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED" | null) {
  return {
    ...fakeCashfree,
    getOrder: async (orderId: string) =>
      orderStatus === null ? null : { orderStatus, paymentSessionId: `session_${orderId}` },
  };
}

describe("getPaymentStatus", () => {
  async function pending(dayOffset: number) {
    const g = await heldGroup(dayOffset);
    const intent = await createPaymentIntent(
      pool,
      { groupId: g.groupId, userId: g.userId },
      fakeCashfree,
    );
    return { ...g, orderId: intent.orderId };
  }

  // The whole point of this endpoint: the browser says nothing, Cashfree
  // decides. An ACTIVE order is an unpaid one.
  test("an ACTIVE order confirms nothing", async () => {
    const p = await pending(400);
    const result = await getPaymentStatus(
      pool,
      { groupId: p.groupId, userId: p.userId },
      cashfreeSaying("ACTIVE"),
    );

    expect(result.orderStatus).toBe("ACTIVE");
    expect(result.paymentStatus).toBe("PENDING");
    const { rows } = await pool.query(`select status from bookings where group_id = $1`, [p.groupId]);
    expect(rows.every((r) => r.status === "HOLD")).toBe(true);
  });

  test("a PAID order confirms the booking, exactly once across two polls", async () => {
    const p = await pending(410);
    const client = cashfreeSaying("PAID");

    const first = await getPaymentStatus(pool, { groupId: p.groupId, userId: p.userId }, client);
    const second = await getPaymentStatus(pool, { groupId: p.groupId, userId: p.userId }, client);

    expect(first.paymentStatus).toBe("SUCCEEDED");
    expect(second.paymentStatus).toBe("SUCCEEDED");
    expect(second.bookingStatus).toBe("CONFIRMED");

    const payouts = await pool.query(
      `select p.id from payouts p join bookings b on b.id = p.booking_id
        where b.group_id = $1 and p.stage = 'UPFRONT'`,
      [p.groupId],
    );
    expect(payouts.rows).toHaveLength(1);
    const deposits = await pool.query(
      `select d.id from security_deposits d join bookings b on b.id = d.booking_id
        where b.group_id = $1`,
      [p.groupId],
    );
    expect(deposits.rows).toHaveLength(1);
  });

  // The two triggers race in production: the webhook and the customer's return
  // land within the same second. The payment row lock is what makes that safe.
  test("a webhook arriving after a poll adds no second set of side effects", async () => {
    const p = await pending(420);
    await getPaymentStatus(pool, { groupId: p.groupId, userId: p.userId }, cashfreeSaying("PAID"));

    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_${Date.now()}_poll`, type: "PAYMENT_SUCCESS", orderId: p.orderId, payload: {} },
      fakeCashfree,
    );

    const payouts = await pool.query(
      `select p.id from payouts p join bookings b on b.id = p.booking_id
        where b.group_id = $1 and p.stage = 'UPFRONT'`,
      [p.groupId],
    );
    expect(payouts.rows).toHaveLength(1);
    const invoices = await pool.query(`select id from invoices where booking_group_id = $1`, [
      p.groupId,
    ]);
    // One MERCHANT plus one PLATFORM, not two of each -- a duplicated invoice
    // number is an accounting problem, not a bug report.
    expect(invoices.rows).toHaveLength(2);
  });

  test("an EXPIRED order marks the payment FAILED and confirms nothing", async () => {
    const p = await pending(430);
    const result = await getPaymentStatus(
      pool,
      { groupId: p.groupId, userId: p.userId },
      cashfreeSaying("EXPIRED"),
    );

    expect(result.paymentStatus).toBe("FAILED");
    const { rows } = await pool.query(`select status from bookings where group_id = $1`, [p.groupId]);
    expect(rows.every((r) => r.status === "HOLD")).toBe(true);
  });

  test("an order Cashfree has never heard of leaves everything alone", async () => {
    const p = await pending(440);
    const result = await getPaymentStatus(
      pool,
      { groupId: p.groupId, userId: p.userId },
      cashfreeSaying(null),
    );

    expect(result.orderStatus).toBeNull();
    expect(result.paymentStatus).toBe("PENDING");
  });

  // Reaching the return page without having started a payment is ordinary.
  test("a group with no payment yet is not an error", async () => {
    const g = await heldGroup(450);
    const result = await getPaymentStatus(
      pool,
      { groupId: g.groupId, userId: g.userId },
      cashfreeSaying("ACTIVE"),
    );

    expect(result.orderStatus).toBeNull();
    expect(result.paymentStatus).toBeNull();
    expect(result.bookingStatus).toBe("HOLD");
    expect(result.totalAmount).toBeGreaterThan(0);
  });

  test("another account's group is a 404, not a 403 -- no existence leak", async () => {
    const mine = await pending(460);
    const stranger = await createUser(pool);

    await expect(
      getPaymentStatus(pool, { groupId: mine.groupId, userId: stranger.id }, cashfreeSaying("PAID")),
    ).rejects.toBeInstanceOf(PaymentGroupNotFoundError);

    // And it did not quietly confirm on the way to refusing.
    const { rows } = await pool.query(`select status from payments where booking_group_id = $1`, [
      mine.groupId,
    ]);
    expect(rows[0].status).toBe("PENDING");
  });
});
