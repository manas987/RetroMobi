import type { Pool, PoolClient } from "pg";
import { composeTotal, priceRental, refundForCancellation } from "../../../lib/pricing.ts";
import { writeAudit } from "../../../lib/audit.ts";
import { notify } from "../../../lib/notify.ts";
import { extensionWindowAvailable, notBlocked, PUBLIC_LISTING_ELIGIBLE, VEHICLE_LICENCE_JOIN } from "../../../lib/vehicleBookingRules.ts";
import {
  evaluateRiderForVehicle,
  flagSessionForReview,
  istDate,
} from "../../../lib/licenceGate.ts";
import { appBaseUrl, cashfreeMode, type CashfreeClient } from "../../../providers/cashfree.ts";
import { handleExtensionPaymentSuccess } from "../Payments/paymentsService.ts";
import { evaluateCoupon, loadLiveCoupon, type CartItem } from "../../../lib/coupons.ts";

export class VehicleUnavailableError extends Error {}
export class TooManyVehiclesError extends Error {}
export class InvalidDurationError extends Error {}
export class LicenceInvalidError extends Error {}
/**
 * The licence could not be judged either way -- an RTO that returned no status,
 * a class of vehicle nobody has mapped. Separate from LicenceInvalidError
 * because telling a customer their licence is invalid when it is our data that
 * is missing is both wrong and the kind of thing they phone about.
 */
export class LicenceReviewRequiredError extends Error {}
export class CouponInvalidError extends Error {}
export class BookingNotCancellableError extends Error {}
export class ExtensionPendingError extends Error {}
export class BookingNotExtendableError extends Error {}
export class RiderUnavailableError extends Error {}
export class DuplicateRiderError extends Error {}

const EXCLUSION_VIOLATION = "23P01";
const UNIQUE_VIOLATION = "23505";

/** Device clocks drift. Two minutes absorbs that without admitting a real past window. */
const PAST_PICKUP_GRACE_MS = 2 * 60 * 1000;

function getMoneyConfig() {
  return {
    platformFeePct: Number(process.env.PLATFORM_FEE_PCT ?? 10),
    gstRate: Number(process.env.GST_RATE ?? 18),
  };
}

async function loadPricingAndSpecials(client: PoolClient, vehicleId: string) {
  const { rows } = await client.query(
    `select id, amount, weekend_amount, security_deposit_amount from vehicle_pricing where vehicle_id = $1`,
    [vehicleId],
  );
  if (rows.length === 0) throw new VehicleUnavailableError(`no pricing for vehicle ${vehicleId}`);
  const pricing = rows[0];

  const { rows: specialRows } = await client.query(
    `select amount, weekend_amount, effective_from::text, effective_until::text
       from special_pricings where vehicle_pricing_id = $1 and deleted_at is null order by created_at, id`,
    [pricing.id],
  );

  return {
    pricing: {
      amount: Number(pricing.amount),
      weekendAmount: Number(pricing.weekend_amount),
      securityDepositAmount: Number(pricing.security_deposit_amount),
    },
    specials: specialRows.map((s) => ({
      amount: Number(s.amount),
      weekendAmount: Number(s.weekend_amount),
      effectiveFrom: s.effective_from,
      effectiveUntil: s.effective_until,
    })),
  };
}

/**
 * Checks every vehicle is bookable for the window and prices it. Shared by the
 * hold and the coupon preview, so the preview's discount is computed on exactly
 * the prices the hold will charge.
 */
