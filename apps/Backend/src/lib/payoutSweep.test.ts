import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import { createBookableVehicle, createMerchant, futureWindow, insertBooking } from "../test/fixtures.ts";
import type { TransferStatus } from "../providers/cashfreePayout.ts";
import { mapTransferStatus, sanitiseBeneficiaryName } from "../providers/cashfreePayout.ts";
import { sweepPayouts } from "./payoutSweep.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
  // The test database is persistent and never truncated, and every suite that
  // confirms a payment leaves an accrued PENDING payout behind -- there are
  // hundreds, some weeks old. The sweep claims the ten oldest, so without this
  // not one payout created below would ever be in a batch. Stamping an attempt
  // on everything that already exists takes them all out of the running; the
  // rows created in this file have a null last_attempt_at and are the only
  // candidates. Nothing else reads this column.
  await pool.query(
    `update payouts set last_attempt_at = now() where status = 'PENDING' and last_attempt_at is null`,
  );
});

afterAll(async () => {
  await pool.end();
});

type Call = { kind: "transfer" | "get"; transferId: string; amount?: number; name?: string };

function fakePayouts(statuses: TransferStatus[] | TransferStatus, calls: Call[] = []) {
  const queue = Array.isArray(statuses) ? [...statuses] : null;
  const fixed = Array.isArray(statuses) ? null : statuses;
  const next = (): TransferStatus => (queue ? (queue.shift() ?? "PENDING") : fixed!);
  return {
    calls,
    createBeneficiary: async (args: { beneficiaryId: string }) => ({
      beneficiaryId: args.beneficiaryId,
      status: "VERIFIED" as const,
    }),
    transfer: async (args: {
      transferId: string;
      amount: number;
      beneficiaryName: string;
    }) => {
      calls.push({
        kind: "transfer",
        transferId: args.transferId,
        amount: args.amount,
        name: args.beneficiaryName,
      });
      return { transferId: args.transferId, cfTransferId: `cf_${args.transferId}`, status: next() };
    },
    getTransfer: async (transferId: string) => {
      calls.push({ kind: "get", transferId });
      return { status: next() };
    },
  };
}

/** A PENDING payout for a brand-new merchant, with or without a verified payout
 *  account. Its `last_attempt_at` is null, which is what makes it a candidate
 *  (see beforeAll). */
async function pendingPayout(dayOffset: number, account: "verified" | "pending" | "none") {
  const merchant = await createMerchant(pool);
  const vehicle = await createBookableVehicle(pool);
  const { pickupAt, returnAt } = futureWindow(dayOffset);
  const booking = await insertBooking(pool, {
    vehicleId: vehicle.id,
    pickupAt: pickupAt.toISOString(),
    returnAt: returnAt.toISOString(),
  });

  if (account !== "none") {
    await pool.query(
      `insert into merchant_payout_accounts
         (merchant_user_id, provider, provider_account_ref, beneficiary_id, holder_name,
          account_last4, ifsc, status, provider_status)
       values ($1, 'CASHFREE', $2, $2, 'Test Merchant', '4321', 'HDFC0001234', $3, $4)`,
      [
        merchant.id,
        `merch_${String(merchant.id).replace(/-/g, "")}`,
        account === "verified" ? "VERIFIED" : "PENDING",
        account === "verified" ? "VERIFIED" : "INITIATED",
      ],
    );
  }

  const { rows } = await pool.query(
    `insert into payouts (merchant_user_id, booking_id, stage, amount, status)
     values ($1, $2, 'UPFRONT', 25000, 'PENDING')
     returning id`,
    [merchant.id, booking.id],
  );
  return { payoutId: String(rows[0].id), merchantId: merchant.id };
}

async function payout(id: string) {
  const { rows } = await pool.query(
    `select status, provider_payout_id, last_error, attempts, paid_at from payouts where id = $1`,
    [id],
  );
  return rows[0];
}

describe("mapTransferStatus", () => {
  // Cashfree's Payouts API is asynchronous: the create response is usually
  // non-terminal. Treating anything that is not SUCCESS as a failure would mark
  // perfectly good transfers FAILED and never retry them.
  const cases: Array<[TransferStatus, "PENDING" | "PAID" | "FAILED"]> = [
    ["SUCCESS", "PAID"],
    ["FAILED", "FAILED"],
    ["REJECTED", "FAILED"],
    ["REVERSED", "FAILED"],
    ["MANUALLY_REJECTED", "FAILED"],
    ["RECEIVED", "PENDING"],
    ["PENDING", "PENDING"],
    ["APPROVAL_PENDING", "PENDING"],
    ["QUEUED", "PENDING"],
    ["VALIDATION_PENDING", "PENDING"],
  ];
  for (const [vendor, expected] of cases) {
    test(`${vendor} -> ${expected}`, () => {
      expect(mapTransferStatus(vendor)).toBe(expected);
    });
  }

  test("a status Cashfree adds later is PENDING, never PAID", () => {
    expect(mapTransferStatus("SOMETHING_NEW")).toBe("PENDING");
  });
});

