import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import { notify } from "../../../lib/notify.ts";
import type { CashfreeClient } from "../../../providers/cashfree.ts";
import { assertHandoverAllowed } from "../../merchant/Operations/identityService.ts";

export class BookingNotFoundError extends Error {}
export class AlreadyInspectedError extends Error {}
/**
 * The booking exists and is theirs, but is in no state to be returned -- never
 * picked up, or already returned. Separate from BookingNotFoundError because a
 * 404 tells shop staff nothing they can act on.
 */
export class BookingNotReturnableError extends Error {}
/** A walk-in's deposit was taken in cash, outside the platform -- there is
 *  nothing here to hold, and no customer account to tell. */
export class WalkinClaimError extends Error {}
export class ClaimExceedsDepositError extends Error {}

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

    // Re-checked here, not just at booking: a licence can expire between the
    // two, and the shop staff's identity check is the only evidence binding
    // this person to the licence (automated face matching was dropped --
    // decisions.md 2026-11-02).
    //
    // ORDER MATTERS, and the UI has to say so: the merchant records the
    // identity check FIRST, then the customer records the vehicle. A customer
    // who opens the inspection screen before staff have checked their licence
    // gets a 409, so the copy on that screen explains the sequence rather than
    // leaving them staring at an error.
    await assertHandoverAllowed(client, {
      bookingId: input.bookingId,
      requireIdentityCheck: true,
    });

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
      where b.id = $1 and exists (select 1 from shop_members sm where sm.shop_id = s.id and sm.merchant_user_id = $2 and sm.status = 'ACTIVE' and sm.deleted_at is null) and b.source = 'OFFLINE' and b.deleted_at is null`,
    [input.bookingId, input.merchantUserId],
  );
  if (rows.length === 0) {
    throw new BookingNotFoundError(`walk-in booking ${input.bookingId} not found for this merchant`);
  }

  // Same gate as the customer path. This route only serves OFFLINE walk-ins,
  // which have no rider record and are exempt inside assertHandoverAllowed --
  // but the call stays, so that if this route ever accepts an online booking
  // the gate is already there rather than needing to be remembered.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertHandoverAllowed(client, {
      bookingId: input.bookingId,
      requireIdentityCheck: true,
    });
    await client.query(
      `update bookings set actual_pickup_at = now(), updated_at = now() where id = $1`,
      [input.bookingId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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
    category?: "BOOKING" | "APP_HELP" | "OTHER";
  }) => Promise<{ id: string; assignedTo: string | null }>,
): Promise<{ ticketId: string | null; depositReleased: number | null }> {
  const client = await pool.connect();
  let depositReleased: number | null = null;

  try {
    await client.query("BEGIN");

    // `actual_return_at is null` is the whole of "a merchant cannot claim after a
    // clean return, even if they find the damage later" -- the return is final the
    // moment it is recorded. It also stops the two ways this used to go wrong: a
    // second tap re-entering the refund path on an already-RELEASED deposit, and a
    // booking that was never collected being completed, which charged a full rental
    // for a scooter the customer never touched.
    const { rows } = await client.query(
      `select b.id, b.group_id, g.user_id
         from bookings b
         join vehicles v on v.id = b.vehicle_id
         join shops s on s.id = v.shop_id
         left join booking_groups g on g.id = b.group_id
        where b.id = $1 and exists (select 1 from shop_members sm where sm.shop_id = s.id and sm.merchant_user_id = $2 and sm.status = 'ACTIVE' and sm.deleted_at is null) and b.deleted_at is null
          and b.actual_pickup_at is not null and b.actual_return_at is null
        for update of b`,
      [input.bookingId, input.merchantUserId],
    );
    if (rows.length === 0) {
      // Deliberately not a 404: the booking may well exist and belong to this
      // merchant. Telling them *why* is the difference between retrying and
      // phoning support.
      const { rows: exists } = await client.query(
        `select 1 from bookings b
           join vehicles v on v.id = b.vehicle_id
           join shops s on s.id = v.shop_id
          where b.id = $1 and exists (select 1 from shop_members sm where sm.shop_id = s.id and sm.merchant_user_id = $2 and sm.status = 'ACTIVE' and sm.deleted_at is null) and b.deleted_at is null`,
        [input.bookingId, input.merchantUserId],
      );
      if (exists.length > 0) {
        throw new BookingNotReturnableError(
          "This booking hasn't been picked up yet, or has already been returned.",
        );
      }
      throw new BookingNotFoundError(`booking ${input.bookingId} not found for this merchant`);
    }
    const booking = rows[0];

    await client.query(
      `update bookings set status = 'COMPLETED', actual_return_at = now(), updated_at = now() where id = $1`,
      [input.bookingId],
    );

    const { rows: depositRows } = await client.query(
      `select id, amount from security_deposits where booking_id = $1`,
      [input.bookingId],
    );

    if (!input.claim) {
      if (depositRows.length > 0) {
        const deposit = depositRows[0];
        const { rows: paymentRows } = await client.query(
          `select id from payments where booking_group_id = $1 and type = 'RENTAL' and status = 'SUCCEEDED' limit 1`,
          [booking.group_id],
        );
        if (paymentRows.length > 0) {
          // ponytail: the provider call sits inside the transaction, so a COMMIT
          // failure after a successful refund would leave money returned but
          // unrecorded. Same shape as cancelBooking. If that race ever bites, split
          // it: commit a PENDING refunds row first, then call the provider from a
          // retryable sweep keyed on provider_ref is null.
          const refund = await cashfree.refund({
            orderId: `order_${booking.group_id}`,
            refundId: `deposit_${deposit.id}`,
            amount: Number(deposit.amount),
          });
          await client.query(
            `insert into refunds (payment_id, booking_id, amount, reason, provider_ref, status)
             values ($1, $2, $3, 'DEPOSIT_RELEASE', $4, 'PENDING')`,
            [paymentRows[0].id, input.bookingId, deposit.amount, refund.refundId],
          );
          await notify(client, {
            recipientType: "CUSTOMER",
            recipientId: booking.user_id,
            channel: "SMS",
            template: "refund_processed",
            payload: { bookingId: input.bookingId, refundAmount: Number(deposit.amount) },
          });
          await notify(client, {
            recipientType: "CUSTOMER",
            recipientId: booking.user_id,
            channel: "EMAIL",
            template: "refund_processed",
            payload: { bookingId: input.bookingId, refundAmount: Number(deposit.amount) },
          });
        }
        await client.query(
          `update security_deposits set status = 'RELEASED', released_at = now(), refund_amount = amount where id = $1`,
          [deposit.id],
        );
        depositReleased = Number(deposit.amount);
      }
      await client.query("COMMIT");
      return { ticketId: null, depositReleased };
    }

    if (!booking.group_id) {
      throw new WalkinClaimError("a walk-in's deposit is held in cash, outside RetroMobi");
    }
    if (depositRows.length > 0 && (input.amount ?? 0) > Number(depositRows[0].amount)) {
      throw new ClaimExceedsDepositError("the claim is larger than the deposit held");
    }

    if (depositRows.length > 0) {
      // CLAIMED is what Phase 16's settleDeposit looks for -- without it, a
      // claimed deposit would be indistinguishable from one nobody has touched.
      await client.query(
        `update security_deposits
            set status = 'CLAIMED', deduction_reason = $1, deducted_amount = coalesce($2, 0)
          where id = $3`,
        [input.reason ?? null, input.amount ?? null, depositRows[0].id],
      );
    }

    await notify(client, {
      recipientType: "CUSTOMER",
      recipientId: booking.user_id,
      channel: "SMS",
      template: "deposit_claim_raised",
      payload: { bookingId: input.bookingId },
    });
    await notify(client, {
      recipientType: "CUSTOMER",
      recipientId: booking.user_id,
      channel: "EMAIL",
      template: "deposit_claim_raised",
      payload: { bookingId: input.bookingId },
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // After COMMIT, not inside it: openTicket takes a Pool and opens its own
  // transaction, so it cannot join this one. The ordering is also the safer way
  // round -- a ticket that failed to open is recoverable and visible; a deposit
  // claim that rolled back after the customer was told about it is not.
  const ticket = await openTicket({
    bookingId: input.bookingId,
    openedByType: "MERCHANT",
    openedById: input.merchantUserId,
    subject: "Deposit claim on return",
    firstMessage: input.reason,
    category: "BOOKING",
  });

  return { ticketId: ticket.id, depositReleased: null };
}