export async function priceCart(
  client: PoolClient,
  input: { items: Array<{ vehicleId: string; riderId: string }>; pickupAt: Date; returnAt: Date },
): Promise<Array<CartItem & { securityDepositAmount: number }>> {
  const priced: Array<CartItem & { securityDepositAmount: number }> = [];
  for (const item of input.items) {
    // `notBlocked` is not decoration: the exclusion constraint arbitrates
    // booking-vs-booking only, so without it a shop could take a scooter off the
    // road for servicing and still have it booked and paid for -- the customer
    // finding out at the counter. Search has always filtered on it; this path
    // never did, and a cart in localStorage is the ordinary way a stale
    // vehicleId arrives here.
    const vehicleCheck = await client.query(
      `select v.id, v.shop_id, v.model_id from vehicles v join shops s on s.id = v.shop_id
        ${VEHICLE_LICENCE_JOIN} where v.id = $1 and ${PUBLIC_LISTING_ELIGIBLE}
        and ${notBlocked("v.id")}`,
      [item.vehicleId, input.pickupAt, input.returnAt],
    );
    if (vehicleCheck.rows.length === 0) {
      throw new VehicleUnavailableError(`vehicle ${item.vehicleId} is not available`);
    }
    const { pricing, specials } = await loadPricingAndSpecials(client, item.vehicleId);
    const { rentalAmount } = priceRental({
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
      pricing,
      specialPricings: specials,
    });
    priced.push({
      vehicleId: item.vehicleId,
      riderId: item.riderId,
      shopId: String(vehicleCheck.rows[0].shop_id),
      modelId: String(vehicleCheck.rows[0].model_id),
      rentalAmount,
      securityDepositAmount: pricing.securityDepositAmount,
    });
  }
  return priced;
}

