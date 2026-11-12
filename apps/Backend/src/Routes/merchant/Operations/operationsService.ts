import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import { composeTotal, priceRental } from "../../../lib/pricing.ts";

export class WalkinUnavailableError extends Error {}
export class VehicleUnavailableError extends Error {}
export class InvalidDurationError extends Error {}

const EXCLUSION_VIOLATION = "23P01";

function getMoneyConfig() {
  return {
    platformFeePct: Number(process.env.PLATFORM_FEE_PCT ?? 10),
    gstRate: Number(process.env.GST_RATE ?? 18),
  };
}

/**
 * A merchant looking at their own bookings needs to know which scooter and
 * which person. The `vehicles` join was always here; nothing was selected
 * from it, so both the list and the detail answered neither question.
 *
 * `rider_name`/`customer_*` are null for a walk-in and `walkin_*` null for an
 * online booking — the two are mutually exclusive by source, so the caller
 * reads whichever side is populated.
 */
const BOOKING_SELECT = `
  select b.*,
         v.registration_number, m.make, m.model,
         r.name as rider_name,
         u.name as customer_name, u.phone as customer_phone,
         sd.status as deposit_status, sd.amount as deposit_amount
    from bookings b
    join vehicles v on v.id = b.vehicle_id
    join vehicle_models m on m.id = v.model_id
    left join riders r on r.id = b.rider_id
    left join booking_groups g on g.id = b.group_id
    left join users u on u.id = g.user_id
    left join security_deposits sd on sd.booking_id = b.id`;

export interface ListBookingsFilters {
  status?: string;
  from?: Date;
  to?: Date;
  source?: "ONLINE" | "OFFLINE";
  vehicleId?: string;
  /** Name, phone, plate, or part of a booking id. */
  q?: string;
}

export async function listBookings(pool: Pool, shopId: string, filters: ListBookingsFilters) {
  const conditions = ["v.shop_id = $1", "b.deleted_at is null"];
  const values: unknown[] = [shopId];
  const add = (sql: (n: string) => string, value: unknown) => {
    values.push(value);
    conditions.push(sql(`$${values.length}`));
  };

  if (filters.status) add((n) => `b.status = ${n}`, filters.status);
  // A range returns every booking that OVERLAPS it, not only those starting in
  // it -- a calendar month must show the ride that began on the 28th.
  if (filters.from) add((n) => `coalesce(b.actual_return_at, b.scheduled_return_at) >= ${n}`, filters.from);
  if (filters.to) add((n) => `b.scheduled_pickup_at <= ${n}`, filters.to);
  if (filters.source) add((n) => `b.source = ${n}`, filters.source);
  if (filters.vehicleId) add((n) => `b.vehicle_id = ${n}`, filters.vehicleId);
  if (filters.q) {
    add(
      (n) => `(b.walkin_name ilike ${n} or b.walkin_phone ilike ${n} or r.name ilike ${n}
               or u.name ilike ${n} or u.phone ilike ${n}
               or replace(v.registration_number, ' ', '') ilike replace(${n}, ' ', '')
               or b.id::text ilike ${n})`,
      `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`,
    );
  }

  const { rows } = await pool.query(
    `${BOOKING_SELECT}
      where ${conditions.join(" and ")}
      order by b.scheduled_pickup_at desc`,
    values,
  );
  return rows;
}

export async function getBooking(pool: Pool, shopId: string, bookingId: string) {
  const { rows } = await pool.query(
    `${BOOKING_SELECT} where b.id = $1 and v.shop_id = $2 and b.deleted_at is null`,
    [bookingId, shopId],
  );
  return rows[0] ?? null;
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

// Walk-ins share the bookings table so marketplace availability stays correct
// without a second code path. No payments row, no security_deposits row, no
// payouts, no invoice -- money moved in cash, outside the platform.
export async function createWalkinRental(
  pool: Pool,
  input: {
    merchantUserId: string;
    vehicleId: string;
    walkinName: string;
    walkinPhone: string;
    walkinDlNumber: string;
    pickupAt: Date;
    returnAt: Date;
  },
): Promise<{ id: string; totals: ReturnType<typeof composeTotal> }> {
  if (input.returnAt.getTime() <= input.pickupAt.getTime()) {
    throw new InvalidDurationError("return must be after pickup");
  }

  const { platformFeePct, gstRate } = getMoneyConfig();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Not `status = 'ACTIVE'`: that column is the marketplace listing switch.
    // A shop rents its unlisted vehicles at the counter too -- the fleet is
    // useful whether or not it's on RetroMobi.
    const vehicleCheck = await client.query(
      `select id from vehicles where id = $1 and deleted_at is null`,
      [input.vehicleId],
    );
    if (vehicleCheck.rows.length === 0) {
      throw new VehicleUnavailableError(`vehicle ${input.vehicleId} is not available`);
    }

    const { pricing, specials } = await loadPricingAndSpecials(client, input.vehicleId);
    const { rentalAmount } = priceRental({
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
      pricing,
      specialPricings: specials,
    });

    const totals = composeTotal({
      rentalAmount,
      securityDepositAmount: pricing.securityDepositAmount,
      platformFeePct,
      gstRate,
      discountAmount: 0,
    });

    let bookingId: string;
    try {
      const { rows } = await client.query(
        `insert into bookings
           (vehicle_id, source, walkin_name, walkin_phone, walkin_dl_number,
            scheduled_pickup_at, scheduled_return_at, status, rental_amount,
            security_deposit_amount, platform_fee, tax_amount, discount_amount, total_amount)
         values ($1, 'OFFLINE', $2, $3, $4, $5, $6, 'CONFIRMED', $7, $8, $9, $10, $11, $12)
         returning id`,
        [
          input.vehicleId,
          input.walkinName,
          input.walkinPhone,
          input.walkinDlNumber,
          input.pickupAt,
          input.returnAt,
          totals.rentalAmount,
          totals.securityDepositAmount,
          totals.platformFee,
          totals.taxAmount,
          totals.discountAmount,
          totals.totalAmount,
        ],
      );
      bookingId = rows[0].id;
    } catch (err: any) {
      if (err.code === EXCLUSION_VIOLATION) {
        throw new WalkinUnavailableError(`vehicle ${input.vehicleId} is already booked for this window`);
      }
      throw err;
    }

    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: input.merchantUserId,
      action: "booking.walkin_created",
      entityType: "booking",
      entityId: bookingId,
      after: { vehicleId: input.vehicleId, totalAmount: totals.totalAmount },
    });

    await client.query("COMMIT");
    return { id: bookingId, totals };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
