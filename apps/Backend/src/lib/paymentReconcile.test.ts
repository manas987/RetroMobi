import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import { createBookableVehicle, createRider, createUser, futureWindow } from "../test/fixtures.ts";
import { createHold } from "../Routes/user/Bookings/bookingsService.ts";
import { createPaymentIntent } from "../Routes/user/Payments/paymentsService.ts";
import { reconcilePendingPayments } from "./paymentReconcile.ts";

if (!process.env.PLATFORM_GSTIN) process.env.PLATFORM_GSTIN = "05ABCDE1234F1Z5";

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

const baseCashfree = {
  createOrder: async (args: { orderId: string; amount: number; expiresAt: Date }) => ({
    orderId: args.orderId,
    paymentSessionId: `session_${args.orderId}`,
    expiresAt: args.expiresAt,
  }),
  refund: async (args: { refundId: string }) => ({ refundId: args.refundId, status: "PENDING" as const }),
  getOrder: async () => ({ orderStatus: "ACTIVE" as const, paymentSessionId: null }),
  verifyWebhookSignature: () => true,
};

function cashfreeSaying(orderStatus: "ACTIVE" | "PAID" | "EXPIRED" | "TERMINATED") {
  return {
    ...baseCashfree,
    getOrder: async (orderId: string) => ({ orderStatus, paymentSessionId: `session_${orderId}` }),
  };
}

/**
 * The sweep only looks at payments older than two minutes, because anything
 * younger probably has a customer still staring at the Cashfree page. Tests
 * cannot wait, so the row is aged by hand -- which is also the honest way to
 * test the window itself.
 *
 * Aged by HOURS, not the two minutes the window needs, and each test by a
 * different amount: the test database is persistent and shared (test/fixtures
 * never truncates), so other suites leave PENDING payments behind that are
 * minutes old. The sweep takes the 25 oldest, so a test row aged two minutes
 * can lose its place in the batch to someone else's leftovers and the
 * assertion then fails for a reason that has nothing to do with the sweep.
 */
async function age(groupId: string, hours: number) {
  await pool.query(
    `update payments set created_at = now() - make_interval(hours => $2::int)
      where booking_group_id = $1`,
    [groupId, hours],
  );
}

async function pendingPayment(dayOffset: number) {
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
  const intent = await createPaymentIntent(
    pool,
    { groupId: held.groupId, userId: user.id },
    baseCashfree,
  );
  return { userId: user.id, groupId: held.groupId, orderId: intent.orderId };
}

async function statusOf(groupId: string) {
  const { rows } = await pool.query(
    `select p.status as payment_status,
            (select b.status from bookings b where b.group_id = $1 and b.deleted_at is null limit 1) as booking_status
       from payments p where p.booking_group_id = $1`,
    [groupId],
  );
  return rows[0];
}

describe("reconcilePendingPayments", () => {
  // The failure this exists for: Cashfree took the money, the webhook never
  // arrived, and sweepExpiredHolds was about to delete the bookings.
  test("a paid order whose webhook never arrived is confirmed", async () => {
    const p = await pendingPayment(500);
    await age(p.groupId, 20);

    const result = await reconcilePendingPayments(pool, cashfreeSaying("PAID"));

    expect(result.confirmed).toBeGreaterThanOrEqual(1);
    const after = await statusOf(p.groupId);
    expect(after.payment_status).toBe("SUCCEEDED");
    expect(after.booking_status).toBe("CONFIRMED");

    // The same side effects as a webhook confirmation, because it is the same
    // code path.
    const payouts = await pool.query(
      `select p.id from payouts p join bookings b on b.id = p.booking_id
        where b.group_id = $1 and p.stage = 'UPFRONT'`,
      [p.groupId],
    );
    expect(payouts.rows).toHaveLength(1);
  });

  test("an unpaid, still-ACTIVE order is left exactly as it was", async () => {
    const p = await pendingPayment(510);
    await age(p.groupId, 19);

    await reconcilePendingPayments(pool, cashfreeSaying("ACTIVE"));

    const after = await statusOf(p.groupId);
    expect(after.payment_status).toBe("PENDING");
    expect(after.booking_status).toBe("HOLD");
  });

  test("an EXPIRED order is marked FAILED and confirms nothing", async () => {
    const p = await pendingPayment(520);
    await age(p.groupId, 18);

    const result = await reconcilePendingPayments(pool, cashfreeSaying("EXPIRED"));

    expect(result.failed).toBeGreaterThanOrEqual(1);
    const after = await statusOf(p.groupId);
    expect(after.payment_status).toBe("FAILED");
    expect(after.booking_status).toBe("HOLD");
  });

  test("a payment younger than the grace window is not touched", async () => {
    const p = await pendingPayment(530);
    // Deliberately NOT aged: the customer is still on the payment page.
    const seen = await pool.query(
      `select id from payments where booking_group_id = $1 and created_at < now() - make_interval(secs => 120)`,
      [p.groupId],
    );
    expect(seen.rows).toHaveLength(0);

    await reconcilePendingPayments(pool, cashfreeSaying("PAID"));
    expect((await statusOf(p.groupId)).payment_status).toBe("PENDING");
  });

  // The rule the brief is built on: an outage is never an approval, in either
  // direction. A thrown getOrder must leave the row retryable.
  test("a vendor outage leaves the payment PENDING and does not stop the batch", async () => {
    const broken = await pendingPayment(540);
    await age(broken.groupId, 17);

    const exploding = {
      ...baseCashfree,
      getOrder: async (orderId: string) => {
        if (orderId === broken.orderId) throw new Error("502 Bad Gateway");
        return { orderStatus: "ACTIVE" as const, paymentSessionId: null };
      },
    };

    await reconcilePendingPayments(pool, exploding);

    const after = await statusOf(broken.groupId);
    expect(after.payment_status).toBe("PENDING");
    expect(after.booking_status).toBe("HOLD");
  });
});
