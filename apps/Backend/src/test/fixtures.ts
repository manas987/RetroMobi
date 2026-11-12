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

/**
 * A rider who passes the licence gate: a verification session at the current
 * policy version, a VERIFIED licence with an RTO status, and a category that
 * entitles them to the vehicle class `createModel` produces.
 *
 * `categories` and `licenceStatus` are not decoration -- since the eligibility
 * engine landed, a licence with no category data or no RTO status does not
 * pass, which is the whole point of it.
 */
export async function createRider(
  pool: Pick<Pool, "query">,
  userId: string,
  opts: {
    dlExpiresOn?: string | null;
    verified?: boolean;
    dob?: string;
    categories?: string[];
    licenceStatus?: string | null;
    policyVersion?: string;
  } = {},
): Promise<{ id: string }> {
  const { rows } = await pool.query(
    `insert into riders (user_id, name, dob) values ($1, $2, $3) returning id`,
    [userId, `Rider ${uniq()}`, opts.dob ?? "1995-01-01"],
  );
  const riderId = rows[0].id;

  if (opts.verified !== false) {
    const session = await pool.query(
      `insert into rider_verification_sessions
         (rider_id, user_id, method, provider, state, verification_id, policy_version,
          assurance_level, consent_text, consent_at, expires_at)
       values ($1, $2, 'DL_NUMBER', 'TEST', 'VERIFIED', $3, $4,
               'MEDIUM', 'test fixture consent', now(), now() + interval '1 day')
       returning id`,
      [riderId, userId, `fixture-${uniq()}`, opts.policyVersion ?? "v1"],
    );
    // licence_number holds the MASK since migration 0015 -- the full number is
    // never stored. Masked here the same way lib/maskSecrets.ts does it, by
    // hand rather than by import, because this file must not depend on
    // application code. The last four stay meaningful: the handover check
    // compares them against what staff read off the physical card.
    const fullNumber = `UK${String(SALT + seq).padStart(13, "0")}`.slice(0, 15);
    const masked =
      fullNumber.slice(0, 4) + "*".repeat(fullNumber.length - 8) + fullNumber.slice(-4);
    const verification = await pool.query(
      `insert into driving_licence_verifications
         (rider_id, session_id, provider, licence_number, licence_number_hash, status,
          licence_status, source_type, valid_from, expires_on, verified_at)
       values ($1, $2, 'TEST', $3, $4, 'VERIFIED', $5, 'RTO_RECORD', '2020-01-01', $6, now())
       returning id`,
      [
        riderId,
        session.rows[0].id,
        masked,
        `hash${uniq()}`,
        opts.licenceStatus === undefined ? "Active" : opts.licenceStatus,
        opts.dlExpiresOn ?? "2035-01-01",
      ],
    );
    for (const code of opts.categories ?? ["MCWG"]) {
      await pool.query(
        `insert into driving_licence_categories (licence_verification_id, code, issue_date, endorse_date)
         values ($1, $2, '2020-01-01', '2020-01-01')`,
        [verification.rows[0].id, code],
      );
    }
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
    `insert into shops (merchant_user_id, name, address_line1, city, state, pincode, latitude, longitude, gstin, verification_status)
     values ($1, $2, '1 Test Road', $3, $4, '248001', $5, $6, $7, 'VERIFIED')
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

/**
 * `class` is the key into vehicle_class_licence_rules (seeded in 0016), so a
 * model with an unmapped class fails the licence gate with NO_RULE -- which is
 * deliberate, and worth knowing when a booking test starts failing.
 */
export async function createModel(
  pool: Pool,
  opts: { class?: string | null } = {},
): Promise<{ id: string }> {
  const { rows } = await pool.query(
    `insert into vehicle_models (make, model, class, fuel_type, engine_cc)
     values ('Honda', $1, $2, 'PETROL', 110) returning id`,
    [`Activa ${uniq()}`, opts.class === undefined ? "SCOOTER" : opts.class],
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
    withLicence?: boolean;
  } = {},
): Promise<{ id: string; shopId: string; modelId: string }> {
  let shopId = opts.shopId;
  if (!shopId) {
    const merchant = await createMerchant(pool);
    shopId = (await createShop(pool, merchant.id)).id;
  }
  const modelId = opts.modelId ?? (await createModel(pool)).id;

  const { rows } = await pool.query(
    `insert into vehicles (shop_id, model_id, registration_number, status, verification_status)
     values ($1, $2, $3, $4, 'VERIFIED') returning id`,
    [shopId, modelId, uniqueRegistration(), opts.status ?? "ACTIVE"],
  );
  const vehicleId = rows[0].id;

  await pool.query(
    `insert into vehicle_pricing (vehicle_id, amount, weekend_amount, security_deposit_amount)
     values ($1, $2, $3, $4)`,
    [vehicleId, opts.amount ?? 45_000, opts.weekendAmount ?? 60_000, opts.depositAmount ?? 200_000],
  );

  if (opts.withLicence !== false) {
    await pool.query(
      `with licence as (
         insert into shop_licenses (merchant_user_id, licence_number, status, expires_at)
         select merchant_user_id, 'TEST-' || $1::text, 'ACTIVE', current_date + interval '10 years'
           from shops where id = $2 returning id
       )
       insert into license_vehicles (license_id, vehicle_id, registration_number)
       select licence.id, v.id, v.registration_number from licence cross join vehicles v where v.id = $1::uuid`,
      [vehicleId, shopId],
    );
  }

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

/**
 * Records the shop staff's identity check for a booking, which both handover
 * paths now require (docs/dl-verification.md Phase 5). Inserts directly rather
 * than calling the service, so a test about pickup does not fail because of
 * something in the check's own validation.
 */
export async function passIdentityCheck(pool: Pool, bookingId: string): Promise<void> {
  const { rows } = await pool.query(
    `select b.rider_id, sh.merchant_user_id, dlv.licence_number
       from bookings b
       join vehicles v on v.id = b.vehicle_id
       join shops sh on sh.id = v.shop_id
       left join driving_licence_verifications dlv
              on dlv.rider_id = b.rider_id and dlv.status = 'VERIFIED'
      where b.id = $1
      order by dlv.verified_at desc nulls last
      limit 1`,
    [bookingId],
  );
  if (rows.length === 0) throw new Error(`booking ${bookingId} not found`);
  const row = rows[0];
  if (!row.rider_id) return; // a walk-in needs no check

  await pool.query(
    `insert into pickup_identity_checks
       (booking_id, rider_id, checked_by, photo_matched, physical_dl_seen, dl_number_last4)
     values ($1, $2, $3, true, true, $4)
     on conflict (booking_id) do nothing`,
    [bookingId, row.rider_id, row.merchant_user_id, String(row.licence_number ?? "").slice(-4)],
  );
}
