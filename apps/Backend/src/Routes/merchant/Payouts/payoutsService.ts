import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import {
  mapBeneficiaryStatus,
  type CashfreePayoutClient,
} from "../../../providers/cashfreePayout.ts";

export class PayoutAccountNotFoundError extends Error {}

export async function getPayoutAccount(pool: Pool, merchantUserId: string) {
  const { rows } = await pool.query(
    `select * from merchant_payout_accounts where merchant_user_id = $1 and deleted_at is null`,
    [merchantUserId],
  );
  return rows[0] ?? null;
}

/**
 * Register the merchant's bank account with Cashfree Payouts and keep the
 * beneficiary id. Until this succeeds and Cashfree reports VERIFIED, the payout
 * sweep will not transfer anything to this merchant -- which is the correct
 * failure: money must not be sent to an account nobody has checked.
 *
 * The account number is sent to Cashfree and then **discarded**: after
 * registration only the beneficiary id is needed to pay, so keeping the number
 * would be a liability with no use. Same rule as the licence number in
 * migration 0015.
 */
export async function upsertPayoutAccount(
  pool: Pool,
  merchantUserId: string,
  input: { holderName: string; accountNumber: string; ifsc: string },
  payouts: CashfreePayoutClient,
) {
  const beneficiaryId = `merch_${merchantUserId.replace(/-/g, "")}`;

  const { rows: contactRows } = await pool.query(
    `select phone, email from merchant_users where id = $1`,
    [merchantUserId],
  );

  // The vendor call happens BEFORE the transaction: it is the slow, failable
  // part, and holding a row lock across it buys nothing. A failure here leaves
  // the previous account untouched, which is what a merchant would want.
  const registered = await payouts.createBeneficiary({
    beneficiaryId,
    name: input.holderName,
    accountNumber: input.accountNumber,
    ifsc: input.ifsc.toUpperCase(),
    phone: contactRows[0]?.phone ?? undefined,
    email: contactRows[0]?.email ?? undefined,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Never update a verified account in place -- the record of which account
    // was actually paid must survive.
    await client.query(
      `update merchant_payout_accounts set deleted_at = now()
        where merchant_user_id = $1 and deleted_at is null`,
      [merchantUserId],
    );
    const { rows } = await client.query(
      `insert into merchant_payout_accounts
         (merchant_user_id, provider, provider_account_ref, beneficiary_id, holder_name,
          account_last4, ifsc, status, provider_status, verified_at)
       values ($1, 'CASHFREE', $2, $2, $3, $4, $5, $6, $7,
               case when $6 = 'VERIFIED' then now() else null end)
       returning *`,
      [
        merchantUserId,
        beneficiaryId,
        input.holderName,
        input.accountNumber.slice(-4),
        input.ifsc.toUpperCase(),
        mapBeneficiaryStatus(registered.status),
        registered.status,
      ],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "payout_account.upserted",
      entityType: "merchant_payout_account",
      entityId: rows[0].id,
      // The account number is never audited either, for the same reason it is
      // never stored.
      after: {
        beneficiaryId,
        accountLast4: input.accountNumber.slice(-4),
        ifsc: input.ifsc.toUpperCase(),
        providerStatus: registered.status,
      },
    });
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listMyPayouts(
  pool: Pool,
  merchantUserId: string,
  filters: { status?: string; from?: Date; to?: Date },
) {
  const conditions = ["merchant_user_id = $1"];
  const values: unknown[] = [merchantUserId];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`created_at >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`created_at <= $${values.length}`);
  }
  const { rows } = await pool.query(
    `select * from payouts where ${conditions.join(" and ")} order by created_at desc`,
    values,
  );
  return rows;
}

export async function listShopPayouts(
  pool: Pool,
  shopId: string,
  filters: { status?: string; from?: Date; to?: Date },
) {
  const conditions = ["v.shop_id = $1"];
  const values: unknown[] = [shopId];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`p.status = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`p.created_at >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`p.created_at <= $${values.length}`);
  }
  const { rows } = await pool.query(
    `select p.* from payouts p
       join bookings b on b.id = p.booking_id
       join vehicles v on v.id = b.vehicle_id
      where ${conditions.join(" and ")}
      order by p.created_at desc`,
    values,
  );
  return rows;
}

/**
 * A TRANSFER_SUCCESS / TRANSFER_FAILED webhook from Cashfree Payouts.
 *
 * The sweep would find the same answer within a few minutes by polling; this
 * just makes it immediate. Same `webhook_events` idempotency as the gateway's,
 * under `provider = 'CASHFREE_PAYOUT'` so the two products' event ids cannot
 * collide. The signature is verified by the caller.
 */
export async function handlePayoutWebhook(
  pool: Pool,
  event: {
    providerEventId: string;
    type: "TRANSFER_SUCCESS" | "TRANSFER_FAILED";
    transferId: string;
    payload: unknown;
  },
): Promise<{ processed: boolean }> {
  const inserted = await pool.query(
    `insert into webhook_events (provider, provider_event_id, payload)
     values ('CASHFREE_PAYOUT', $1, $2)
     on conflict (provider, provider_event_id) do update
       set payload = excluded.payload, received_at = now()
     where webhook_events.processed_at is null
     returning id`,
    [event.providerEventId, JSON.stringify(event.payload)],
  );
  if (inserted.rows.length === 0) return { processed: false };

  const status = event.type === "TRANSFER_SUCCESS" ? "PAID" : "FAILED";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Matched on OUR transfer_id (`payout_<payout id>`), not on anything the
    // webhook names a row by -- a forged body cannot point at a payout of its
    // choosing, and an unknown id simply matches nothing.
    const { rows } = await client.query(
      `update payouts
          set status = $2,
              paid_at = case when $2 = 'PAID' then now() else paid_at end,
              last_error = case when $2 = 'FAILED' then 'provider reported TRANSFER_FAILED' else null end,
              updated_at = now()
        where provider_payout_id = $1 and status = 'PENDING'
        returning id, amount`,
      [event.transferId, status],
    );
    if (rows[0]) {
      await writeAudit(client, {
        actorType: "SYSTEM",
        actorId: null,
        action: status === "PAID" ? "payout.paid" : "payout.failed",
        entityType: "payout",
        entityId: rows[0].id,
        after: { transferId: event.transferId, source: "webhook" },
      });
    }
    await client.query(`update webhook_events set processed_at = now() where id = $1`, [
      inserted.rows[0].id,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { processed: true };
}
