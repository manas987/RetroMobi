import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import type { CashfreeClient } from "../../../providers/cashfree.ts";

export class BookingNotFoundError extends Error {}
export class AlreadyInspectedError extends Error {}

// The video IS the pickup event -- confirming the upload sets actual_pickup_at.
// No merchant fallback: if the customer never uploads, actual_pickup_at stays
// null and that is the entire policy for a damage dispute.
export async function confirmInspection(
  pool: Pool,
  input: { userId: string; bookingId: string; storageKey: string },
) {
  const { rows } = await pool.query(
    `select b.id, b.rental_amount, b.actual_pickup_at
       from bookings b
       join booking_groups g on g.id = b.group_id
      where b.id = $1 and g.user_id = $2 and b.status = 'CONFIRMED' and b.deleted_at is null`,
    [input.bookingId, input.userId],
  );
  if (rows.length === 0) throw new BookingNotFoundError(`booking ${input.bookingId} not found`);
  const booking = rows[0];
  if (booking.actual_pickup_at) throw new AlreadyInspectedError("pickup already confirmed");

  const payoutUpfrontPct = Number(process.env.PAYOUT_UPFRONT_PCT ?? 10);
  const balanceAmount = Number(booking.rental_amount) - Math.round((Number(booking.rental_amount) * payoutUpfrontPct) / 100);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `insert into vehicle_inspections (booking_id, storage_key) values ($1, $2)`,
      [input.bookingId, input.storageKey],
    );
    await client.query(`update bookings set actual_pickup_at = now(), updated_at = now() where id = $1`, [
      input.bookingId,
    ]);

    const { rows: payoutRows } = await client.query(
      `select p.merchant_user_id from payouts p where p.booking_id = $1 and p.stage = 'UPFRONT'`,
      [input.bookingId],
    );
    if (payoutRows.length > 0) {
      await client.query(
        `insert into payouts (merchant_user_id, booking_id, stage, amount, status)
         values ($1, $2, 'BALANCE', $3, 'PENDING')`,
        [payoutRows[0].merchant_user_id, input.bookingId, balanceAmount],
      );
    }

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: input.userId,
      action: "booking.pickup_confirmed",
      entityType: "booking",
      entityId: input.bookingId,
      after: { storageKey: input.storageKey, balanceAmount },
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function merchantPickup(pool: Pool, input: { merchantUserId: string; bookingId: string }) {
  const { rows } = await pool.query(
    `select b.id from bookings b
       join vehicles v on v.id = b.vehicle_id
       join shops s on s.id = v.shop_id
      where b.id = $1 and s.merchant_user_id = $2 and b.source = 'OFFLINE' and b.deleted_at is null`,
    [input.bookingId, input.merchantUserId],
  );
  if (rows.length === 0) {
    throw new BookingNotFoundError(`walk-in booking ${input.bookingId} not found for this merchant`);
  }

  await pool.query(`update bookings set actual_pickup_at = now(), updated_at = now() where id = $1`, [
    input.bookingId,
  ]);
}

export async function merchantReturn(
  pool: Pool,
  input: {
    merchantUserId: string;
    bookingId: string;
    claim: boolean;
    reason?: string;
    amount?: number;
  },
  cashfree: CashfreeClient,
  openTicket: (args: {
    bookingId: string;
    openedByType: "MERCHANT";
    openedById: string;
    counterpartyType?: "CUSTOMER";
    counterpartyId?: string;
    subject: string;
    firstMessage?: string;
  }) => Promise<{ id: string; assignedTo: string | null }>,
) {
  const { rows } = await pool.query(
    `select b.id, b.group_id
       from bookings b
       join vehicles v on v.id = b.vehicle_id
       join shops s on s.id = v.shop_id
      where b.id = $1 and s.merchant_user_id = $2 and b.deleted_at is null`,
    [input.bookingId, input.merchantUserId],
  );
  if (rows.length === 0) throw new BookingNotFoundError(`booking ${input.bookingId} not found for this merchant`);
  const booking = rows[0];

  await pool.query(
    `update bookings set status = 'COMPLETED', actual_return_at = now(), updated_at = now() where id = $1`,
    [input.bookingId],
  );

  const { rows: depositRows } = await pool.query(
    `select id, amount from security_deposits where booking_id = $1`,
    [input.bookingId],
  );

  if (!input.claim) {
    if (depositRows.length > 0) {
      const deposit = depositRows[0];
      const { rows: paymentRows } = await pool.query(
        `select id from payments where booking_group_id = $1 and type = 'RENTAL' and status = 'SUCCEEDED' limit 1`,
        [booking.group_id],
      );
      if (paymentRows.length > 0) {
        const refund = await cashfree.refund({
          orderId: `order_${booking.group_id}`,
          refundId: `deposit_${deposit.id}`,
          amount: Number(deposit.amount),
        });
        await pool.query(
          `insert into refunds (payment_id, booking_id, amount, reason, provider_ref, status)
           values ($1, $2, $3, 'DEPOSIT_RELEASE', $4, 'PENDING')`,
          [paymentRows[0].id, input.bookingId, deposit.amount, refund.refundId],
        );
      }
      await pool.query(
        `update security_deposits set status = 'RELEASED', released_at = now(), refund_amount = amount where id = $1`,
        [deposit.id],
      );
    }
    return { ticketId: null };
  }

  if (depositRows.length > 0) {
    await pool.query(
      `update security_deposits
          set deduction_reason = $1, deducted_amount = coalesce($2, 0)
        where id = $3`,
      [input.reason ?? null, input.amount ?? null, depositRows[0].id],
    );
  }

  const ticket = await openTicket({
    bookingId: input.bookingId,
    openedByType: "MERCHANT",
    openedById: input.merchantUserId,
    subject: "Deposit claim on return",
    firstMessage: input.reason,
  });

  return { ticketId: ticket.id };
}
