import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import { notify } from "../../../lib/notify.ts";
import type { CashfreeClient } from "../../../providers/cashfree.ts";
import { resolveTicket, postMessage } from "../../Tickets/ticketsService.ts";

export class TicketHasNoDepositError extends Error {}
export class DepositAlreadySettledError extends Error {}
export class DepositSplitMismatchError extends Error {}

async function requireClaimedDeposit(pool: Pool, ticketId: string) {
  const { rows } = await pool.query(
    `select sd.*, b.group_id, b.vehicle_id, v.shop_id, s.merchant_user_id, vp.late_fee_amount, g.user_id
       from tickets t
       join bookings b on b.id = t.booking_id
       join security_deposits sd on sd.booking_id = b.id
       join vehicles v on v.id = b.vehicle_id
       join shops s on s.id = v.shop_id
       join booking_groups g on g.id = b.group_id
       left join vehicle_pricing vp on vp.vehicle_id = b.vehicle_id
      where t.id = $1`,
    [ticketId],
  );
  // A walk-in booking has no security_deposits row (no online payment), so a
  // claim on one cannot be settled this way.
  if (rows.length === 0) {
    throw new TicketHasNoDepositError(`ticket ${ticketId} has no booking with a security deposit`);
  }
  return rows[0];
}

export async function getDepositForTicket(pool: Pool, ticketId: string) {
  const row = await requireClaimedDeposit(pool, ticketId);
  return {
    depositId: row.id,
    bookingId: row.booking_id,
    amount: Number(row.amount),
    status: row.status,
    deductionReason: row.deduction_reason,
    deductedAmount: Number(row.deducted_amount),
    lateFeeAmount: row.late_fee_amount != null ? Number(row.late_fee_amount) : null,
    settledAt: row.settled_at,
  };
}

export async function settleDeposit(
  pool: Pool,
  adminId: string,
  ticketId: string,
  input: { refundToCustomer: number; toMerchant: number; note: string },
  cashfree: CashfreeClient,
): Promise<{ refundId: string | null; payoutId: string | null }> {
  const deposit = await requireClaimedDeposit(pool, ticketId);

  // settled_at is checked before the status==CLAIMED gate: once settled, status
  // moves to RELEASED/PARTIALLY_DEDUCTED, so a second attempt must still surface
  // as "already settled" rather than the less specific "not currently claimed".
  if (deposit.settled_at) {
    throw new DepositAlreadySettledError(`deposit for ticket ${ticketId} is already settled`);
  }
  if (deposit.status !== "CLAIMED") {
    throw new TicketHasNoDepositError(`deposit for ticket ${ticketId} is not in a CLAIMED state`);
  }
  if (
    !Number.isInteger(input.refundToCustomer) ||
    !Number.isInteger(input.toMerchant) ||
    input.refundToCustomer < 0 ||
    input.toMerchant < 0 ||
    input.refundToCustomer + input.toMerchant !== Number(deposit.amount)
  ) {
    throw new DepositSplitMismatchError(
      `refundToCustomer + toMerchant must equal the held amount (${deposit.amount}) exactly`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let refundId: string | null = null;
    if (input.refundToCustomer > 0) {
      const { rows: paymentRows } = await client.query(
        `select id from payments where booking_group_id = $1 and type = 'RENTAL' and status = 'SUCCEEDED' limit 1`,
        [deposit.group_id],
      );
      if (paymentRows.length === 0) {
        throw new TicketHasNoDepositError(`no successful rental payment found for booking ${deposit.booking_id}`);
      }
      const refund = await cashfree.refund({
        orderId: `order_${deposit.group_id}`,
        refundId: `deposit_settle_${deposit.id}`,
        amount: input.refundToCustomer,
      });
      const { rows: refundRows } = await client.query(
        `insert into refunds (payment_id, booking_id, amount, reason, provider_ref, status)
         values ($1, $2, $3, 'DEPOSIT_SETTLEMENT', $4, 'PENDING') returning id`,
        [paymentRows[0].id, deposit.booking_id, input.refundToCustomer, refund.refundId],
      );
      refundId = refundRows[0].id;
    }

    let payoutId: string | null = null;
    if (input.toMerchant > 0) {
      const { rows: payoutRows } = await client.query(
        `insert into payouts (merchant_user_id, booking_id, stage, amount, status)
         values ($1, $2, 'DEPOSIT_CLAIM', $3, 'PENDING') returning id`,
        [deposit.merchant_user_id, deposit.booking_id, input.toMerchant],
      );
      payoutId = payoutRows[0].id;
    }

    await client.query(
      `update security_deposits
          set deducted_amount = $1,
              refund_amount = $2,
              status = $3,
              released_at = now(),
              settled_at = now(),
              settled_by = $4
        where id = $5`,
      [
        input.toMerchant,
        input.refundToCustomer,
        input.toMerchant === 0 ? "RELEASED" : "PARTIALLY_DEDUCTED",
        adminId,
        deposit.id,
      ],
    );

    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "deposit.settled",
      entityType: "security_deposit",
      entityId: deposit.id,
      after: { refundToCustomer: input.refundToCustomer, toMerchant: input.toMerchant, note: input.note },
    });

    await notify(client, {
      recipientType: "CUSTOMER",
      recipientId: deposit.user_id,
      channel: "SMS",
      template: "refund_processed",
      payload: { bookingId: deposit.booking_id, refundAmount: input.refundToCustomer },
    });

    await client.query("COMMIT");

    // The money movement above is the one thing that must be atomic; ticket
    // resolution is a side effect of a settlement that has already happened,
    // the same separation openTicket/postMessage already use elsewhere.
    //
    // postMessage requires the sender to be a participant -- normally true
    // because assignTicket already added them, but settleDeposit does not
    // require the caller to be the assigned admin, so make sure here too.
    await pool.query(
      `insert into ticket_participants (ticket_id, party_type, party_id) values ($1, 'ADMIN', $2)
       on conflict do nothing`,
      [ticketId, adminId],
    );

    await resolveTicket(pool, ticketId, input.note, adminId);
    await postMessage(
      pool,
      ticketId,
      { partyType: "ADMIN", partyId: adminId },
      `Deposit settled: ₹${input.refundToCustomer / 100} to customer, ₹${input.toMerchant / 100} to merchant. ${input.note}`,
    );

    return { refundId, payoutId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