export async function createHold(
  pool: Pool,
  input: {
    userId: string;
    items: Array<{ vehicleId: string; riderId: string }>;
    pickupAt: Date;
    returnAt: Date;
    couponCode?: string;
  },
): Promise<{
  groupId: string;
  bookings: Array<{ id: string; vehicleId: string }>;
  holdExpiresAt: Date;
  totals: {
    rentalAmount: number;
    platformFee: number;
    taxAmount: number;
    discountAmount: number;
    securityDepositAmount: number;
    totalAmount: number;
  };
}> {
  const { userId, items, pickupAt, returnAt, couponCode } = input;

  if (items.length > 5) throw new TooManyVehiclesError("at most 5 vehicles per checkout");
  if (returnAt.getTime() <= pickupAt.getTime()) throw new InvalidDurationError("return must be after pickup");
  // A pickup that has already happened is not a rental anyone can collect. The
  // realistic way to reach it is not abuse but delay: the customer picks today
  // 2pm, verifies a rider's licence, and submits at 2:40. PAST_PICKUP_GRACE_MS
  // is for device clock skew, nothing else.
  if (pickupAt.getTime() < Date.now() - PAST_PICKUP_GRACE_MS) {
    throw new InvalidDurationError("That pickup time has passed. Choose a later one.");
  }
  // One rider can't ride two scooters in the same window -- the exclusion
  // constraint below also catches this, but failing fast here skips a wasted
  // round of pricing/insert work for the obviously-invalid case.
  if (new Set(items.map((i) => i.riderId)).size !== items.length) {
    throw new DuplicateRiderError("the same rider is assigned to more than one vehicle");
  }

  const { platformFeePct, gstRate } = getMoneyConfig();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Every rider in the checkout must belong to this account and be entitled
    // to the vehicle they are assigned, for the whole rental -- not just hold
    // some licence, and not just be licensed at pickup. The entitlement half
    // is new: driving_licence_categories had been collected since 0006 and
    // read by nothing, so a gearless-scooter licence could book a motorcycle.
    // lib/licenceGate.ts is shared with the handover gate so the two cannot
    // drift apart.
    for (const item of items) {
      const gate = await evaluateRiderForVehicle(client, {
        userId,
        riderId: item.riderId,
        vehicleId: item.vehicleId,
        rentalStart: istDate(pickupAt),
        rentalEnd: istDate(returnAt),
      });

      if (gate.outcome === "FAIL") {
        throw new LicenceInvalidError(
          `rider ${item.riderId} is not eligible for this vehicle or window: ${gate.reasons.join(", ")}`,
        );
      }
      if (gate.outcome === "REVIEW") {
        throw new LicenceReviewRequiredError(
          `rider ${item.riderId}'s licence needs review before booking: ${gate.reasons.join(", ")}`,
        );
      }
      // A pass that still wants a human -- a licence grandfathered in by the
      // legacy grace window. The booking goes ahead; the session is flagged.
      if (gate.flagForReview && gate.sessionId) {
        await flagSessionForReview(client, gate.sessionId, gate.reasons);
      }
    }

    // Priced before any coupon, because a coupon decides per CART: a FLAT ₹100
    // coupon on three scooters is ₹100, split across them, not ₹300.
    const priced = await priceCart(client, { items, pickupAt, returnAt });

    let couponId: string | null = null;
    let discounts = priced.map(() => 0);
    let shopFunded = false;
    if (couponCode) {
      const coupon = await loadLiveCoupon(client, couponCode);
      if (!coupon) throw new CouponInvalidError(`coupon ${couponCode} is not valid`);
      const result = await evaluateCoupon(client, coupon, { userId, pickupAt, returnAt, items: priced });
      if (!result.ok) throw new CouponInvalidError(result.reason);
      couponId = coupon.id;
      discounts = result.perItem;
      shopFunded = result.fundedBy === "SHOP";
    }

    const groupResult = await client.query(
      `insert into booking_groups (user_id, coupon_id, hold_expires_at)
       values ($1, $2, now() + interval '15 minutes')
       returning id, hold_expires_at`,
      [userId, couponId],
    );
    const groupId = groupResult.rows[0].id;
    const holdExpiresAt = groupResult.rows[0].hold_expires_at as Date;

    const bookings: Array<{ id: string; vehicleId: string }> = [];
    let groupRentalAmount = 0;
    let groupPlatformFee = 0;
    let groupTaxAmount = 0;
    let groupDiscountAmount = 0;
    let groupDepositAmount = 0;
    let groupTotalAmount = 0;

    for (const [index, item] of priced.entries()) {
      const discountAmount = discounts[index]!;
      const totals = composeTotal({
        rentalAmount: item.rentalAmount,
        securityDepositAmount: item.securityDepositAmount,
        platformFeePct,
        gstRate,
        discountAmount,
      });

      try {
        const insertResult = await client.query(
          `insert into bookings
             (group_id, rider_id, vehicle_id, source, scheduled_pickup_at, scheduled_return_at,
              status, rental_amount, security_deposit_amount, platform_fee, tax_amount,
              discount_amount, total_amount, merchant_discount_amount)
           values ($1, $2, $3, 'ONLINE', $4, $5, 'HOLD', $6, $7, $8, $9, $10, $11, $12)
           returning id`,
          [
            groupId,
            item.riderId,
            item.vehicleId,
            pickupAt,
            returnAt,
            totals.rentalAmount,
            totals.securityDepositAmount,
            totals.platformFee,
            totals.taxAmount,
            totals.discountAmount,
            totals.totalAmount,
            shopFunded ? totals.discountAmount : 0,
          ],
        );
        bookings.push({ id: insertResult.rows[0].id, vehicleId: item.vehicleId });
      } catch (err: any) {
        if (err.code === EXCLUSION_VIOLATION) {
          if (err.constraint === "no_overlapping_rider_bookings") {
            throw new RiderUnavailableError(`rider ${item.riderId} already has a booking for this window`);
          }
          throw new VehicleUnavailableError(`vehicle ${item.vehicleId} is already booked for this window`);
        }
        throw err;
      }

      groupRentalAmount += totals.rentalAmount;
      groupPlatformFee += totals.platformFee;
      groupTaxAmount += totals.taxAmount;
      groupDiscountAmount += totals.discountAmount;
      groupDepositAmount += totals.securityDepositAmount;
      groupTotalAmount += totals.totalAmount;
    }

    await client.query(`update booking_groups set total_amount = $1, updated_at = now() where id = $2`, [
      groupTotalAmount,
      groupId,
    ]);

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "booking.hold_created",
      entityType: "booking_group",
      entityId: groupId,
      after: { bookings: bookings.map((b) => b.id), totalAmount: groupTotalAmount },
    });

    await client.query("COMMIT");

    return {
      groupId,
      bookings,
      holdExpiresAt,
      totals: {
        rentalAmount: groupRentalAmount,
        platformFee: groupPlatformFee,
        taxAmount: groupTaxAmount,
        discountAmount: groupDiscountAmount,
        securityDepositAmount: groupDepositAmount,
        totalAmount: groupTotalAmount,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// `cashfree` is optional so a HOLD cancellation (no money taken yet) needs no
// provider at all. When a CONFIRMED booking is cancelled it is required -- without
// it the refund is computed, recorded and never actually paid, which is how this
// function shipped the first time.
export async function cancelBooking(
  pool: Pool,
  input: { userId: string; bookingId: string; now?: Date },
  cashfree?: CashfreeClient,
): Promise<{ refundAmount: number; penaltyAmount: number; refundId: string | null }> {
  const now = input.now ?? new Date();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `select b.id, b.group_id, b.status, b.actual_pickup_at, b.scheduled_pickup_at,
              b.rental_amount, b.discount_amount, b.platform_fee, b.tax_amount, b.security_deposit_amount
         from bookings b
         join booking_groups g on g.id = b.group_id
        where b.id = $1 and g.user_id = $2 and b.deleted_at is null`,
      [input.bookingId, input.userId],
    );
    if (rows.length === 0) throw new Error("booking not found");
    const booking = rows[0];

    // Cancelling is a soft delete, and soft delete is what releases the exclusion
    // constraint. Allowing it on a COMPLETED or picked-up rental would free a slot
    // for a vehicle that is physically out, and erase a finished rental's history.
    if (booking.status === "COMPLETED" || booking.actual_pickup_at) {
      throw new BookingNotCancellableError(`booking ${input.bookingId} has already been picked up`);
    }

    const { refundAmount, penaltyAmount } = refundForCancellation(
      new Date(booking.scheduled_pickup_at),
      now,
      {
        // What the customer actually paid for the rental. On the listed price, a
        // discounted booking would be refunded money it never paid.
        rentalAmount: Number(booking.rental_amount) - Number(booking.discount_amount),
        platformFee: Number(booking.platform_fee),
        taxAmount: Number(booking.tax_amount),
        securityDepositAmount: Number(booking.security_deposit_amount),
      },
    );

    await client.query(`update bookings set deleted_at = now() where id = $1`, [input.bookingId]);

    // A HOLD never had a SUCCEEDED payment, so there is nothing to refund and no
    // payout to top up -- both blocks below are skipped by that same lookup.
    const { rows: paymentRows } = await client.query(
      `select id from payments
        where booking_group_id = $1 and type = 'RENTAL' and status = 'SUCCEEDED'
        order by created_at desc limit 1`,
      [booking.group_id],
    );
    const paymentId = paymentRows[0]?.id ?? null;

    let refundId: string | null = null;
    if (paymentId && refundAmount > 0) {
      if (!cashfree) {
        throw new Error("cancelBooking needs a CashfreeClient to refund a confirmed booking");
      }
      // ponytail: the provider call sits inside the transaction, so a COMMIT
      // failure after a successful refund would leave money returned but
      // unrecorded. Same shape as merchantReturn. If that race ever bites, split
      // it: commit a PENDING refunds row first, then call the provider from a
      // retryable sweep keyed on provider_ref is null.
      const refund = await cashfree.refund({
        orderId: `order_${booking.group_id}`,
        refundId: `cancel_${input.bookingId}`,
        amount: refundAmount,
      });
      const { rows: refundRows } = await client.query(
        `insert into refunds (payment_id, booking_id, amount, reason, provider_ref, status)
         values ($1, $2, $3, 'CANCELLATION', $4, 'PENDING')
         returning id`,
        [paymentId, input.bookingId, refundAmount, refund.refundId],
      );
      refundId = refundRows[0].id;

      await notify(client, {
        recipientType: "CUSTOMER",
        recipientId: input.userId,
        channel: "WHATSAPP",
        template: "refund_processed",
        payload: { bookingId: input.bookingId, refundAmount },
      });
      await notify(client, {
        recipientType: "CUSTOMER",
        recipientId: input.userId,
        channel: "EMAIL",
        template: "refund_processed",
        payload: { bookingId: input.bookingId, refundAmount },
      });
    }

    await client.query(
      `insert into booking_cancellations (booking_id, cancelled_by, refund_amount, penalty_amount, refund_id)
       values ($1, 'CUSTOMER', $2, $3, $4)`,
      [input.bookingId, refundAmount, penaltyAmount, refundId],
    );

    // The penalty is what the merchant keeps. UPFRONT already paid them
    // PAYOUT_UPFRONT_PCT of the rental, so a tier that owes more (50% at 2-24h)
    // gets the difference as a CANCELLATION top-up. Never a clawback -- that is
    // the entire reason the upfront slice is set to the smallest tier.
    if (paymentId) {
      const { rows: upfrontRows } = await client.query(
        `select merchant_user_id, amount from payouts where booking_id = $1 and stage = 'UPFRONT'`,
        [input.bookingId],
      );
      const upfront = upfrontRows[0];
      if (upfront) {
        const topUp = penaltyAmount - Number(upfront.amount);
        if (topUp > 0) {
          await client.query(
            `insert into payouts (merchant_user_id, booking_id, stage, amount, status)
             values ($1, $2, 'CANCELLATION', $3, 'CREDITED')
             on conflict (booking_id, stage) do nothing`,
            [upfront.merchant_user_id, input.bookingId, topUp],
          );
        }
      }
    }

    const { rows: remaining } = await client.query(
      `select coalesce(sum(total_amount), 0) as total from bookings
        where group_id = $1 and deleted_at is null`,
      [booking.group_id],
    );
    await client.query(`update booking_groups set total_amount = $1, updated_at = now() where id = $2`, [
      remaining[0].total,
      booking.group_id,
    ]);

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: input.userId,
      action: "booking.cancelled",
      entityType: "booking",
      entityId: input.bookingId,
      after: { refundAmount, penaltyAmount, refundId },
    });

    await client.query("COMMIT");
    return { refundAmount, penaltyAmount, refundId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Pay-first: the booking's scheduled_return_at is NOT touched here. It only
// moves once handlePaymentWebhook sees PAYMENT_SUCCESS for this extension's
// payment (Phase 15 / paymentsService.ts). Decided 2026-10-03 -- the old
// behaviour (extend immediately, charge nothing) is gone.
export async function requestExtension(
  pool: Pool,
  input: { userId: string; bookingId: string; newReturnAt: Date },
  cashfree: CashfreeClient,
): Promise<{ extensionId: string; orderId: string; paymentSessionId: string; additionalAmount: number; mode: "sandbox" | "production" }> {
  const { platformFeePct, gstRate } = getMoneyConfig();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `select b.id, b.vehicle_id, b.group_id, b.scheduled_return_at,
              u.phone, u.name
         from bookings b
         join booking_groups g on g.id = b.group_id
         join users u on u.id = g.user_id
        where b.id = $1 and g.user_id = $2 and b.status = 'CONFIRMED' and b.deleted_at is null
          and b.actual_pickup_at is not null and b.actual_return_at is null`,
      [input.bookingId, input.userId],
    );
    if (rows.length === 0) throw new BookingNotExtendableError("You can only extend a rental after pickup and before return.");
    const booking = rows[0];

    const oldReturnAt = new Date(booking.scheduled_return_at);

    if (input.newReturnAt.getTime() <= Math.max(oldReturnAt.getTime(), Date.now())) {
      throw new InvalidDurationError("Choose a future return time after your scheduled return.");
    }
    if (!(await extensionWindowAvailable(client, input.bookingId, oldReturnAt, input.newReturnAt))) {
      throw new VehicleUnavailableError("This extension window is unavailable. Try an earlier return time.");
    }

    // Price only the extra days, at current rates. Zero deposit -- the
    // existing deposit already covers the whole rental.
    const { pricing, specials } = await loadPricingAndSpecials(client, booking.vehicle_id);
    const { rentalAmount: extraRental } = priceRental({
      pickupAt: oldReturnAt,
      returnAt: input.newReturnAt,
      pricing,
      specialPricings: specials,
    });
    const extraTotals = composeTotal({
      rentalAmount: extraRental,
      securityDepositAmount: 0,
      platformFeePct,
      gstRate,
      discountAmount: 0,
    });

    let extensionId: string;
    try {
      const { rows: extRows } = await client.query(
        `insert into booking_extensions (booking_id, old_return_at, new_return_at, additional_amount, status)
         values ($1, $2, $3, $4, 'PENDING') returning id`,
        [input.bookingId, oldReturnAt, input.newReturnAt, extraRental],
      );
      extensionId = extRows[0].id;
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) {
        throw new ExtensionPendingError(`booking ${input.bookingId} already has a pending extension`);
      }
      throw err;
    }

    const orderId = `ext_${extensionId}`;
    const appUrl = appBaseUrl();
    const order = await cashfree.createOrder({
      orderId,
      amount: extraTotals.totalAmount,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      customerId: `cust_${input.userId.replace(/-/g, "")}`,
      customerPhone: booking.phone,
      customerName: booking.name ?? undefined,
      returnUrl: appUrl ? `${appUrl}/account/bookings` : undefined,
    });

    const { rows: paymentRows } = await client.query(
      `insert into payments (booking_group_id, provider_order_id, type, amount, status)
       values ($1, $2, 'EXTENSION', $3, 'PENDING') returning id`,
      [booking.group_id, order.orderId, extraTotals.totalAmount],
    );
    await client.query(`update booking_extensions set payment_id = $1 where id = $2`, [
      paymentRows[0].id,
      extensionId,
    ]);

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: input.userId,
      action: "booking.extension_requested",
      entityType: "booking",
      entityId: input.bookingId,
      after: { newReturnAt: input.newReturnAt, additionalAmount: extraTotals.totalAmount },
    });

    await client.query("COMMIT");
    return {
      extensionId,
      orderId: order.orderId,
      paymentSessionId: order.paymentSessionId,
      additionalAmount: extraTotals.totalAmount,
      mode: cashfreeMode(),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** The customer's own bookings, newest first — backs "My bookings" and review eligibility. */
export async function listMyBookings(pool: Pool, userId: string) {
  const { rows } = await pool.query(
    `select b.*, m.make, m.model, s.id as shop_id, s.name as shop_name,
            s.address_line1 as shop_address, s.city as shop_city, s.phone as shop_phone,
            r.name as rider_name,
            exists(select 1 from reviews review where review.booking_id = b.id and review.deleted_at is null) as has_review,
            -- So the list can offer "Complete payment" on a HOLD whose clock is
            -- still running. Without it a customer who closed the tab at the
            -- Cashfree screen has no route back to a hold that is still live.
            g.hold_expires_at,
            -- Shown on the order page until the scooter is collected; staff
            -- ask for it at handover (lib/handoverCode.ts).
            case when b.status = 'CONFIRMED' and b.actual_pickup_at is null and b.deleted_at is null
                 then g.handover_code end as handover_code,
            (select p.status from payments p
              where p.booking_group_id = g.id and p.type = 'RENTAL'
              order by p.created_at desc limit 1) as payment_status,
            sd.status as deposit_status, sd.deducted_amount as deposit_deducted_amount,
            sd.deduction_reason as deposit_deduction_reason, sd.refund_amount as deposit_refund_amount,
            -- Real state, not a guess: the row is written PENDING and flips to
            -- SUCCEEDED on Cashfree's REFUND_SUCCESS webhook. It is the only honest
            -- answer to "where is my deposit", which is asked at the shop counter
            -- with the customer's phone already out.
            (select r.status from refunds r
              where r.booking_id = b.id and r.reason in ('DEPOSIT_RELEASE', 'DEPOSIT_SETTLEMENT')
              order by r.created_at desc limit 1) as deposit_refund_status,
            c.refund_amount as cancellation_refund_amount, c.penalty_amount as cancellation_penalty_amount,
            c.cancelled_by, c.reason as cancellation_reason
       from bookings b
       join booking_groups g on g.id = b.group_id
       join vehicles v on v.id = b.vehicle_id
       join vehicle_models m on m.id = v.model_id
       join shops s on s.id = v.shop_id
       left join riders r on r.id = b.rider_id
       left join security_deposits sd on sd.booking_id = b.id
       left join booking_cancellations c on c.booking_id = b.id
      where g.user_id = $1
      order by b.scheduled_pickup_at desc`,
    [userId],
  );
  return rows;
}

export async function getExtension(pool: Pool, userId: string, bookingId: string) {
  const { rows } = await pool.query(
    `select e.*, coalesce(p.amount, e.additional_amount) as payable_amount
       from booking_extensions e
       join bookings b on b.id = e.booking_id
       join booking_groups g on g.id = b.group_id
       left join payments p on p.id = e.payment_id
      where e.booking_id = $1 and g.user_id = $2
      order by e.requested_at desc limit 1`,
    [bookingId, userId],
  );
  return rows[0] ?? null;
}

export async function getExtensionPayment(pool: Pool, userId: string, bookingId: string, extensionId: string, cashfree: CashfreeClient) {
  const { rows: [payment] } = await pool.query(
    `select p.id, p.booking_group_id, p.amount, p.provider_order_id, e.id as extension_id,
            e.old_return_at, e.new_return_at
       from booking_extensions e
       join bookings b on b.id = e.booking_id
       join booking_groups g on g.id = b.group_id
       join payments p on p.id = e.payment_id
      where e.booking_id = $1 and g.user_id = $2 and e.id::text = $3 and e.status = 'PENDING'`,
    [bookingId, userId, extensionId],
  );
  if (!payment) return { state: "settled" } as const;
  const order = await cashfree.getOrder(payment.provider_order_id);
  if (order?.orderStatus === "PAID") {
    await handleExtensionPaymentSuccess(pool, payment, null, cashfree);
    return { state: "settled" } as const;
  }
  if (order?.orderStatus === "ACTIVE" && order.paymentSessionId) {
    if (!(await extensionWindowAvailable(pool, bookingId, payment.old_return_at, payment.new_return_at))) {
      throw new VehicleUnavailableError("This extension window is no longer available. Keep your scheduled return time.");
    }
    return { state: "pay", paymentSessionId: order.paymentSessionId, mode: cashfreeMode() } as const;
  }
  if (order?.orderStatus === "EXPIRED" || order?.orderStatus === "TERMINATED") {
    await pool.query(
      `with expired as (
         update booking_extensions set status = 'REJECTED' where id = $1 and status = 'PENDING' returning payment_id
       )
       update payments set status = 'CANCELLED', updated_at = now() where id in (select payment_id from expired)`,
      [payment.extension_id],
    );
    return { state: "settled" } as const;
  }
  throw new BookingNotExtendableError("This extension payment isn’t available right now. Keep your scheduled return time.");
}
