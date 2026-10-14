import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  createBookableVehicle,
  createRider,
  createUser,
  futureWindow,
  insertBooking,
} from "../../../test/fixtures.ts";
import { sweepExpiredHolds } from "../../../lib/holds.ts";
import {
  CouponInvalidError,
  ExtensionPendingError,
  InvalidDurationError,
  LicenceInvalidError,
  TooManyVehiclesError,
  VehicleUnavailableError,
  cancelBooking,
  createHold,
  getExtension,
  requestExtension,
} from "./bookingsService.ts";
import { handlePaymentWebhook } from "../Payments/paymentsService.ts";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

async function customerWithRider(opts: { dlExpiresOn?: string; verified?: boolean } = {}) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id, opts);
  return { userId: user.id, riderId: rider.id };
}

describe("createHold", () => {
  test("creates a group with one booking per vehicle, all HOLD", async () => {
    const { userId, riderId } = await customerWithRider();
    const a = await createBookableVehicle(pool);
    const b = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(40);

    const result = await createHold(pool, {
      userId,
      items: [
        { vehicleId: a.id, riderId },
        { vehicleId: b.id, riderId },
      ],
      pickupAt,
      returnAt,
    });

    expect(result.bookings).toHaveLength(2);
    const { rows } = await pool.query(
      `select status, group_id from bookings where group_id = $1`,
      [result.groupId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "HOLD")).toBe(true);
  });

  test("sets hold_expires_at 10 minutes out, on the group", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(41);

    const result = await createHold(pool, {
      userId,
      items: [{ vehicleId: v.id, riderId }],
      pickupAt,
      returnAt,
    });

    const { rows } = await pool.query(
      `select hold_expires_at from booking_groups where id = $1`,
      [result.groupId],
    );
    const minutesOut = (new Date(rows[0].hold_expires_at).getTime() - Date.now()) / 60_000;
    expect(minutesOut).toBeGreaterThan(8);
    expect(minutesOut).toBeLessThan(12);
  });

  // THE critical behaviour. Application-level checks cannot do this.
  test("a vehicle already booked for an overlapping window is rejected", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(50);

    await insertBooking(pool, {
      vehicleId: v.id,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      status: "CONFIRMED",
    });

    await expect(
      createHold(pool, {
        userId,
        items: [{ vehicleId: v.id, riderId }],
        pickupAt,
        returnAt,
      }),
    ).rejects.toBeInstanceOf(VehicleUnavailableError);
  });

  test("a WALK-IN booking blocks the marketplace just the same", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(51);

    await insertBooking(pool, {
      vehicleId: v.id,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      source: "OFFLINE",
    });

    await expect(
      createHold(pool, { userId, items: [{ vehicleId: v.id, riderId }], pickupAt, returnAt }),
    ).rejects.toBeInstanceOf(VehicleUnavailableError);
  });

  test("a non-overlapping window on the same vehicle is fine", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const first = futureWindow(60, 2);
    const second = futureWindow(70, 2);

    await insertBooking(pool, {
      vehicleId: v.id,
      pickupAt: first.pickupAt.toISOString(),
      returnAt: first.returnAt.toISOString(),
    });

    const result = await createHold(pool, {
      userId,
      items: [{ vehicleId: v.id, riderId }],
      pickupAt: second.pickupAt,
      returnAt: second.returnAt,
    });
    expect(result.bookings).toHaveLength(1);
  });

  // A partial group is worse than a clean failure the customer can retry.
  test("if ONE vehicle in the group is taken, NOTHING is created", async () => {
    const { userId, riderId } = await customerWithRider();
    const free = await createBookableVehicle(pool);
    const taken = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(80);

    await insertBooking(pool, {
      vehicleId: taken.id,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
    });

    await expect(
      createHold(pool, {
        userId,
        items: [
          { vehicleId: free.id, riderId },
          { vehicleId: taken.id, riderId },
        ],
        pickupAt,
        returnAt,
      }),
    ).rejects.toBeInstanceOf(VehicleUnavailableError);

    const { rows } = await pool.query(
      `select id from bookings where vehicle_id = $1 and deleted_at is null`,
      [free.id],
    );
    expect(rows).toHaveLength(0);
  });

  test("more than 5 vehicles is rejected", async () => {
    const { userId, riderId } = await customerWithRider();
    const vehicles = await Promise.all(
      Array.from({ length: 6 }, () => createBookableVehicle(pool)),
    );
    const { pickupAt, returnAt } = futureWindow(90);

    await expect(
      createHold(pool, {
        userId,
        items: vehicles.map((v) => ({ vehicleId: v.id, riderId })),
        pickupAt,
        returnAt,
      }),
    ).rejects.toBeInstanceOf(TooManyVehiclesError);
  });

  test("longer than 10 days is rejected", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const { pickupAt } = futureWindow(100);
    const returnAt = new Date(pickupAt.getTime() + 11 * 86_400_000);

    await expect(
      createHold(pool, { userId, items: [{ vehicleId: v.id, riderId }], pickupAt, returnAt }),
    ).rejects.toBeInstanceOf(InvalidDurationError);
  });

  test("a same-day round trip is allowed", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const { pickupAt } = futureWindow(110);
    const returnAt = new Date(pickupAt.getTime() + 10 * 3_600_000);

    const result = await createHold(pool, {
      userId,
      items: [{ vehicleId: v.id, riderId }],
      pickupAt,
      returnAt,
    });
    expect(result.bookings).toHaveLength(1);
  });

  test("a rider with no verified licence is rejected", async () => {
    const { userId, riderId } = await customerWithRider({ verified: false });
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(120);

    await expect(
      createHold(pool, { userId, items: [{ vehicleId: v.id, riderId }], pickupAt, returnAt }),
    ).rejects.toBeInstanceOf(LicenceInvalidError);
  });

  // Licensed for the WHOLE rental, not just at pickup.
  test("a licence expiring mid-rental is rejected", async () => {
    const { pickupAt, returnAt } = futureWindow(130, 5);
    const expiresMidway = new Date(pickupAt.getTime() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const { userId, riderId } = await customerWithRider({ dlExpiresOn: expiresMidway });
    const v = await createBookableVehicle(pool);

    await expect(
      createHold(pool, { userId, items: [{ vehicleId: v.id, riderId }], pickupAt, returnAt }),
    ).rejects.toBeInstanceOf(LicenceInvalidError);
  });

  test("an INACTIVE vehicle cannot be booked - it is not listed", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool, { status: "INACTIVE" });
    const { pickupAt, returnAt } = futureWindow(140);

    await expect(
      createHold(pool, { userId, items: [{ vehicleId: v.id, riderId }], pickupAt, returnAt }),
    ).rejects.toBeInstanceOf(VehicleUnavailableError);
  });

  test("priced totals are written onto each booking", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool, { amount: 45_000, depositAmount: 200_000 });
    const { pickupAt, returnAt } = futureWindow(150, 2);

    const result = await createHold(pool, {
      userId,
      items: [{ vehicleId: v.id, riderId }],
      pickupAt,
      returnAt,
    });

    const { rows } = await pool.query(
      `select rental_amount, security_deposit_amount, platform_fee, tax_amount, total_amount
         from bookings where group_id = $1`,
      [result.groupId],
    );
    expect(Number(rows[0].rental_amount)).toBeGreaterThan(0);
    expect(Number(rows[0].security_deposit_amount)).toBe(200_000);
    expect(Number(rows[0].total_amount)).toBeGreaterThan(Number(rows[0].rental_amount));
  });
});

