import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import {
  createBookableVehicle,
  createMerchant,
  createShop,
  futureWindow,
  insertBooking,
  uniquePhone,
} from "../test/fixtures.ts";
import type { TransferStatus } from "../providers/cashfreePayout.ts";
import { mapTransferStatus, sanitiseBeneficiaryName } from "../providers/cashfreePayout.ts";
import {
  adjustWallet,
  listShopWallets,
  payShopDirectly,
  InsufficientWalletBalanceError,
  PayoutAccountNotReadyError,
  WithdrawalBelowMinimumError,
  WithdrawalStateError,
  getWallet,
  payWithdrawal,
  rejectWithdrawal,
  requestWithdrawal,
  sweepWithdrawals,
  walletBalance,
} from "./wallet.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

let adminId: string;

beforeAll(async () => {
  await applyMigrations(pool);
  const { rows } = await pool.query(
    `insert into admins (phone, name, role, status) values ($1, 'Wallet Admin', 'SUPER_ADMIN', 'ACTIVE') returning id`,
    [uniquePhone()],
  );
  adminId = rows[0].id;
});

afterAll(async () => {
  await pool.end();
});

/** A shop whose wallet holds `credited` paise, from one booking's UPFRONT credit. */
async function shopWithBalance(credited: number, account: "verified" | "none" = "none", dayOffset = 700) {
  const merchant = await createMerchant(pool);
  const shop = await createShop(pool, merchant.id);
  const vehicle = await createBookableVehicle(pool, { shopId: shop.id });
  const { pickupAt, returnAt } = futureWindow(dayOffset + Math.floor(Math.random() * 300));
  const booking = await insertBooking(pool, {
    vehicleId: vehicle.id,
    pickupAt: pickupAt.toISOString(),
    returnAt: returnAt.toISOString(),
  });
  await pool.query(
    `insert into payouts (merchant_user_id, booking_id, stage, amount, status)
     values ($1, $2, 'UPFRONT', $3, 'CREDITED')`,
    [merchant.id, booking.id, credited],
  );
  if (account === "verified") {
    await pool.query(
      `insert into merchant_payout_accounts
         (merchant_user_id, provider, provider_account_ref, beneficiary_id, holder_name,
          account_last4, ifsc, status, provider_status)
       values ($1, 'CASHFREE', $2, $2, 'Test Merchant', '4321', 'HDFC0001234', 'VERIFIED', 'VERIFIED')`,
      [merchant.id, `merch_${String(merchant.id).replace(/-/g, "")}`],
    );
  }
  return { shopId: shop.id, merchantId: merchant.id };
}

type Call = { kind: "transfer" | "get"; transferId: string; amount?: number };

/** `known` = what getTransfer answers before any transfer is sent (null = never seen). */
function fakePayouts(status: TransferStatus, calls: Call[] = [], known: TransferStatus | null = null) {
  const sent = new Set<string>();
  return {
    calls,
    createBeneficiary: async (args: { beneficiaryId: string }) => ({
      beneficiaryId: args.beneficiaryId,
      status: "VERIFIED" as const,
    }),
    transfer: async (args: { transferId: string; amount: number }) => {
      calls.push({ kind: "transfer", transferId: args.transferId, amount: args.amount });
      sent.add(args.transferId);
      return { transferId: args.transferId, cfTransferId: `cf_${args.transferId}`, status };
    },
    getTransfer: async (transferId: string) => {
      calls.push({ kind: "get", transferId });
      if (sent.has(transferId)) return { status };
      return known ? { status: known } : null;
    },
  };
}

async function withdrawal(id: string) {
  const { rows } = await pool.query(`select * from wallet_withdrawals where id = $1`, [id]);
  return rows[0];
}

