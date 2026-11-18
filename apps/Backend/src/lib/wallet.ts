import type { Pool, PoolClient } from "pg";
import { writeAudit } from "./audit.ts";
import { mapTransferStatus, type CashfreePayoutClient } from "../providers/cashfreePayout.ts";

/**
 * The shop wallet (migration 0021). Merchant earnings are `payouts` rows with
 * status CREDITED; money leaves through `wallet_withdrawals`. The balance is
 * derived from those two tables every time, here and nowhere else.
 */

export class InsufficientWalletBalanceError extends Error {}
export class WithdrawalBelowMinimumError extends Error {}
export class WithdrawalNotFoundError extends Error {}
/** The withdrawal is not in a state that allows this action (e.g. already settled). */
export class WithdrawalStateError extends Error {}
export class PayoutAccountNotReadyError extends Error {}

/** Default ₹500. A floor so a ₹3 payout doesn't cost an admin's time or a transfer fee. */
export function minWithdrawalAmount(): number {
  return Number(process.env.MIN_WITHDRAWAL_PAISE ?? 50_000);
}

/** Withdrawals that hold money: asked for, being transferred, or paid. */
const HOLDING = `('REQUESTED', 'PROCESSING', 'PAID')`;

export async function walletBalance(
  client: Pool | PoolClient,
  shopId: string,
): Promise<{ credited: number; adjusted: number; paidOut: number; inFlight: number; available: number }> {
  const { rows } = await client.query(
    `select
       (select coalesce(sum(p.amount), 0)
          from payouts p
          join bookings b on b.id = p.booking_id
          join vehicles v on v.id = b.vehicle_id
         where v.shop_id = $1 and p.status = 'CREDITED') as credited,
       (select coalesce(sum(amount), 0) from wallet_adjustments where shop_id = $1) as adjusted,
       (select coalesce(sum(amount), 0) from wallet_withdrawals
         where shop_id = $1 and status = 'PAID') as paid_out,
       (select coalesce(sum(amount), 0) from wallet_withdrawals
         where shop_id = $1 and status in ('REQUESTED', 'PROCESSING')) as in_flight`,
    [shopId],
  );
  const credited = Number(rows[0].credited);
  const adjusted = Number(rows[0].adjusted);
  const paidOut = Number(rows[0].paid_out);
  const inFlight = Number(rows[0].in_flight);
  return { credited, adjusted, paidOut, inFlight, available: credited + adjusted - paidOut - inFlight };
}

/** What the merchant's wallet screen shows: balance, every credit, every withdrawal. */
export async function getWallet(pool: Pool, shopId: string) {
  const balance = await walletBalance(pool, shopId);
  const { rows: credits } = await pool.query(
    `select p.id, p.booking_id, p.stage, p.amount, p.created_at,
            b.rental_amount, b.discount_amount,
            c.code as coupon_code, c.funded_by as coupon_funded_by
       from payouts p
       join bookings b on b.id = p.booking_id
       join vehicles v on v.id = b.vehicle_id
       left join booking_groups g on g.id = b.group_id
       left join coupons c on c.id = g.coupon_id
      where v.shop_id = $1 and p.status = 'CREDITED'
      order by p.created_at desc
      limit 200`,
    [shopId],
  );
  const { rows: withdrawals } = await pool.query(
    `select id, amount, status, pay_to, method, reference, note, last_error,
            requested_by, created_at, processed_at
       from wallet_withdrawals where shop_id = $1
      order by created_at desc limit 100`,
    [shopId],
  );
  const { rows: adjustments } = await pool.query(
    `select id, amount, reason, created_at from wallet_adjustments where shop_id = $1
      order by created_at desc limit 100`,
    [shopId],
  );
  return {
    ...balance,
    adjustments,
    minWithdrawal: minWithdrawalAmount(),
    credits: credits.map((c) => ({
      ...c,
      // A platform-funded discount is paid to the shop by RetroMobi, not lost:
      // the credit is on the full listed price. Shown so the merchant can see it.
      platform_coupon_amount:
        c.coupon_funded_by === "PLATFORM" && c.stage === "UPFRONT" ? Number(c.discount_amount) : 0,
    })),
    withdrawals,
  };
}