describe("sanitiseBeneficiaryName", () => {
  // Documented as alphabets and whitespace only, so a real shop name is often
  // invalid as sent.
  test("strips what the API rejects", () => {
    expect(sanitiseBeneficiaryName("Sharma & Sons Rentals (Pvt) Ltd. 2")).toBe("Sharma Sons Rentals Pvt Ltd");
  });

  test("falls back rather than sending something too short", () => {
    expect(sanitiseBeneficiaryName("7-11")).toBe("Merchant");
  });
});

describe("sweepPayouts", () => {
  test("a verified account gets a transfer, and the payout is PAID", async () => {
    const p = await pendingPayout(600, "verified");
    const client = fakePayouts("SUCCESS");

    await sweepPayouts(pool, client);

    const after = await payout(p.payoutId);
    expect(after.status).toBe("PAID");
    expect(after.paid_at).not.toBeNull();
    expect(after.provider_payout_id).toBe(`payout_${p.payoutId.replace(/-/g, "")}`);
    const mine = client.calls.filter((c) => c.transferId.includes(p.payoutId.replace(/-/g, "")));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.amount).toBe(25000);
  });

  // The failure that matters most: money must not leave for an account nobody
  // has checked.
  test("an unverified payout account is never transferred to", async () => {
    const p = await pendingPayout(610, "pending");
    const client = fakePayouts("SUCCESS");

    await sweepPayouts(pool, client);

    const after = await payout(p.payoutId);
    expect(after.status).toBe("PENDING");
    expect(String(after.last_error)).toContain("not VERIFIED");
    expect(client.calls.some((c) => c.transferId.includes(p.payoutId.replace(/-/g, "")))).toBe(false);
  });

  test("a merchant with no payout account at all says so", async () => {
    const p = await pendingPayout(620, "none");
    await sweepPayouts(pool, fakePayouts("SUCCESS"));

    const after = await payout(p.payoutId);
    expect(after.status).toBe("PENDING");
    expect(String(after.last_error)).toContain("no payout account");
  });

  // The create response is non-terminal, so the first tick must not decide
  // anything; the second polls the same transfer rather than sending a new one.
  test("an in-flight transfer is polled, not re-sent", async () => {
    const p = await pendingPayout(630, "verified");
    const suffix = p.payoutId.replace(/-/g, "");
    const client = fakePayouts(["QUEUED", "SUCCESS"]);

    await sweepPayouts(pool, client);
    expect((await payout(p.payoutId)).status).toBe("PENDING");

    // Clear the backoff the first attempt set, as 5 minutes of wall clock
    // would.
    await pool.query(`update payouts set last_attempt_at = null where id = $1`, [p.payoutId]);
    await sweepPayouts(pool, client);

    const after = await payout(p.payoutId);
    expect(after.status).toBe("PAID");

    const mine = client.calls.filter((c) => c.transferId.includes(suffix));
    expect(mine.map((c) => c.kind)).toEqual(["transfer", "get"]);
  });

  test("a rejected transfer is FAILED with the provider's status recorded", async () => {
    const p = await pendingPayout(640, "verified");
    await sweepPayouts(pool, fakePayouts("REJECTED"));

    const after = await payout(p.payoutId);
    expect(after.status).toBe("FAILED");
    expect(String(after.last_error)).toContain("REJECTED");
  });

  // Same rule as everywhere else in this system: an outage is not a decision.
  test("a thrown transfer leaves the payout PENDING and retryable", async () => {
    const p = await pendingPayout(650, "verified");
    const suffix = p.payoutId.replace(/-/g, "");

    const exploding = {
      ...fakePayouts("SUCCESS"),
      transfer: async (args: { transferId: string }) => {
        if (args.transferId.includes(suffix)) throw new Error("502 Bad Gateway");
        return { transferId: args.transferId, cfTransferId: null, status: "SUCCESS" as const };
      },
    };

    await sweepPayouts(pool, exploding);

    const after = await payout(p.payoutId);
    expect(after.status).toBe("PENDING");
    expect(String(after.last_error)).toContain("502");
  });

  // Without the backoff a permanently-failing transfer would be re-sent every
  // 30 seconds forever.
  test("a payout attempted moments ago is skipped on the next tick", async () => {
    const p = await pendingPayout(660, "verified");
    const suffix = p.payoutId.replace(/-/g, "");
    const client = fakePayouts("QUEUED");

    await sweepPayouts(pool, client);
    const firstCount = client.calls.filter((c) => c.transferId.includes(suffix)).length;
    expect(firstCount).toBe(1);
    expect((await payout(p.payoutId)).attempts).toBe(1);

    await sweepPayouts(pool, client);
    expect(client.calls.filter((c) => c.transferId.includes(suffix)).length).toBe(1);
  });
});
