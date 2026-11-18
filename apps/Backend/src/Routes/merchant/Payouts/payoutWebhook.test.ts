import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createMerchant, createShop } from "../../../test/fixtures.ts";
import { verifyPayoutWebhookSignature } from "../../../providers/cashfreePayout.ts";
import { handlePayoutWebhook } from "./payoutsService.ts";

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

/** A wallet withdrawal with a Cashfree transfer already in flight, which is
 *  the only state a TRANSFER_SUCCESS can legitimately arrive for. (Field names
 *  kept as payoutId/statusOf: the webhook is still "the payouts webhook".) */
async function inFlightPayout() {
  const merchant = await createMerchant(pool);
  const shop = await createShop(pool, merchant.id);
  const { rows } = await pool.query(
    `insert into wallet_withdrawals (shop_id, merchant_user_id, amount, status, method, transfer_id)
     values ($1, $2, 25000, 'PROCESSING', 'CASHFREE_PAYOUT', 'wd_' || replace(gen_random_uuid()::text, '-', ''))
     returning id, transfer_id`,
    [shop.id, merchant.id],
  );
  return { payoutId: String(rows[0].id), transferId: String(rows[0].transfer_id) };
}

async function statusOf(payoutId: string) {
  const { rows } = await pool.query(
    `select status, processed_at as paid_at, last_error from wallet_withdrawals where id = $1`,
    [payoutId],
  );
  return rows[0];
}

describe("verifyPayoutWebhookSignature", () => {
  const keys = ["CASHFREE_PAYOUT_CLIENT_ID", "CASHFREE_PAYOUT_CLIENT_SECRET"] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  // Fails closed, like the gateway's: a forged TRANSFER_SUCCESS marks a merchant
  // paid who was not, and reconciling that means reading a bank statement.
  test("with no payout secret, nothing verifies", () => {
    expect(verifyPayoutWebhookSignature("{}", "anything", "123")).toBe(false);
  });

  test("accepts timestamp + rawBody signed with the PAYOUT secret", () => {
    process.env.CASHFREE_PAYOUT_CLIENT_ID = "po-id";
    process.env.CASHFREE_PAYOUT_CLIENT_SECRET = "po-secret";
    const rawBody = '{"type":"TRANSFER_SUCCESS"}';
    const timestamp = "1762000000";
    const signature = createHmac("sha256", "po-secret").update(timestamp + rawBody).digest("base64");
    expect(verifyPayoutWebhookSignature(rawBody, signature, timestamp)).toBe(true);
  });

  test("rejects a signature made with the gateway's secret", () => {
    process.env.CASHFREE_PAYOUT_CLIENT_ID = "po-id";
    process.env.CASHFREE_PAYOUT_CLIENT_SECRET = "po-secret";
    const rawBody = '{"type":"TRANSFER_SUCCESS"}';
    const timestamp = "1762000000";
    const wrong = createHmac("sha256", "pg-secret").update(timestamp + rawBody).digest("base64");
    expect(verifyPayoutWebhookSignature(rawBody, wrong, timestamp)).toBe(false);
  });
});

describe("handlePayoutWebhook", () => {
  test("TRANSFER_SUCCESS marks the payout PAID", async () => {
    const p = await inFlightPayout();
    const result = await handlePayoutWebhook(pool, {
      providerEventId: `po_evt_${Date.now()}_a`,
      type: "TRANSFER_SUCCESS",
      transferId: p.transferId,
      payload: {},
    });

    expect(result.processed).toBe(true);
    const after = await statusOf(p.payoutId);
    expect(after.status).toBe("PAID");
    expect(after.paid_at).not.toBeNull();
  });

  test("TRANSFER_FAILED marks it FAILED with a reason", async () => {
    const p = await inFlightPayout();
    await handlePayoutWebhook(pool, {
      providerEventId: `po_evt_${Date.now()}_b`,
      type: "TRANSFER_FAILED",
      transferId: p.transferId,
      payload: {},
    });

    const after = await statusOf(p.payoutId);
    expect(after.status).toBe("FAILED");
    expect(String(after.last_error)).toContain("TRANSFER_FAILED");
  });

  test("the same event id delivered twice is processed once", async () => {
    const p = await inFlightPayout();
    const event = {
      providerEventId: `po_evt_${Date.now()}_dup`,
      type: "TRANSFER_SUCCESS" as const,
      transferId: p.transferId,
      payload: {},
    };

    expect((await handlePayoutWebhook(pool, event)).processed).toBe(true);
    expect((await handlePayoutWebhook(pool, event)).processed).toBe(false);

    const events = await pool.query(
      `select id from webhook_events where provider = 'CASHFREE_PAYOUT' and provider_event_id = $1`,
      [event.providerEventId],
    );
    expect(events.rows).toHaveLength(1);
  });

  // The gateway and the payouts product mint their own event ids independently,
  // so the same string from each must not be mistaken for a duplicate.
  test("a payout event id does not collide with a gateway event id", async () => {
    const p = await inFlightPayout();
    const shared = `shared_${Date.now()}`;
    await pool.query(
      `insert into webhook_events (provider, provider_event_id, payload, processed_at)
       values ('CASHFREE', $1, '{}'::jsonb, now())`,
      [shared],
    );

    const result = await handlePayoutWebhook(pool, {
      providerEventId: shared,
      type: "TRANSFER_SUCCESS",
      transferId: p.transferId,
      payload: {},
    });
    expect(result.processed).toBe(true);
    expect((await statusOf(p.payoutId)).status).toBe("PAID");
  });

  // The webhook names a transfer id; ours are `payout_<payout id>`, so a body
  // naming anything else matches no row rather than paying an arbitrary payout.
  test("an unknown transfer id changes nothing", async () => {
    const p = await inFlightPayout();
    const result = await handlePayoutWebhook(pool, {
      providerEventId: `po_evt_${Date.now()}_unknown`,
      type: "TRANSFER_SUCCESS",
      transferId: "payout_nothinglikethis",
      payload: {},
    });

    // Acknowledged -- there is nothing for Cashfree to retry -- but nothing moved.
    expect(result.processed).toBe(true);
    expect((await statusOf(p.payoutId)).status).toBe("PROCESSING");
  });

  test("a payout already PAID is not re-stamped by a later TRANSFER_FAILED", async () => {
    const p = await inFlightPayout();
    await handlePayoutWebhook(pool, {
      providerEventId: `po_evt_${Date.now()}_p1`,
      type: "TRANSFER_SUCCESS",
      transferId: p.transferId,
      payload: {},
    });
    await handlePayoutWebhook(pool, {
      providerEventId: `po_evt_${Date.now()}_p2`,
      type: "TRANSFER_FAILED",
      transferId: p.transferId,
      payload: {},
    });

    expect((await statusOf(p.payoutId)).status).toBe("PAID");
  });
});