export async function requestWithdrawal(
  pool: Pool,
  input: { shopId: string; requestedBy: string; amount: number; payTo?: string },
) {
  if (input.amount < minWithdrawalAmount()) {
    throw new WithdrawalBelowMinimumError(`minimum withdrawal is ${minWithdrawalAmount()} paise`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The shop row is the lock: two requests at once must not both see the same
    // balance. Every other writer of a withdrawal for this shop takes it too.
    const { rows: shopRows } = await client.query(
      `select merchant_user_id from shops where id = $1 and deleted_at is null for update`,
      [input.shopId],
    );
    if (shopRows.length === 0) throw new WithdrawalNotFoundError(`shop ${input.shopId} not found`);

    const { available } = await walletBalance(client, input.shopId);
    if (input.amount > available) {
      throw new InsufficientWalletBalanceError(`requested ${input.amount}, available ${available}`);
    }

    const { rows } = await client.query(
      `insert into wallet_withdrawals (shop_id, merchant_user_id, amount, pay_to, requested_by)
       values ($1, $2, $3, $4, $5) returning *`,
      [input.shopId, shopRows[0].merchant_user_id, input.amount, input.payTo ?? null, input.requestedBy],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: input.requestedBy,
      action: "wallet.withdrawal_requested",
      entityType: "wallet_withdrawal",
      entityId: rows[0].id,
      shopId: input.shopId,
      after: { amount: input.amount },
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

export async function listWithdrawals(pool: Pool, filters: { status?: string }) {
  const values: unknown[] = [];
  let where = "";
  if (filters.status) {
    values.push(filters.status);
    where = `where w.status = $1`;
  }
  const { rows } = await pool.query(
    `select w.*, s.name as shop_name,
            a.status as payout_account_status, a.account_last4, a.ifsc, a.holder_name
       from wallet_withdrawals w
       join shops s on s.id = w.shop_id
       left join merchant_payout_accounts a
         on a.merchant_user_id = w.merchant_user_id and a.deleted_at is null
       ${where}
      order by w.created_at desc
      limit 200`,
    values,
  );
  return rows;
}

/** Locks the withdrawal (and its shop, the wallet lock) for a state change. */
async function lockWithdrawal(client: PoolClient, id: string) {
  const { rows } = await client.query(`select * from wallet_withdrawals where id = $1 for update`, [id]);
  if (rows.length === 0) throw new WithdrawalNotFoundError(`withdrawal ${id} not found`);
  await client.query(`select 1 from shops where id = $1 for update`, [rows[0].shop_id]);
  return rows[0];
}

async function inTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectWithdrawal(
  pool: Pool,
  input: { withdrawalId: string; adminId: string; reason: string },
) {
  return inTransaction(pool, async (client) => {
    const w = await lockWithdrawal(client, input.withdrawalId);
    if (w.status !== "REQUESTED") throw new WithdrawalStateError(`withdrawal is ${w.status}`);
    // Rejecting releases the money: REJECTED is not in HOLDING, so the balance
    // is back the moment this commits.
    const { rows } = await client.query(
      `update wallet_withdrawals
          set status = 'REJECTED', note = $2, processed_by = $3, processed_at = now(),
              pay_to = null, updated_at = now()
        where id = $1 returning *`,
      [input.withdrawalId, input.reason, input.adminId],
    );
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: input.adminId,
      action: "wallet.withdrawal_rejected",
      entityType: "wallet_withdrawal",
      entityId: input.withdrawalId,
      shopId: w.shop_id,
      after: { reason: input.reason },
    });
    return rows[0];
  });
}

export type WithdrawalMethod = "CASHFREE_PAYOUT" | "BANK_TRANSFER" | "UPI" | "CASH" | "OTHER";

export type PayInput = {
  method: WithdrawalMethod;
  reference?: string;
  note?: string;
  proofStorageKey?: string;
};

/** Settles a locked REQUESTED withdrawal inside the caller's transaction. */
async function settleRequested(client: PoolClient, w: Record<string, any>, adminId: string, input: PayInput) {
  if (w.status !== "REQUESTED") throw new WithdrawalStateError(`withdrawal is ${w.status}`);

  let rows;
  if (input.method === "CASHFREE_PAYOUT") {
    const { rows: accounts } = await client.query(
      `select status, beneficiary_id from merchant_payout_accounts
        where merchant_user_id = $1 and deleted_at is null`,
      [w.merchant_user_id],
    );
    if (!accounts[0]?.beneficiary_id || accounts[0].status !== "VERIFIED") {
      throw new PayoutAccountNotReadyError("the merchant has no VERIFIED payout account; pay offline instead");
    }
    ({ rows } = await client.query(
      `update wallet_withdrawals
          set status = 'PROCESSING', method = 'CASHFREE_PAYOUT', transfer_id = $2,
              note = $3, processed_by = $4, updated_at = now()
        where id = $1 returning *`,
      [w.id, `wd_${String(w.id).replace(/-/g, "")}`, input.note ?? null, adminId],
    ));
  } else {
    if (!input.reference) throw new WithdrawalStateError("an offline payment needs a reference");
    ({ rows } = await client.query(
      `update wallet_withdrawals
          set status = 'PAID', method = $2, reference = $3, note = $4, proof_storage_key = $5,
              processed_by = $6, processed_at = now(), pay_to = null, updated_at = now()
        where id = $1 returning *`,
      [w.id, input.method, input.reference, input.note ?? null, input.proofStorageKey ?? null, adminId],
    ));
  }
  await writeAudit(client, {
    actorType: "ADMIN",
    actorId: adminId,
    action: input.method === "CASHFREE_PAYOUT" ? "wallet.withdrawal_transfer_started" : "wallet.withdrawal_paid_offline",
    entityType: "wallet_withdrawal",
    entityId: w.id,
    shopId: w.shop_id,
    after: { method: input.method, reference: input.reference ?? null, amount: Number(w.amount) },
  });
  return rows[0];
}

/**
 * An admin settles a REQUESTED withdrawal. CASHFREE_PAYOUT hands it to the
 * sweep (PROCESSING -> PAID/FAILED); every other method records money that was
 * already paid outside the platform, so it is PAID at once, with a reference.
 */
export async function payWithdrawal(pool: Pool, input: PayInput & { withdrawalId: string; adminId: string }) {
  return inTransaction(pool, async (client) => {
    const w = await lockWithdrawal(client, input.withdrawalId);
    return settleRequested(client, w, input.adminId, input);
  });
}

/**
 * An admin pays a shop without a request from it: cash handed over at the
 * counter, a transfer made outside the platform. One transaction: the money is
 * checked, held and settled together, so a failure leaves no half-made request.
 * No minimum: the floor spares admins tiny requests, it does not bind them.
 */
export async function payShopDirectly(
  pool: Pool,
  input: PayInput & { shopId: string; adminId: string; amount: number },
) {
  return inTransaction(pool, async (client) => {
    const { rows: shopRows } = await client.query(
      `select merchant_user_id from shops where id = $1 and deleted_at is null for update`,
      [input.shopId],
    );
    if (shopRows.length === 0) throw new WithdrawalNotFoundError(`shop ${input.shopId} not found`);
    const { available } = await walletBalance(client, input.shopId);
    if (input.amount > available) {
      throw new InsufficientWalletBalanceError(`paying ${input.amount}, available ${available}`);
    }
    const { rows } = await client.query(
      `insert into wallet_withdrawals (shop_id, merchant_user_id, amount) values ($1, $2, $3) returning *`,
      [input.shopId, shopRows[0].merchant_user_id, input.amount],
    );
    return settleRequested(client, rows[0], input.adminId, input);
  });
}

/** A signed correction with a reason. Never takes the balance below zero. */
export async function adjustWallet(
  pool: Pool,
  input: { shopId: string; adminId: string; amount: number; reason: string },
) {
  return inTransaction(pool, async (client) => {
    const { rows: shopRows } = await client.query(
      `select id from shops where id = $1 and deleted_at is null for update`,
      [input.shopId],
    );
    if (shopRows.length === 0) throw new WithdrawalNotFoundError(`shop ${input.shopId} not found`);
    const { available } = await walletBalance(client, input.shopId);
    if (available + input.amount < 0) {
      throw new InsufficientWalletBalanceError(`a ${input.amount} adjustment would leave ${available + input.amount}`);
    }
    const { rows } = await client.query(
      `insert into wallet_adjustments (shop_id, amount, reason, created_by) values ($1, $2, $3, $4) returning *`,
      [input.shopId, input.amount, input.reason, input.adminId],
    );
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: input.adminId,
      action: "wallet.adjusted",
      entityType: "wallet_adjustment",
      entityId: rows[0].id,
      shopId: input.shopId,
      after: { amount: input.amount, reason: input.reason },
    });
    return rows[0];
  });
}

