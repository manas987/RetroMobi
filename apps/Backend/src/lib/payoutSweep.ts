import type { Pool } from "pg";
import { writeAudit } from "./audit.ts";
import { mapTransferStatus, type CashfreePayoutClient } from "../providers/cashfreePayout.ts";

/**
 * Actually pay the merchants.
 *
 * `payouts` rows have been accrued since 0010_payments.sql -- UPFRONT at
 * payment confirmation, BALANCE at pickup, CANCELLATION as a top-up -- and
 * nothing has ever transferred one. `cashfree.transfer()` existed, pointed at
 * an endpoint that does not exist, and was called by no code path at all.
 *
 * Two jobs, both on the existing 30-second timer:
 *   1. PENDING payouts with no transfer yet -> initiate one.
 *   2. PENDING payouts with a transfer in flight -> re-poll it, because the
 *      Payouts API is asynchronous and the create response is usually
 *      non-terminal (RECEIVED/QUEUED/...).
 */

const BATCH = 10;

/** Don't re-hit a failing transfer every 30 seconds. */
const RETRY_AFTER_SECONDS = 300;

export async function sweepPayouts(
  pool: Pool,
  payouts: CashfreePayoutClient,
): Promise<{ initiated: number; paid: number; failed: number }> {
  let initiated = 0;
  let paid = 0;
  let failed = 0;

  // `for update skip locked`, like lib/notificationSweep.ts, so running this
  // from two processes cannot pay the same payout twice. The deterministic
  // transfer_id below is the second line of defence: Cashfree rejects a
  // duplicate, so even a lost lock cannot double-pay.
  const client = await pool.connect();
  let claimed: Array<Record<string, unknown>>;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `select p.id, p.amount, p.stage, p.booking_id, p.provider_payout_id,
              a.beneficiary_id, a.holder_name, a.status as account_status
         from payouts p
         left join merchant_payout_accounts a
           on a.merchant_user_id = p.merchant_user_id and a.deleted_at is null
        where p.status = 'PENDING'
          and (p.last_attempt_at is null
               or p.last_attempt_at < now() - make_interval(secs => $1::int))
        order by p.last_attempt_at nulls first, p.created_at
        limit $2
        for update of p skip locked`,
      [RETRY_AFTER_SECONDS, BATCH],
    );
    claimed = rows;
    // Stamp the attempt inside the same transaction as the claim, so a crash
    // mid-transfer does not produce a tight retry loop.
    if (rows.length > 0) {
      await client.query(
        `update payouts set attempts = attempts + 1, last_attempt_at = now()
          where id = any($1::uuid[])`,
        [rows.map((r) => r.id)],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  for (const row of claimed) {
    const payoutId = String(row.id);
    const transferId = `payout_${payoutId.replace(/-/g, "")}`;

    // No verified beneficiary, no money. Recorded rather than silently skipped,
    // because "the merchant never got paid" needs a reason an admin can read.
    if (!row.beneficiary_id || row.account_status !== "VERIFIED") {
      await pool.query(
        `update payouts set last_error = $2, updated_at = now() where id = $1`,
        [
          payoutId,
          row.beneficiary_id
            ? `payout account is ${String(row.account_status)}, not VERIFIED`
            : "merchant has no payout account",
        ],
      );
      continue;
    }

    try {
      // An in-flight transfer is polled, not re-sent.
      const result = row.provider_payout_id
        ? await payouts.getTransfer(transferId)
        : await payouts.transfer({
            transferId,
            beneficiaryId: String(row.beneficiary_id),
            beneficiaryName: String(row.holder_name ?? "Merchant"),
            amount: Number(row.amount),
            remarks: `RetroMobi ${String(row.stage)} payout`,
          });

      if (!result) {
        // Cashfree has no record of a transfer we believe we sent. Not evidence
        // either way, so it stays PENDING and is retried.
        await pool.query(
          `update payouts set last_error = 'transfer not found at provider', updated_at = now()
            where id = $1`,
          [payoutId],
        );
        continue;
      }

      const mapped = mapTransferStatus(result.status);
      if (!row.provider_payout_id) initiated += 1;

      const settled = await pool.connect();
      try {
        await settled.query("BEGIN");
        await settled.query(
          `update payouts
              set status = $2,
                  provider_payout_id = coalesce(provider_payout_id, $3),
                  paid_at = case when $2 = 'PAID' then now() else paid_at end,
                  last_error = case when $2 = 'FAILED' then $4 else null end,
                  updated_at = now()
            where id = $1`,
          [payoutId, mapped, transferId, `provider status ${result.status}`],
        );
        if (mapped !== "PENDING") {
          await writeAudit(settled, {
            actorType: "SYSTEM",
            actorId: null,
            action: mapped === "PAID" ? "payout.paid" : "payout.failed",
            entityType: "payout",
            entityId: payoutId,
            after: { transferId, providerStatus: result.status, amount: Number(row.amount) },
          });
        }
        await settled.query("COMMIT");
      } catch (err) {
        await settled.query("ROLLBACK");
        throw err;
      } finally {
        settled.release();
      }

      if (mapped === "PAID") paid += 1;
      if (mapped === "FAILED") failed += 1;
    } catch (err) {
      // An outage must never mark a payout PAID or FAILED. It stays PENDING,
      // the reason is recorded, and the next sweep tries again after the
      // backoff. One broken payout does not stop the batch.
      console.error(`payout ${payoutId} transfer failed`, err);
      await pool.query(
        `update payouts set last_error = $2, updated_at = now() where id = $1`,
        [payoutId, err instanceof Error ? err.message.slice(0, 500) : "transfer failed"],
      );
    }
  }

  return { initiated, paid, failed };
}