describe("requestWithdrawal", () => {
  test("credits make the balance; a request holds the money at once", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000);
    expect((await walletBalance(pool, shopId)).available).toBe(80_000);

    await requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000, payTo: "shop@upi" });
    const after = await walletBalance(pool, shopId);
    expect(after.available).toBe(20_000);
    expect(after.inFlight).toBe(60_000);
  });

  test("the same money cannot be requested twice", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000);
    await requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000 });
    await expect(
      requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000 }),
    ).rejects.toBeInstanceOf(InsufficientWalletBalanceError);
  });

  test("two requests at the same moment cannot both spend one balance", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000);
    const results = await Promise.allSettled([
      requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000 }),
      requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await walletBalance(pool, shopId)).available).toBe(20_000);
  });

  test("below the minimum is refused", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000);
    await expect(
      requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 10_000 }),
    ).rejects.toBeInstanceOf(WithdrawalBelowMinimumError);
  });

  test("an accrual still waiting on an old per-booking transfer is not in the wallet", async () => {
    const { shopId } = await shopWithBalance(80_000);
    await pool.query(
      `update payouts set status = 'PENDING', provider_payout_id = 'payout_legacy'
        where booking_id in (select b.id from bookings b join vehicles v on v.id = b.vehicle_id where v.shop_id = $1)`,
      [shopId],
    );
    expect((await walletBalance(pool, shopId)).available).toBe(0);
  });
});

describe("admin settles a withdrawal", () => {
  test("rejecting releases the money and clears the pay-to details", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000);
    const w = await requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000, payTo: "shop@upi" });
    await rejectWithdrawal(pool, { withdrawalId: w.id, adminId, reason: "bank details mismatch" });

    expect((await walletBalance(pool, shopId)).available).toBe(80_000);
    const row = await withdrawal(w.id);
    expect(row.status).toBe("REJECTED");
    expect(row.pay_to).toBeNull();
  });

  test("paid in cash: PAID at once, with its reference, and the money is gone", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000);
    const w = await requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000 });
    await payWithdrawal(pool, { withdrawalId: w.id, adminId, method: "CASH", reference: "RCPT-0042" });

    const row = await withdrawal(w.id);
    expect(row.status).toBe("PAID");
    expect(row.reference).toBe("RCPT-0042");
    expect(row.processed_by).toBe(adminId);
    const balance = await walletBalance(pool, shopId);
    expect(balance.paidOut).toBe(60_000);
    expect(balance.available).toBe(20_000);
  });

  test("an offline payment without a reference is refused", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000);
    const w = await requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000 });
    await expect(
      payWithdrawal(pool, { withdrawalId: w.id, adminId, method: "UPI" }),
    ).rejects.toBeInstanceOf(WithdrawalStateError);
  });

  test("a settled withdrawal cannot be settled again", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000);
    const w = await requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000 });
    await payWithdrawal(pool, { withdrawalId: w.id, adminId, method: "BANK_TRANSFER", reference: "UTR123" });
    await expect(
      rejectWithdrawal(pool, { withdrawalId: w.id, adminId, reason: "oops" }),
    ).rejects.toBeInstanceOf(WithdrawalStateError);
  });

  test("Cashfree needs a VERIFIED payout account", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000, "none");
    const w = await requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 60_000 });
    await expect(
      payWithdrawal(pool, { withdrawalId: w.id, adminId, method: "CASHFREE_PAYOUT" }),
    ).rejects.toBeInstanceOf(PayoutAccountNotReadyError);
  });
});