/** Every shop with its wallet, for the admin wallets list and the coupon shop picker. */
export async function listShopWallets(pool: Pool) {
  const { rows } = await pool.query(
    `select s.id as shop_id, s.name as shop_name, s.city, s.verification_status,
            coalesce(c.credited, 0) as credited,
            coalesce(a.adjusted, 0) as adjusted,
            coalesce(w.paid_out, 0) as paid_out,
            coalesce(w.in_flight, 0) as in_flight
       from shops s
       left join (
         select v.shop_id, sum(p.amount) as credited
           from payouts p join bookings b on b.id = p.booking_id join vehicles v on v.id = b.vehicle_id
          where p.status = 'CREDITED' group by v.shop_id
       ) c on c.shop_id = s.id
       left join (select shop_id, sum(amount) as adjusted from wallet_adjustments group by shop_id) a on a.shop_id = s.id
       left join (
         select shop_id,
                sum(amount) filter (where status = 'PAID') as paid_out,
                sum(amount) filter (where status in ('REQUESTED', 'PROCESSING')) as in_flight
           from wallet_withdrawals group by shop_id
       ) w on w.shop_id = s.id
      where s.deleted_at is null
      order by s.name`,
  );
  return rows.map((r) => {
    const credited = Number(r.credited);
    const adjusted = Number(r.adjusted);
    const paidOut = Number(r.paid_out);
    const inFlight = Number(r.in_flight);
    return {
      shopId: r.shop_id,
      shopName: r.shop_name,
      city: r.city,
      verificationStatus: r.verification_status,
      credited,
      adjusted,
      paidOut,
      inFlight,
      available: credited + adjusted - paidOut - inFlight,
    };
  });
}