describe("sweepExpiredHolds", () => {
  test("deletes expired holds outright and frees the slot", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(160);

    const held = await createHold(pool, {
      userId,
      items: [{ vehicleId: v.id, riderId }],
      pickupAt,
      returnAt,
    });

    await pool.query(
      `update booking_groups set hold_expires_at = now() - interval '1 minute' where id = $1`,
      [held.groupId],
    );

    await sweepExpiredHolds(pool);

    const { rows } = await pool.query(`select id from bookings where group_id = $1`, [
      held.groupId,
    ]);
    expect(rows).toHaveLength(0);

    // Slot is genuinely free again, not just soft-deleted.
    const second = await customerWithRider();
    const result = await createHold(pool, {
      userId: second.userId,
      items: [{ vehicleId: v.id, riderId: second.riderId }],
      pickupAt,
      returnAt,
    });
    expect(result.bookings).toHaveLength(1);
  });

  test("leaves CONFIRMED bookings alone even if hold_expires_at has passed", async () => {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(170);

    const held = await createHold(pool, {
      userId,
      items: [{ vehicleId: v.id, riderId }],
      pickupAt,
      returnAt,
    });
    await pool.query(`update bookings set status = 'CONFIRMED' where group_id = $1`, [
      held.groupId,
    ]);
    await pool.query(
      `update booking_groups set hold_expires_at = now() - interval '1 minute' where id = $1`,
      [held.groupId],
    );

    await sweepExpiredHolds(pool);

    const { rows } = await pool.query(`select id from bookings where group_id = $1`, [
      held.groupId,
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe("cancelBooking", () => {
  async function confirmedBooking(dayOffset: number) {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(dayOffset);
    const held = await createHold(pool, {
      userId,
      items: [{ vehicleId: v.id, riderId }],
      pickupAt,
      returnAt,
    });
    await pool.query(`update bookings set status = 'CONFIRMED' where group_id = $1`, [
      held.groupId,
    ]);
    return { userId, bookingId: held.bookings[0]!.id, groupId: held.groupId, vehicleId: v.id, pickupAt };
  }

  test("soft-deletes the booking and records the cancellation", async () => {
    const b = await confirmedBooking(200);
    await cancelBooking(pool, { userId: b.userId, bookingId: b.bookingId });

    const { rows } = await pool.query(`select deleted_at from bookings where id = $1`, [
      b.bookingId,
    ]);
    expect(rows[0].deleted_at).not.toBeNull();

    const c = await pool.query(`select id from booking_cancellations where booking_id = $1`, [
      b.bookingId,
    ]);
    expect(c.rows).toHaveLength(1);
  });

  // Soft delete is what makes the exclusion constraint release the slot.
  test("cancelling frees the vehicle for someone else", async () => {
    const b = await confirmedBooking(210);
    const { pickupAt, returnAt } = futureWindow(210);
    await cancelBooking(pool, { userId: b.userId, bookingId: b.bookingId });

    const next = await customerWithRider();
    const result = await createHold(pool, {
      userId: next.userId,
      items: [{ vehicleId: b.vehicleId, riderId: next.riderId }],
      pickupAt,
      returnAt,
    });
    expect(result.bookings).toHaveLength(1);
  });

  test("cancels ONE vehicle, leaving the rest of the group standing", async () => {
    const { userId, riderId } = await customerWithRider();
    const a = await createBookableVehicle(pool);
    const b = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(220);

    const held = await createHold(pool, {
      userId,
      items: [
        { vehicleId: a.id, riderId },
        { vehicleId: b.id, riderId },
      ],
      pickupAt,
      returnAt,
    });
    await pool.query(`update bookings set status = 'CONFIRMED' where group_id = $1`, [
      held.groupId,
    ]);

    await cancelBooking(pool, { userId, bookingId: held.bookings[0]!.id });

    const { rows } = await pool.query(
      `select id from bookings where group_id = $1 and deleted_at is null`,
      [held.groupId],
    );
    expect(rows).toHaveLength(1);
  });

  test("the security deposit comes back in full regardless of tier", async () => {
    const b = await confirmedBooking(230);
    const result = await cancelBooking(pool, {
      userId: b.userId,
      bookingId: b.bookingId,
      now: new Date(b.pickupAt.getTime() - 30 * 60_000), // 30 min before: 0% tier
    });
    expect(result.refundAmount).toBeGreaterThanOrEqual(200_000);
  });
});

describe("coupons", () => {
  async function makeCoupon(opts: {
    type?: "PERCENT" | "FLAT";
    value?: number;
    status?: "ACTIVE" | "PAUSED";
    validFrom?: string;
    validUntil?: string;
    maxUses?: number | null;
    usedCount?: number;
  } = {}) {
    const code = `TEST${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1000)}`;
    await pool.query(
      `insert into coupons (code, type, value, valid_from, valid_until, max_uses, used_count, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        code,
        opts.type ?? "PERCENT",
        opts.value ?? 10,
        opts.validFrom ?? new Date(Date.now() - 86_400_000).toISOString(),
        opts.validUntil ?? new Date(Date.now() + 365 * 86_400_000).toISOString(),
        opts.maxUses ?? null,
        opts.usedCount ?? 0,
        opts.status ?? "ACTIVE",
      ],
    );
    return code;
  }

  async function holdWithCoupon(dayOffset: number, couponCode?: string) {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(dayOffset);
    return createHold(pool, {
      userId,
      items: [{ vehicleId: v.id, riderId }],
      pickupAt,
      returnAt,
      couponCode,
    });
  }

  test("a valid coupon reduces the total", async () => {
    const code = await makeCoupon({ type: "PERCENT", value: 10 });
    const withCoupon = await holdWithCoupon(1100, code);
    const without = await holdWithCoupon(1101);

    expect(withCoupon.totals.discountAmount).toBeGreaterThan(0);
    expect(without.totals.discountAmount).toBe(0);
  });

  test("a PAUSED coupon is rejected", async () => {
    const code = await makeCoupon({ status: "PAUSED" });
    await expect(holdWithCoupon(1110, code)).rejects.toBeInstanceOf(CouponInvalidError);
  });

  test("an expired coupon is rejected", async () => {
    const code = await makeCoupon({
      validFrom: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      validUntil: new Date(Date.now() - 86_400_000).toISOString(),
    });
    await expect(holdWithCoupon(1120, code)).rejects.toBeInstanceOf(CouponInvalidError);
  });

  test("a coupon at its usage cap is rejected", async () => {
    const code = await makeCoupon({ maxUses: 1, usedCount: 1 });
    await expect(holdWithCoupon(1130, code)).rejects.toBeInstanceOf(CouponInvalidError);
  });

  test("an unknown code is rejected", async () => {
    await expect(holdWithCoupon(1140, "NOPE-DOES-NOT-EXIST")).rejects.toBeInstanceOf(
      CouponInvalidError,
    );
  });

  // used_count increments at CONFIRMATION, not at hold -- an abandoned checkout
  // must not burn a limited coupon.
  test("holding does not increment used_count", async () => {
    const code = await makeCoupon({ maxUses: 5 });
    await holdWithCoupon(1150, code);

    const { rows } = await pool.query(`select used_count from coupons where code = $1`, [code]);
    expect(Number(rows[0].used_count)).toBe(0);
  });
});

describe("requestExtension (pay-first)", () => {
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

  async function confirmed(dayOffset: number) {
    const { userId, riderId } = await customerWithRider();
    const v = await createBookableVehicle(pool, { amount: 50_000, weekendAmount: 50_000 });
    const { pickupAt, returnAt } = futureWindow(dayOffset, 2);
    const held = await createHold(pool, {
      userId,
      items: [{ vehicleId: v.id, riderId }],
      pickupAt,
      returnAt,
    });
    await pool.query(`update bookings set status = 'CONFIRMED' where group_id = $1`, [held.groupId]);
    return { userId, bookingId: held.bookings[0]!.id, vehicleId: v.id, pickupAt, returnAt };
  }

  test("requesting does not touch scheduled_return_at -- it only moves after the webhook fires", async () => {
    const b = await confirmed(1200);
    const newReturnAt = new Date(b.returnAt.getTime() + 2 * 86_400_000);

    const { orderId } = await requestExtension(
      pool,
      { userId: b.userId, bookingId: b.bookingId, newReturnAt },
      fakeCashfree,
    );

    const { rows: before } = await pool.query(
      `select scheduled_return_at from bookings where id = $1`,
      [b.bookingId],
    );
    expect(new Date(before[0].scheduled_return_at).getTime()).toBe(b.returnAt.getTime());

    const { rows: pending } = await pool.query(
      `select status from booking_extensions where booking_id = $1`,
      [b.bookingId],
    );
    expect(pending[0].status).toBe("PENDING");

    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_ext_${b.bookingId}`, type: "PAYMENT_SUCCESS", orderId, payload: {} },
      fakeCashfree,
    );

    const { rows: after } = await pool.query(
      `select scheduled_return_at from bookings where id = $1`,
      [b.bookingId],
    );
    expect(new Date(after[0].scheduled_return_at).getTime()).toBe(newReturnAt.getTime());

    const { rows: approved } = await pool.query(
      `select status from booking_extensions where booking_id = $1`,
      [b.bookingId],
    );
    expect(approved[0].status).toBe("APPROVED");
  });

  // The exclusion constraint is the only thing that can arbitrate, and it only
  // gets the chance to at the webhook's UPDATE -- after the money has moved.
  test("losing the window to another booking during payment refunds in full and leaves the booking untouched", async () => {
    const b = await confirmed(1210);
    const newReturnAt = new Date(b.returnAt.getTime() + 2 * 86_400_000);

    const { orderId } = await requestExtension(
      pool,
      { userId: b.userId, bookingId: b.bookingId, newReturnAt },
      fakeCashfree,
    );

    // Someone else books the extended window while payment is in flight.
    await insertBooking(pool, {
      vehicleId: b.vehicleId,
      pickupAt: new Date(b.returnAt.getTime() + 3_600_000).toISOString(),
      returnAt: new Date(b.returnAt.getTime() + 3 * 86_400_000).toISOString(),
      status: "CONFIRMED",
    });

    await handlePaymentWebhook(
      pool,
      { providerEventId: `evt_ext_${b.bookingId}`, type: "PAYMENT_SUCCESS", orderId, payload: {} },
      fakeCashfree,
    );

    const { rows: booking } = await pool.query(
      `select scheduled_return_at from bookings where id = $1`,
      [b.bookingId],
    );
    expect(new Date(booking[0].scheduled_return_at).getTime()).toBe(b.returnAt.getTime());

    const { rows: ext } = await pool.query(
      `select status from booking_extensions where booking_id = $1`,
      [b.bookingId],
    );
    expect(ext[0].status).toBe("REJECTED");

    const { rows: refunds } = await pool.query(
      `select reason from refunds where booking_id = $1`,
      [b.bookingId],
    );
    expect(refunds.map((r) => r.reason)).toContain("EXTENSION_UNAVAILABLE");
  });

  test("only the extra days are priced into the request", async () => {
    const b = await confirmed(1220);
    const newReturnAt = new Date(b.returnAt.getTime() + 2 * 86_400_000);

    const result = await requestExtension(
      pool,
      { userId: b.userId, bookingId: b.bookingId, newReturnAt },
      fakeCashfree,
    );

    // Two extra days on a vehicle priced at 50000/day, plus fee and tax.
    expect(result.additionalAmount).toBeGreaterThan(0);
    expect(result.additionalAmount).toBeLessThan(2 * 50_000 * 2);
  });

  test("shortening a booking is rejected", async () => {
    const b = await confirmed(1230);
    await expect(
      requestExtension(
        pool,
        { userId: b.userId, bookingId: b.bookingId, newReturnAt: new Date(b.returnAt.getTime() - 86_400_000) },
        fakeCashfree,
      ),
    ).rejects.toBeInstanceOf(InvalidDurationError);
  });

  test("a second request while one is pending is rejected", async () => {
    const b = await confirmed(1240);
    await requestExtension(
      pool,
      { userId: b.userId, bookingId: b.bookingId, newReturnAt: new Date(b.returnAt.getTime() + 86_400_000) },
      fakeCashfree,
    );
    await expect(
      requestExtension(
        pool,
        { userId: b.userId, bookingId: b.bookingId, newReturnAt: new Date(b.returnAt.getTime() + 2 * 86_400_000) },
        fakeCashfree,
      ),
    ).rejects.toBeInstanceOf(ExtensionPendingError);
  });

  test("getExtension returns the latest extension for the booking", async () => {
    const b = await confirmed(1250);
    await requestExtension(
      pool,
      { userId: b.userId, bookingId: b.bookingId, newReturnAt: new Date(b.returnAt.getTime() + 86_400_000) },
      fakeCashfree,
    );
    const extension = await getExtension(pool, b.userId, b.bookingId);
    expect(extension.status).toBe("PENDING");
  });
});
