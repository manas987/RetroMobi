// Test fixtures. Pure SQL only — this file must never import application code,
// so it stays usable no matter what state the implementation is in.
//
// There is deliberately no truncate step: every helper generates unique data, so
// tests are isolated both within a run and across repeated runs against the same
// persistent Postgres.
import crypto from "node:crypto";
import type { Pool } from "pg";

// `bun test` runs test FILES concurrently, each with its own module instance and
// therefore its own `seq` starting at 0. A generator keyed on Date.now() + seq
// hands two files the same value whenever they start in the same millisecond,
// which surfaces as a rare, unreproducible unique-constraint failure in whichever
// test lost the race. SALT is drawn once per module instance, so concurrent files
// cannot collide; it also keeps values unique across repeated runs against the
// same persistent Postgres, which is what Date.now() was there for.
const SALT = crypto.randomInt(0, 1_000_000_000);
let seq = 0;

function uniq(): string {
  seq += 1;
  return `${SALT.toString(36)}${seq}`;
}

export function uniquePhone(): string {
  seq += 1;
  const suffix = (SALT + seq * 7919) % 1_000_000_000;
  return `+917${suffix.toString().padStart(9, "0")}`;
}

export function uniqueEmail(): string {
  return `test${uniq()}@example.com`;
}

export function uniqueRegistration(): string {
  // registration_number is UNIQUE, so a weaker generator produces flaky failures
  // the implementer would reasonably blame on their own code.
  return `UK${uniq().toUpperCase()}`;
}

export async function createUser(pool: Pool): Promise<{ id: string; phone: string }> {
  const phone = uniquePhone();
  const { rows } = await pool.query(
    `insert into users (phone, email) values ($1, $2) returning id, phone`,
    [phone, uniqueEmail()],
  );
  return rows[0];
}

export async function createRider(
  pool: Pool,
  userId: string,
  opts: { dlExpiresOn?: string | null; verified?: boolean } = {},
): Promise<{ id: string }> {
  const { rows } = await pool.query(
    `insert into riders (user_id, name, dob) values ($1, $2, '1995-01-01') returning id`,
    [userId, `Rider ${uniq()}`],
  );
  const riderId = rows[0].id;

  if (opts.verified !== false) {
    await pool.query(
      `insert into driving_licence_verifications
         (rider_id, provider, licence_number, status, valid_from, expires_on, verified_at)
       values ($1, 'TEST', $2, 'VERIFIED', '2020-01-01', $3, now())`,
      [riderId, `DL${uniq()}`, opts.dlExpiresOn ?? "2035-01-01"],
    );
  }
  return { id: riderId };
}

export async function createMerchant(pool: Pool): Promise<{ id: string }> {
  const { rows } = await pool.query(
    `insert into merchant_users (phone, email, name) values ($1, $2, 'Test Merchant') returning id`,
    [uniquePhone(), uniqueEmail()],
  );
  return rows[0];
}

export async function createShop(
  pool: Pool,
  merchantUserId: string,
  opts: { city?: string; lat?: number; lng?: number; state?: string; gstin?: string | null } = {},
): Promise<{ id: string; city: string }> {
  const city = opts.city ?? `Testville${uniq()}`;
  // GST-registered by default. A shop with a null gstin is below the registration
  // threshold and gets no merchant tax invoice at all, so leaving it null here
  // would quietly change what the payment tests are asserting.
  const gstin = opts.gstin === undefined ? "05AAAAA0000A1Z5" : opts.gstin;
  const { rows } = await pool.query(
    `insert into shops (merchant_user_id, name, address_line1, city, state, pincode, latitude, longitude, gstin)
     values ($1, $2, '1 Test Road', $3, $4, '248001', $5, $6, $7)
     returning id, city`,
    [
      merchantUserId,
      `Shop ${uniq()}`,
      city,
      opts.state ?? "Uttarakhand",
      opts.lat ?? 30.3165,
      opts.lng ?? 78.0322,
      gstin,
    ],
  );
  return rows[0];
}

export async function createModel(pool: Pool): Promise<{ id: string }> {
  const { rows } = await pool.query(
    `insert into vehicle_models (make, model, class, fuel_type, engine_cc)
     values ('Honda', $1, 'SCOOTER', 'PETROL', 110) returning id`,
    [`Activa ${uniq()}`],
  );
  return rows[0];
}

/** A vehicle that is ACTIVE (listed) with pricing attached, ready to be booked. */
export async function createBookableVehicle(
  pool: Pool,
  opts: {
    shopId?: string;
    modelId?: string;
    status?: "ACTIVE" | "INACTIVE";
    amount?: number;
    weekendAmount?: number;
    depositAmount?: number;
  } = {},
): Promise<{ id: string; shopId: string; modelId: string }> {
  let shopId = opts.shopId;
  if (!shopId) {
    const merchant = await createMerchant(pool);
    shopId = (await createShop(pool, merchant.id)).id;
  }
  const modelId = opts.modelId ?? (await createModel(pool)).id;

  const { rows } = await pool.query(
    `insert into vehicles (shop_id, model_id, registration_number, status)
     values ($1, $2, $3, $4) returning id`,
    [shopId, modelId, uniqueRegistration(), opts.status ?? "ACTIVE"],
  );
  const vehicleId = rows[0].id;

  await pool.query(
    `insert into vehicle_pricing (vehicle_id, amount, weekend_amount, security_deposit_amount)
     values ($1, $2, $3, $4)`,
    [vehicleId, opts.amount ?? 45_000, opts.weekendAmount ?? 60_000, opts.depositAmount ?? 200_000],
  );

  return { id: vehicleId, shopId, modelId };
}

/** Insert a booking directly, bypassing the service — used to set up conflicts. */
export async function insertBooking(
  pool: Pool,
  opts: {
    vehicleId: string;
    pickupAt: string;
    returnAt: string;
    status?: "HOLD" | "CONFIRMED" | "COMPLETED";
    source?: "ONLINE" | "OFFLINE";
    riderId?: string;
    groupId?: string;
  },
): Promise<{ id: string }> {
  if ((opts.source ?? "ONLINE") === "OFFLINE") {
    const { rows } = await pool.query(
      `insert into bookings (vehicle_id, source, walkin_name, walkin_phone,
                             scheduled_pickup_at, scheduled_return_at, status)
       values ($1, 'OFFLINE', 'Walk In', $2, $3, $4, $5) returning id`,
      [opts.vehicleId, uniquePhone(), opts.pickupAt, opts.returnAt, opts.status ?? "CONFIRMED"],
    );
    return rows[0];
  }

  let groupId = opts.groupId;
  let riderId = opts.riderId;
  if (!groupId || !riderId) {
    const user = await createUser(pool);
    riderId = riderId ?? (await createRider(pool, user.id)).id;
    const g = await pool.query(
      `insert into booking_groups (user_id) values ($1) returning id`,
      [user.id],
    );
    groupId = g.rows[0].id;
  }

  const { rows } = await pool.query(
    `insert into bookings (group_id, rider_id, vehicle_id, source,
                           scheduled_pickup_at, scheduled_return_at, status)
     values ($1, $2, $3, 'ONLINE', $4, $5, $6) returning id`,
    [groupId, riderId, opts.vehicleId, opts.pickupAt, opts.returnAt, opts.status ?? "CONFIRMED"],
  );
  return rows[0];
}

/** Dates far enough in the future that they never collide with other fixtures. */
export function futureWindow(dayOffset = 30, nights = 2) {
  const start = new Date(Date.now() + dayOffset * 86_400_000);
  start.setUTCHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + nights * 86_400_000);
  return { pickupAt: start, returnAt: end };
}