/** Records a terminal Cashfree result. Shared by the sweep and the webhook. */
export async function settleTransfer(
  client: Pool | PoolClient,
  transferId: string,
  outcome: "PAID" | "FAILED",
  providerStatus: string,
  source: "sweep" | "webhook",
): Promise<boolean> {
  const { rows } = await client.query(
    `update wallet_withdrawals
        set status = $2,
            provider_status = $3,
            processed_at = case when $2 = 'PAID' then now() else processed_at end,
            pay_to = case when $2 = 'PAID' then null else pay_to end,
            last_error = case when $2 = 'FAILED' then 'provider status ' || $3 else null end,
            updated_at = now()
      where transfer_id = $1 and status = 'PROCESSING'
      returning id, shop_id, amount`,
    [transferId, outcome, providerStatus],
  );
  if (!rows[0]) return false;
  await writeAudit(client, {
    actorType: "SYSTEM",
    actorId: null,
    action: outcome === "PAID" ? "wallet.withdrawal_paid" : "wallet.withdrawal_failed",
    entityType: "wallet_withdrawal",
    entityId: rows[0].id,
    shopId: rows[0].shop_id,
    after: { transferId, providerStatus, source, amount: Number(rows[0].amount) },
  });
  return true;
}

const BATCH = 10;
/** Don't re-hit a failing transfer every 30 seconds. */
const RETRY_AFTER_SECONDS = 300;

