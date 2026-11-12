import type { Pool } from "pg";
import type { CashfreeClient } from "../providers/cashfree.ts";
import { confirmPaidOrder } from "../Routes/user/Payments/paymentsService.ts";

/**
 * The webhook is the fast path, not the only one. A dropped delivery used to
 * mean: payment SUCCEEDED at Cashfree, `payments` row stuck PENDING,
 * `sweepExpiredHolds` deletes the HOLD bookings fifteen minutes later, and the
 * customer has paid for nothing until a human notices.
 *
 * So every tick, ask Cashfree about the payments we have not resolved. Same
 * Postgres-plus-timer shape as lib/holds.ts and lib/notificationSweep.ts; no
 * queue.
 */

/** Below this, the customer is probably still on the Cashfree page. */
const MIN_AGE_SECONDS = 120;

/** Stop re-asking eventually: a week-old PENDING row is an accounting job. */
const MAX_AGE_HOURS = 48;

const BATCH = 25;

export async function reconcilePendingPayments(
  pool: Pool,
  cashfree: CashfreeClient,
): Promise<{ checked: number; confirmed: number; failed: number }> {
  const { rows } = await pool.query(
    `select id, provider_order_id
       from payments
      where status = 'PENDING'
        and type <> 'EXTENSION'
        and provider_order_id is not null
        and created_at < now() - make_interval(secs => $1::int)
        and created_at > now() - make_interval(hours => $2::int)
      order by created_at
      limit $3`,
    [MIN_AGE_SECONDS, MAX_AGE_HOURS, BATCH],
  );

  let confirmed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const order = await cashfree.getOrder(row.provider_order_id);
      // null = Cashfree has no such order. Not evidence of payment, and not
      // evidence of failure either, so the row is left alone.
      if (!order) continue;

      if (order.orderStatus === "PAID") {
        // Reuses the one confirmation path, so a sweep-confirmed booking is
        // indistinguishable from a webhook-confirmed one -- same invoices,
        // deposits, payouts and notifications.
        await confirmPaidOrder(pool, { orderId: row.provider_order_id, trigger: "SWEEP" }, cashfree);
        confirmed += 1;
      } else if (order.orderStatus === "EXPIRED" || order.orderStatus === "TERMINATED") {
        await pool.query(
          `update payments set status = 'FAILED', updated_at = now()
            where id = $1 and status = 'PENDING'`,
          [row.id],
        );
        failed += 1;
      }
      // ACTIVE / TERMINATION_REQUESTED: still in flight. Left PENDING on
      // purpose -- a vendor that has not decided yet must never be read as a
      // decision, in either direction.
    } catch (err) {
      // One unreachable order must not stop the batch, and an outage must
      // never confirm or fail anything. The row stays PENDING and is retried
      // on the next tick.
      console.error(`payment reconcile failed for order ${row.provider_order_id}`, err);
    }
  }

  return { checked: rows.length, confirmed, failed };
}
