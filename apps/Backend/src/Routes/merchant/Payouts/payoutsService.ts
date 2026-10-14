import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import type { CashfreeClient } from "../../../providers/cashfree.ts";

export class PayoutAccountNotFoundError extends Error {}

export async function getPayoutAccount(pool: Pool, merchantUserId: string) {
  const { rows } = await pool.query(
    `select * from merchant_payout_accounts where merchant_user_id = $1 and deleted_at is null`,
    [merchantUserId],
  );
  return rows[0] ?? null;
}

// cashfree is accepted but not yet called -- account verification is an admin
// action (Phase 12), not something this endpoint performs itself today.
export async function upsertPayoutAccount(
  pool: Pool,
  merchantUserId: string,
  input: { providerAccountRef: string },
  _cashfree: CashfreeClient,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Never update a verified account's provider_account_ref in place -- the
    // record of which account was actually paid must survive.
    await client.query(
      `update merchant_payout_accounts set deleted_at = now()
        where merchant_user_id = $1 and deleted_at is null`,
      [merchantUserId],
    );
    const { rows } = await client.query(
      `insert into merchant_payout_accounts (merchant_user_id, provider, provider_account_ref, status)
       values ($1, 'CASHFREE', $2, 'PENDING') returning *`,
      [merchantUserId, input.providerAccountRef],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "payout_account.upserted",
      entityType: "merchant_payout_account",
      entityId: rows[0].id,
      after: { providerAccountRef: input.providerAccountRef },
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