/**
 * Drives CASHFREE_PAYOUT withdrawals on the 30-second timer. Replaces the old
 * per-booking payout sweep. A FAILED transfer returns the money to the wallet
 * (FAILED holds nothing) and the merchant can ask again.
 */
export async function sweepWithdrawals(
  pool: Pool,
  payouts: CashfreePayoutClient,
): Promise<{ paid: number; failed: number }> {
  let paid = 0;
  let failed = 0;

  // skip locked, so two processes cannot claim the same row; the deterministic
  // transfer_id is the second line of defence, since Cashfree refuses a duplicate.
  const claimed = await inTransaction(pool, async (client) => {
    const { rows } = await client.query(
      `select w.id, w.amount, w.transfer_id, a.beneficiary_id, a.holder_name, a.status as account_status
         from wallet_withdrawals w
         left join merchant_payout_accounts a
           on a.merchant_user_id = w.merchant_user_id and a.deleted_at is null
        where w.status = 'PROCESSING' and w.method = 'CASHFREE_PAYOUT'
          and (w.last_attempt_at is null
               or w.last_attempt_at < now() - make_interval(secs => $1::int))
        order by w.last_attempt_at nulls first, w.created_at
        limit $2
        for update of w skip locked`,
      [RETRY_AFTER_SECONDS, BATCH],
    );
    if (rows.length > 0) {
      await client.query(
        `update wallet_withdrawals set attempts = attempts + 1, last_attempt_at = now()
          where id = any($1::uuid[])`,
        [rows.map((r) => r.id)],
      );
    }
    return rows;
  });

  for (const row of claimed) {
    const transferId = String(row.transfer_id);
    if (!row.beneficiary_id || row.account_status !== "VERIFIED") {
      await pool.query(`update wallet_withdrawals set last_error = $2, updated_at = now() where id = $1`, [
        row.id,
        "payout account is no longer VERIFIED",
      ]);
      continue;
    }
    try {
      // Ask first, send only if Cashfree has never seen this id: a crash between
      // sending and recording must not turn into a second transfer attempt.
      const existing = await payouts.getTransfer(transferId);
      const result =
        existing ??
        (await payouts.transfer({
          transferId,
          beneficiaryId: String(row.beneficiary_id),
          beneficiaryName: String(row.holder_name ?? "Merchant"),
          amount: Number(row.amount),
          remarks: "RetroMobi wallet withdrawal",
        }));
      const mapped = mapTransferStatus(result.status);
      if (mapped === "PENDING") {
        await pool.query(
          `update wallet_withdrawals set provider_status = $2, last_error = null, updated_at = now() where id = $1`,
          [row.id, result.status],
        );
        continue;
      }
      if (await settleTransfer(pool, transferId, mapped, String(result.status), "sweep")) {
        if (mapped === "PAID") paid += 1;
        else failed += 1;
      }
    } catch (err) {
      // An outage never decides the outcome: it stays PROCESSING and retries.
      console.error(`withdrawal ${String(row.id)} transfer failed`, err);
      await pool.query(`update wallet_withdrawals set last_error = $2, updated_at = now() where id = $1`, [
        row.id,
        err instanceof Error ? err.message.slice(0, 500) : "transfer failed",
      ]);
    }
  }
  return { paid, failed };
}
