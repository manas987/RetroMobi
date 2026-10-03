import type { Pool } from "pg";

// The exclusion constraint can't expire a hold itself (an index predicate must be
// IMMUTABLE and now() is STABLE), so something has to reconcile wall-clock expiry
// with the row's existence. Called by the 30s timer in src/index.ts, and directly
// by tests so they never depend on timing. Search does NOT call this.
export async function sweepExpiredHolds(pool: Pool): Promise<number> {
  const result = await pool.query(
    `delete from bookings b using booking_groups g
      where b.group_id = g.id and b.status = 'HOLD' and g.hold_expires_at < now()`,
  );
  // A group with a payment attempt (e.g. the pay-at-9:59 race, where the payment
  // landed after the hold died and got refunded instead of confirmed) is not an
  // abandoned checkout -- it has real payment/refund history pointing at it, and
  // payments.booking_group_id is NOT NULL restrict, so deleting it would both
  // destroy that trail and throw a FK violation that aborts the whole sweep.
  await pool.query(
    `delete from booking_groups
      where hold_expires_at < now()
        and id not in (select group_id from bookings where group_id is not null)
        and id not in (select booking_group_id from payments)`,
  );
  return result.rowCount ?? 0;
}