describe("sweepWithdrawals", () => {
  async function processing(account: "verified" | "none" = "verified") {
    const shop = await shopWithBalance(80_000, account);
    const w = await requestWithdrawal(pool, { shopId: shop.shopId, requestedBy: shop.merchantId, amount: 60_000 });
    await payWithdrawal(pool, { withdrawalId: w.id, adminId, method: "CASHFREE_PAYOUT" });
    return { ...shop, id: w.id as string, transferId: `wd_${String(w.id).replace(/-/g, "")}` };
  }

  test("a successful transfer is PAID", async () => {
    const w = await processing();
    const client = fakePayouts("SUCCESS");
    await sweepWithdrawals(pool, client);

    const row = await withdrawal(w.id);
    expect(row.status).toBe("PAID");
    const mine = client.calls.filter((c) => c.kind === "transfer" && c.transferId === w.transferId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.amount).toBe(60_000);
  });

  test("a failed transfer is FAILED and the money returns to the wallet", async () => {
    const w = await processing();
    await sweepWithdrawals(pool, fakePayouts("REJECTED"));

    expect((await withdrawal(w.id)).status).toBe("FAILED");
    expect((await walletBalance(pool, w.shopId)).available).toBe(80_000);
  });

  test("a transfer Cashfree already knows is polled, never sent again", async () => {
    const w = await processing();
    const client = fakePayouts("SUCCESS", [], "SUCCESS");
    await sweepWithdrawals(pool, client);

    expect(client.calls.some((c) => c.kind === "transfer" && c.transferId === w.transferId)).toBe(false);
    expect((await withdrawal(w.id)).status).toBe("PAID");
  });

  test("a non-terminal status stays PROCESSING and holds the money", async () => {
    const w = await processing();
    await sweepWithdrawals(pool, fakePayouts("QUEUED"));

    const row = await withdrawal(w.id);
    expect(row.status).toBe("PROCESSING");
    expect(row.provider_status).toBe("QUEUED");
    expect((await walletBalance(pool, w.shopId)).available).toBe(20_000);
  });

  test("an outage leaves it PROCESSING with the reason recorded", async () => {
    const w = await processing();
    const broken = {
      ...fakePayouts("SUCCESS"),
      getTransfer: async () => {
        throw new Error("cashfree down");
      },
    };
    await sweepWithdrawals(pool, broken);

    const row = await withdrawal(w.id);
    expect(row.status).toBe("PROCESSING");
    expect(row.last_error).toBe("cashfree down");
  });
});

describe("admin pays or corrects a wallet directly", () => {
  test("paying a shop without a request: PAID in one step, no minimum, never above the balance", async () => {
    const { shopId } = await shopWithBalance(80_000);
    const w = await payShopDirectly(pool, { shopId, adminId, amount: 1_000, method: "CASH", reference: "COUNTER-1" });
    expect(w.status).toBe("PAID");
    expect(w.requested_by).toBeNull();
    expect((await walletBalance(pool, shopId)).available).toBe(79_000);
    await expect(
      payShopDirectly(pool, { shopId, adminId, amount: 90_000, method: "CASH", reference: "COUNTER-2" }),
    ).rejects.toBeInstanceOf(InsufficientWalletBalanceError);
  });

  test("a failed direct Cashfree payout leaves nothing behind", async () => {
    const { shopId } = await shopWithBalance(80_000, "none");
    await expect(
      payShopDirectly(pool, { shopId, adminId, amount: 10_000, method: "CASHFREE_PAYOUT" }),
    ).rejects.toBeInstanceOf(PayoutAccountNotReadyError);
    const { rows } = await pool.query(`select count(*)::int as n from wallet_withdrawals where shop_id = $1`, [shopId]);
    expect(rows[0].n).toBe(0);
  });

  test("adjustments add to the balance and cannot take it below zero", async () => {
    const { shopId } = await shopWithBalance(80_000);
    await adjustWallet(pool, { shopId, adminId, amount: 5_000, reason: "goodwill for a late payout" });
    expect((await walletBalance(pool, shopId)).available).toBe(85_000);
    await expect(
      adjustWallet(pool, { shopId, adminId, amount: -100_000, reason: "too much" }),
    ).rejects.toBeInstanceOf(InsufficientWalletBalanceError);

    const listed = (await listShopWallets(pool)).find((w) => w.shopId === shopId)!;
    expect(listed.available).toBe(85_000);
    expect(listed.adjusted).toBe(5_000);
  });
});

describe("getWallet", () => {
  test("lists credits and withdrawals with the balance", async () => {
    const { shopId, merchantId } = await shopWithBalance(80_000);
    await requestWithdrawal(pool, { shopId, requestedBy: merchantId, amount: 50_000 });
    const wallet = await getWallet(pool, shopId);
    expect(wallet.available).toBe(30_000);
    expect(wallet.credits).toHaveLength(1);
    expect(wallet.withdrawals).toHaveLength(1);
    expect(wallet.minWithdrawal).toBe(50_000);
  });
});

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
