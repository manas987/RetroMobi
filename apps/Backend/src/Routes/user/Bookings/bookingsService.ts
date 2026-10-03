import type { Pool, PoolClient } from "pg";
import { composeTotal, countRentalDays, priceRental, refundForCancellation } from "../../../lib/pricing.ts";
import { writeAudit } from "../../../lib/audit.ts";
import type { CashfreeClient } from "../../../providers/cashfree.ts";

export class VehicleUnavailableError extends Error {}
export class TooManyVehiclesError extends Error {}
export class InvalidDurationError extends Error {}
export class LicenceInvalidError extends Error {}
export class CouponInvalidError extends Error {}
export class BookingNotCancellableError extends Error {}

const EXCLUSION_VIOLATION = "23P01";

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
    `select amount, weekend_amount, effective_from, effective_until
       from special_pricings where vehicle_pricing_id = $1 and deleted_at is null`,
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
      effectiveFrom: s.effective_from.toISOString().slice(0, 10),
      effectiveUntil: s.effective_until.toISOString().slice(0, 10),
    })),
  };
}

async function loadCoupon(client: PoolClient, code: string) {
  const { rows } = await client.query(
    `select id, type, value, max_uses, used_count
       from coupons
      where code = $1 and status = 'ACTIVE' and deleted_at is null
        and valid_from <= now() and valid_until >= now()`,
    [code],
  );
  if (rows.length === 0) throw new CouponInvalidError(`coupon ${code} is not valid`);
  const coupon = rows[0];
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
    throw new CouponInvalidError(`coupon ${code} has reached its usage limit`);
  }
  return { id: coupon.id, type: coupon.type as "PERCENT" | "FLAT", value: Number(coupon.value) };
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
  if (countRentalDays(pickupAt, returnAt) > 10) throw new InvalidDurationError("rental cannot exceed 10 days");

  const { platformFeePct, gstRate } = getMoneyConfig();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Every rider in the checkout must belong to this account and be licensed
    // for the whole rental, not just at pickup.
    for (const item of items) {
      const { rows } = await client.query(
        `select dlv.status, dlv.expires_on
           from riders r
           left join driving_licence_verifications dlv on dlv.rider_id = r.id and dlv.status = 'VERIFIED'
          where r.id = $1 and r.user_id = $2 and r.deleted_at is null
          order by dlv.verified_at desc
          limit 1`,
        [item.riderId, userId],
      );
      const verification = rows[0];
      const returnDateIst = new Date(returnAt.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (
        !verification ||
        verification.status !== "VERIFIED" ||
        !verification.expires_on ||
        verification.expires_on.toISOString().slice(0, 10) < returnDateIst
      ) {
        throw new LicenceInvalidError(`rider ${item.riderId} has no valid licence for this window`);
      }
    }

    let coupon: { id: string; type: "PERCENT" | "FLAT"; value: number } | null = null;
    if (couponCode) coupon = await loadCoupon(client, couponCode);

    const groupResult = await client.query(
      `insert into booking_groups (user_id, coupon_id, hold_expires_at)
       values ($1, $2, now() + interval '10 minutes')
       returning id, hold_expires_at`,
      [userId, coupon?.id ?? null],
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

    for (const item of items) {
      const vehicleCheck = await client.query(
        `select id from vehicles where id = $1 and status = 'ACTIVE' and deleted_at is null`,
        [item.vehicleId],
      );
      if (vehicleCheck.rows.length === 0) {
        throw new VehicleUnavailableError(`vehicle ${item.vehicleId} is not available`);
      }

      const { pricing, specials } = await loadPricingAndSpecials(client, item.vehicleId);
      const { rentalAmount } = priceRental({ pickupAt, returnAt, pricing, specialPricings: specials });

      const discountAmount = !coupon
        ? 0
        : coupon.type === "PERCENT"
          ? Math.round((rentalAmount * coupon.value) / 100)
          : coupon.value;

      const totals = composeTotal({
        rentalAmount,
        securityDepositAmount: pricing.securityDepositAmount,
        platformFeePct,
        gstRate,
        discountAmount,
      });

      try {
        const insertResult = await client.query(
          `insert into bookings
             (group_id, rider_id, vehicle_id, source, scheduled_pickup_at, scheduled_return_at,
              status, rental_amount, security_deposit_amount, platform_fee, tax_amount,
              discount_amount, total_amount)
           values ($1, $2, $3, 'ONLINE', $4, $5, 'HOLD', $6, $7, $8, $9, $10, $11)
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
          ],
        );
        bookings.push({ id: insertResult.rows[0].id, vehicleId: item.vehicleId });
      } catch (err: any) {
        if (err.code === EXCLUSION_VIOLATION) {
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
              b.rental_amount, b.platform_fee, b.tax_amount, b.security_deposit_amount
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
        rentalAmount: Number(booking.rental_amount),
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
             values ($1, $2, 'CANCELLATION', $3, 'PENDING')
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

export async function extendBooking(
  pool: Pool,
  input: { userId: string; bookingId: string; newReturnAt: Date },
): Promise<{ additionalAmount: number }> {
  const { platformFeePct, gstRate } = getMoneyConfig();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `select b.id, b.vehicle_id, b.scheduled_pickup_at, b.scheduled_return_at,
              b.rental_amount, b.platform_fee, b.tax_amount, b.total_amount
         from bookings b
         join booking_groups g on g.id = b.group_id
        where b.id = $1 and g.user_id = $2 and b.deleted_at is null`,
      [input.bookingId, input.userId],
    );
    if (rows.length === 0) throw new Error("booking not found");
    const booking = rows[0];

    const oldReturnAt = new Date(booking.scheduled_return_at);
    const pickupAt = new Date(booking.scheduled_pickup_at);

    if (input.newReturnAt.getTime() <= oldReturnAt.getTime()) {
      throw new InvalidDurationError("shortening is not an extension");
    }
    if (countRentalDays(pickupAt, input.newReturnAt) > 10) {
      throw new InvalidDurationError("rental cannot exceed 10 days");
    }

    const { pricing, specials } = await loadPricingAndSpecials(client, booking.vehicle_id);
    const { rentalAmount: extraRental } = priceRental({
      pickupAt: oldReturnAt,
      returnAt: input.newReturnAt,
      pricing,
      specialPricings: specials,
    });

    const extraFee = Math.round((extraRental * platformFeePct) / 100);
    const extraTax = Math.round(((extraRental + extraFee) * gstRate) / 100);
    const extraTotal = extraRental + extraFee + extraTax;

    try {
      await client.query(
        `update bookings
            set scheduled_return_at = $1,
                rental_amount = rental_amount + $2,
                platform_fee = platform_fee + $3,
                tax_amount = tax_amount + $4,
                total_amount = total_amount + $5,
                updated_at = now()
          where id = $6`,
        [input.newReturnAt, extraRental, extraFee, extraTax, extraTotal, input.bookingId],
      );
    } catch (err: any) {
      if (err.code === EXCLUSION_VIOLATION) {
        throw new VehicleUnavailableError(`vehicle ${booking.vehicle_id} is already booked past this return time`);
      }
      throw err;
    }

    // Explicitly APPROVED, because 0013 changed the column default to PENDING ahead
    // of the pay-first rebuild (implementation.md Phase 15). Until that phase lands,
    // this path still extends the booking WITHOUT taking payment -- the additional
    // amount is owed and never charged. Do not call this a finished feature.
    await client.query(
      `insert into booking_extensions
         (booking_id, old_return_at, new_return_at, additional_amount, status, approved_at)
       values ($1, $2, $3, $4, 'APPROVED', now())`,
      [input.bookingId, oldReturnAt, input.newReturnAt, extraRental],
    );

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: input.userId,
      action: "booking.extended",
      entityType: "booking",
      entityId: input.bookingId,
      before: { scheduledReturnAt: oldReturnAt },
      after: { scheduledReturnAt: input.newReturnAt, additionalAmount: extraRental },
    });

    await client.query("COMMIT");
    return { additionalAmount: extraRental };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
