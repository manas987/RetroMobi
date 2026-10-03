import type { Pool, PoolClient } from "pg";
import type { CashfreeClient } from "../../../providers/cashfree.ts";
import { writeAudit } from "../../../lib/audit.ts";
import { extractTax } from "../../../lib/pricing.ts";

function getPayoutUpfrontPct(): number {
  return Number(process.env.PAYOUT_UPFRONT_PCT ?? 10);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Indian financial year runs April to March, resolved in IST.
function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

async function nextSequenceNumber(
  client: PoolClient,
  issuerType: "MERCHANT" | "PLATFORM",
  shopId: string | null,
  fy: string,
): Promise<number> {
  const { rows } = await client.query(
    `insert into invoice_sequences (issuer_type, shop_id, financial_year, last_number)
     values ($1, $2, $3, 1)
     on conflict (issuer_type, coalesce(shop_id, '00000000-0000-0000-0000-000000000000'::uuid), financial_year)
     do update set last_number = invoice_sequences.last_number + 1, updated_at = now()
     returning last_number`,
    [issuerType, shopId, fy],
  );
  return rows[0].last_number;
}

async function allocateInvoice(
  client: PoolClient,
  args: {
    groupId: string;
    shopId: string | null;
    issuerType: "MERCHANT" | "PLATFORM";
    issuerGstin: string | null;
    /** TAX-INCLUSIVE amount this invoice covers. The tax is extracted, never added. */
    inclusiveAmount: number;
  },
) {
  const fy = financialYear(new Date());
  const sequenceNumber = await nextSequenceNumber(client, args.issuerType, args.shopId, fy);
  // backend.md's documented format (`RM/<FY>/<seq>`) collides globally: sequences
  // are scoped per issuer+shop, but invoices.invoice_number has a DB-wide unique
  // constraint, so a MERCHANT invoice for shop A and the PLATFORM invoice both
  // reach sequence_number=1 and produce the identical string. Disambiguating with
  // the issuer/shop segment is the minimal fix that keeps the format readable and
  // the sequence counter exactly as specified -- flagged in progress.md, not
  // invented silently.
  const issuerSegment = args.issuerType === "PLATFORM" ? "PLATFORM" : args.shopId!.slice(0, 8);
  const invoiceNumber = `RM/${fy}/${issuerSegment}/${String(sequenceNumber).padStart(6, "0")}`;

  // Prices are tax-inclusive, so the GST is carved out of the amount rather than
  // added to it, and `total` is the inclusive figure the customer actually paid.
  const gstRate = Number(process.env.GST_RATE ?? 18);
  const taxAmount = extractTax(args.inclusiveAmount, gstRate);
  const taxableAmount = args.inclusiveAmount - taxAmount;

  // RetroMobi operates in a single state, so every supply is intra-state and splits
  // into CGST + SGST. Halving an odd paise amount would lose a paise, so SGST takes
  // the remainder and the three heads always sum back to taxAmount.
  //
  // ponytail: IGST is hardcoded to 0. The moment a shop is onboarded outside the
  // platform's own state, the platform-fee invoice becomes an inter-state supply and
  // this is wrong -- at which point put the whole tax amount in `igst` when the
  // supplier's state differs from the place of supply. Inter-state supply also
  // forces GST registration on every merchant regardless of turnover, which would
  // retire the no-GSTIN path below, so that expansion is a tax conversation and not
  // just a code change.
  const cgst = Math.floor(taxAmount / 2);
  const sgst = taxAmount - cgst;
  const igst = 0;

  await client.query(
    `insert into invoices
       (booking_group_id, shop_id, issuer_type, issuer_gstin, financial_year, sequence_number,
        invoice_number, taxable_amount, cgst, sgst, igst, total)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      args.groupId,
      args.shopId,
      args.issuerType,
      args.issuerGstin,
      fy,
      sequenceNumber,
      invoiceNumber,
      taxableAmount,
      cgst,
      sgst,
      igst,
      args.inclusiveAmount,
    ],
  );
}

export async function createPaymentIntent(
  pool: Pool,
  input: { groupId: string; userId: string },
  cashfree: CashfreeClient,
): Promise<{ orderId: string; paymentSessionId: string; expiresAt: Date }> {
  const { rows } = await pool.query(
    `select g.hold_expires_at, g.total_amount, u.phone
       from booking_groups g
       join users u on u.id = g.user_id
      where g.id = $1 and g.user_id = $2 and g.deleted_at is null`,
    [input.groupId, input.userId],
  );
  if (rows.length === 0) throw new Error("booking group not found");
  const group = rows[0];

  const orderId = `order_${input.groupId}`;
  const order = await cashfree.createOrder({
    orderId,
    amount: Number(group.total_amount),
    expiresAt: new Date(group.hold_expires_at),
    customerPhone: group.phone,
  });

  // orderId is deterministic (`order_<groupId>`), so a customer who backs out of
  // the Cashfree sheet and retries checkout would otherwise accumulate PENDING
  // rows that all share one provider_order_id -- after which the webhook's
  // `where provider_order_id = $1` lookup picks an arbitrary one and the rest are
  // stranded. One live payment row per order, reused on retry.
  await pool.query(
    `insert into payments (booking_group_id, provider_order_id, type, amount, status)
     select $1, $2, 'RENTAL', $3, 'PENDING'
      where not exists (
        select 1 from payments
         where provider_order_id = $2 and status in ('PENDING', 'AUTHORIZED', 'SUCCEEDED')
      )`,
    [input.groupId, order.orderId, group.total_amount],
  );

  return order;
}

export async function handlePaymentWebhook(
  pool: Pool,
  event: {
    providerEventId: string;
    type: "PAYMENT_SUCCESS" | "PAYMENT_FAILED" | "REFUND_SUCCESS";
    orderId: string;
    payload: unknown;
  },
  cashfree: CashfreeClient,
): Promise<{ processed: boolean }> {
  // "Insert first, conflict means already handled" is only safe if the insert and
  // the processing commit together -- which they cannot here, because confirmation
  // runs in its own transaction. With plain `do nothing`, an event whose processing
  // threw left a row with processed_at still null, and Cashfree's retry of that same
  // event then hit the conflict and was acknowledged as a duplicate: the customer
  // paid, the booking stayed HOLD, and the hold swept away. So the conflict path
  // claims the row only when it has NOT been processed, which makes a retry
  // reprocess exactly the events that failed and skip the ones that succeeded.
  const inserted = await pool.query(
    `insert into webhook_events (provider, provider_event_id, payload)
     values ('CASHFREE', $1, $2)
     on conflict (provider, provider_event_id) do update
       set payload = excluded.payload, received_at = now()
     where webhook_events.processed_at is null
     returning id`,
    [event.providerEventId, JSON.stringify(event.payload)],
  );
  if (inserted.rows.length === 0) return { processed: false };
  const webhookEventId = inserted.rows[0].id;

  if (event.type === "REFUND_SUCCESS") {
    const refundRef = (event.payload as { refundId?: string } | null)?.refundId ?? event.orderId;
    await pool.query(`update refunds set status = 'SUCCEEDED', updated_at = now() where provider_ref = $1`, [
      refundRef,
    ]);
    await pool.query(`update webhook_events set processed_at = now() where id = $1`, [webhookEventId]);
    return { processed: true };
  }

  if (event.type === "PAYMENT_FAILED") {
    await pool.query(`update payments set status = 'FAILED', updated_at = now() where provider_order_id = $1`, [
      event.orderId,
    ]);
    await pool.query(`update webhook_events set processed_at = now() where id = $1`, [webhookEventId]);
    return { processed: true };
  }

  // PAYMENT_SUCCESS
  const { rows: paymentRows } = await pool.query(
    `select p.id, p.booking_group_id, p.amount, g.hold_expires_at
       from payments p
       join booking_groups g on g.id = p.booking_group_id
      where p.provider_order_id = $1`,
    [event.orderId],
  );
  if (paymentRows.length === 0) throw new Error(`no payment found for order ${event.orderId}`);
  const payment = paymentRows[0];

  if (new Date(payment.hold_expires_at).getTime() < Date.now()) {
    // The hold died before payment landed. Refund in full, confirm nothing.
    const refund = await cashfree.refund({
      orderId: event.orderId,
      refundId: `refund_${payment.id}`,
      amount: Number(payment.amount),
    });
    await pool.query(`update payments set status = 'SUCCEEDED', updated_at = now() where id = $1`, [payment.id]);
    await pool.query(
      `insert into refunds (payment_id, amount, reason, provider_ref, status)
       values ($1, $2, 'HOLD_EXPIRED_BEFORE_PAYMENT', $3, 'PENDING')`,
      [payment.id, payment.amount, refund.refundId],
    );
    await pool.query(`update webhook_events set processed_at = now() where id = $1`, [webhookEventId]);
    return { processed: true };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`update payments set status = 'SUCCEEDED', updated_at = now() where id = $1`, [payment.id]);
    // Only HOLD rows that are still live: a booking cancelled out of the group
    // before payment landed must not be resurrected into CONFIRMED.
    await client.query(
      `update bookings set status = 'CONFIRMED', updated_at = now()
        where group_id = $1 and status = 'HOLD' and deleted_at is null`,
      [payment.booking_group_id],
    );

    const { rows: bookings } = await client.query(
      `select b.id, b.rental_amount, b.security_deposit_amount, b.platform_fee, b.tax_amount,
              b.discount_amount, v.shop_id, s.merchant_user_id, s.gstin
         from bookings b
         join vehicles v on v.id = b.vehicle_id
         join shops s on s.id = v.shop_id
        where b.group_id = $1 and b.deleted_at is null`,
      [payment.booking_group_id],
    );

    const payoutUpfrontPct = getPayoutUpfrontPct();

    for (const booking of bookings) {
      await client.query(
        `insert into security_deposits (booking_id, amount, status, held_at)
         values ($1, $2, 'HELD', now())`,
        [booking.id, booking.security_deposit_amount],
      );

      const upfront = Math.round((Number(booking.rental_amount) * payoutUpfrontPct) / 100);
      await client.query(
        `insert into payouts (merchant_user_id, booking_id, stage, amount, status)
         values ($1, $2, 'UPFRONT', $3, 'PENDING')`,
        [booking.merchant_user_id, booking.id, upfront],
      );
    }

    // The merchant is invoiced for their FULL listed price: they receive it in full,
    // and a coupon discount is a platform marketing cost, not a price reduction the
    // shop granted. So the discount comes off the platform's own invoice instead.
    const byShop = new Map<string, { gstin: string | null; rentalAmount: number }>();
    let platformFeeTotal = 0;
    let discountTotal = 0;
    for (const booking of bookings) {
      const entry = byShop.get(booking.shop_id) ?? { gstin: booking.gstin, rentalAmount: 0 };
      entry.rentalAmount += Number(booking.rental_amount);
      byShop.set(booking.shop_id, entry);
      platformFeeTotal += Number(booking.platform_fee);
      discountTotal += Number(booking.discount_amount);
    }

    for (const [shopId, entry] of byShop) {
      // A shop under the GST registration threshold has no GSTIN and cannot legally
      // issue a tax invoice, so it gets none -- its listed price is simply its price.
      // Only RetroMobi's platform-fee invoice is raised for that booking.
      if (!entry.gstin) continue;

      await allocateInvoice(client, {
        groupId: payment.booking_group_id,
        shopId,
        issuerType: "MERCHANT",
        issuerGstin: entry.gstin,
        inclusiveAmount: entry.rentalAmount,
      });
    }

    await allocateInvoice(client, {
      groupId: payment.booking_group_id,
      shopId: null,
      issuerType: "PLATFORM",
      issuerGstin: process.env.PLATFORM_GSTIN ?? null,
      inclusiveAmount: Math.max(0, platformFeeTotal - discountTotal),
    });

    const { rows: groupRows } = await client.query(
      `select coupon_id from booking_groups where id = $1`,
      [payment.booking_group_id],
    );
    if (groupRows[0]?.coupon_id) {
      await client.query(`update coupons set used_count = used_count + 1 where id = $1`, [
        groupRows[0].coupon_id,
      ]);
    }

    await writeAudit(client, {
      actorType: "SYSTEM",
      actorId: null,
      action: "payment.confirmed",
      entityType: "booking_group",
      entityId: payment.booking_group_id,
      after: { paymentId: payment.id },
    });

    // Inside the transaction, deliberately: processed_at and the confirmation it
    // describes have to become true at the same instant, or the retry logic above
    // cannot tell a handled event from a half-handled one.
    await client.query(`update webhook_events set processed_at = now() where id = $1`, [webhookEventId]);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { processed: true };
}
