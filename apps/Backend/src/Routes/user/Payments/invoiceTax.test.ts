// Prices are TAX-INCLUSIVE (decided 2026-10-03): the customer is quoted one all-in
// number and the GST is carved out of it per invoice, never added on top. These
// tests pin the two things that are easy to silently break -- that the invoice
// totals reconcile to what was actually charged, and that a shop with no GSTIN
// gets no tax invoice at all.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  createBookableVehicle,
  createMerchant,
  createRider,
  createShop,
  createUser,
  futureWindow,
} from "../../../test/fixtures.ts";
import { createHold } from "../Bookings/bookingsService.ts";
import { createPaymentIntent, handlePaymentWebhook } from "./paymentsService.ts";

// A PLATFORM tax invoice is only issued when RetroMobi has a GSTIN, so these tests
// supply one. Without it the platform invoice is correctly skipped.
// Truthiness, not ??= : .env ships PLATFORM_GSTIN as an empty string, which is
// not null, so ??= would leave it empty and the platform invoice would be skipped.
if (!process.env.PLATFORM_GSTIN) process.env.PLATFORM_GSTIN = "05ABCDE1234F1Z5";

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

const fakeCashfree = {
  createOrder: async (args: { orderId: string; amount: number; expiresAt: Date }) => ({
    orderId: args.orderId,
    paymentSessionId: `session_${args.orderId}`,
    expiresAt: args.expiresAt,
  }),
  refund: async (args: { refundId: string }) => ({ refundId: args.refundId, status: "PENDING" as const }),
  transfer: async () => ({ transferId: `tr_${Date.now()}`, status: "PENDING" as const }),
  verifyWebhookSignature: () => true,
};

async function paidBookingAtShop(dayOffset: number, shopId?: string) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id);
  const vehicle = await createBookableVehicle(pool, {
    shopId,
    amount: 100_000,
    weekendAmount: 100_000,
  });
  const { pickupAt, returnAt } = futureWindow(dayOffset, 1);

  const held = await createHold(pool, {
    userId: user.id,
    items: [{ vehicleId: vehicle.id, riderId: rider.id }],
    pickupAt,
    returnAt,
  });
  await createPaymentIntent(pool, { groupId: held.groupId, userId: user.id }, fakeCashfree);
  await handlePaymentWebhook(
    pool,
    {
      providerEventId: `evt_tax_${held.groupId}`,
      type: "PAYMENT_SUCCESS",
      orderId: `order_${held.groupId}`,
      payload: {},
    },
    fakeCashfree,
  );
  return { groupId: held.groupId, bookingId: held.bookings[0]!.id };
}

describe("tax-inclusive invoicing", () => {
  test("each invoice's taxable + tax equals the inclusive amount charged", async () => {
    const b = await paidBookingAtShop(500);

    const { rows } = await pool.query(
      `select issuer_type, taxable_amount, cgst, sgst, igst, total
         from invoices where booking_group_id = $1 order by issuer_type`,
      [b.groupId],
    );
    expect(rows).toHaveLength(2);

    for (const inv of rows) {
      const tax = Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst);
      expect(Number(inv.taxable_amount) + tax).toBe(Number(inv.total));
      expect(tax).toBeGreaterThan(0);
    }
  });

  test("the two invoice totals together equal what the customer paid, less the deposit", async () => {
    const b = await paidBookingAtShop(510);

    const { rows: bookingRows } = await pool.query(
      `select rental_amount, platform_fee, discount_amount, security_deposit_amount, total_amount
         from bookings where id = $1`,
      [b.bookingId],
    );
    const bk = bookingRows[0];

    const { rows: invoiceRows } = await pool.query(
      `select coalesce(sum(total), 0) as sum from invoices where booking_group_id = $1`,
      [b.groupId],
    );

    const chargedExcludingDeposit = Number(bk.total_amount) - Number(bk.security_deposit_amount);
    expect(Number(invoiceRows[0].sum)).toBe(chargedExcludingDeposit);
    // And the deposit really is outside the invoiced total -- it is a refundable
    // security, not a supply.
    expect(Number(bk.total_amount)).toBe(chargedExcludingDeposit + Number(bk.security_deposit_amount));
  });

  // RetroMobi operates in one state, so every supply is intra-state. IGST never
  // arises; if this test ever fails, someone onboarded a shop out of state and the
  // tax heads are now wrong -- see the ponytail note in paymentsService.ts.
  test("every invoice splits into CGST + SGST and never IGST", async () => {
    const b = await paidBookingAtShop(520);

    const { rows } = await pool.query(
      `select issuer_type, cgst, sgst, igst from invoices where booking_group_id = $1`,
      [b.groupId],
    );
    expect(rows.length).toBeGreaterThan(0);

    for (const inv of rows) {
      expect(Number(inv.igst)).toBe(0);
      expect(Number(inv.cgst)).toBeGreaterThan(0);
      // SGST carries the odd paise, so the two halves are equal or differ by one.
      expect(Number(inv.sgst) - Number(inv.cgst)).toBeLessThanOrEqual(1);
    }
  });

  // RetroMobi is not GST-registered yet. Confirmation must still work end to end:
  // the booking confirms, the deposit is held, the merchant is paid. Only the
  // platform's own tax document is withheld, because it cannot legally issue one.
  test("no platform GSTIN means no platform invoice, and the booking still confirms", async () => {
    const original = process.env.PLATFORM_GSTIN;
    process.env.PLATFORM_GSTIN = "";
    try {
      const b = await paidBookingAtShop(540);

      const { rows: invoices } = await pool.query(
        `select issuer_type from invoices where booking_group_id = $1`,
        [b.groupId],
      );
      expect(invoices.map((r) => r.issuer_type)).toEqual(["MERCHANT"]);

      const { rows: booking } = await pool.query(`select status from bookings where id = $1`, [
        b.bookingId,
      ]);
      expect(booking[0].status).toBe("CONFIRMED");

      const { rows: payouts } = await pool.query(
        `select stage from payouts where booking_id = $1`,
        [b.bookingId],
      );
      expect(payouts.map((r) => r.stage)).toEqual(["UPFRONT"]);

      const { rows: deposits } = await pool.query(
        `select status from security_deposits where booking_id = $1`,
        [b.bookingId],
      );
      expect(deposits[0].status).toBe("HELD");
    } finally {
      process.env.PLATFORM_GSTIN = original;
    }
  });

  test("a shop with no GSTIN gets no tax invoice, only the platform one", async () => {
    const merchant = await createMerchant(pool);
    const unregistered = await createShop(pool, merchant.id, { gstin: null });
    const b = await paidBookingAtShop(530, unregistered.id);

    const { rows } = await pool.query(
      `select issuer_type from invoices where booking_group_id = $1`,
      [b.groupId],
    );
    expect(rows.map((r) => r.issuer_type)).toEqual(["PLATFORM"]);
  });
});
