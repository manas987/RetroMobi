import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import { evaluateRiderForVehicle, istDate } from "../../../lib/licenceGate.ts";
import { presignDownload } from "../../../lib/storage.ts";

/**
 * The identity check at handover.
 *
 * Automated face matching was dropped by decision (see decisions.md,
 * 2026-11-02), so **this is the only evidence binding a human to a licence**.
 * It is therefore a hard, server-side gate with a recorded author -- not a
 * checkbox in the merchant UI -- and both handover paths re-run the licence
 * check, because a licence can expire between booking and pickup.
 */
export class BookingNotFoundError extends Error {}
export class VerificationRequiredError extends Error {}
export class IdentityCheckMissingError extends Error {}
export class IdentityCheckFailedError extends Error {}
export class AlreadyCheckedError extends Error {}

/**
 * What the staff member needs to compare the person in front of them against,
 * and nothing more: no address, no father's name, no full licence number. Data
 * minimisation is a DPDP obligation and also just correct -- a shop assistant
 * has no reason to see a customer's home address.
 */
export async function getIdentityForPickup(
  pool: Pool,
  merchantUserId: string,
  bookingId: string,
) {
  const { rows } = await pool.query(
    `select b.id as booking_id, b.rider_id, b.pickup_licence_ack_at,
            r.name as rider_name,
            to_char(r.dob, 'YYYY-MM-DD') as rider_dob,
            dlv.licence_number as licence_number_masked,
            dlv.licence_status,
            dlv.source_type,
            to_char(dlv.expires_on, 'YYYY-MM-DD') as licence_expires_on,
            s.state as verification_state,
            s.assurance_level,
            s.review_required,
            p.storage_key as photo_key,
            p.source as photo_source,
            c.id as existing_check_id
       from bookings b
       join vehicles v on v.id = b.vehicle_id
       join shops sh on sh.id = v.shop_id
       left join riders r on r.id = b.rider_id
       left join driving_licence_verifications dlv
              on dlv.rider_id = r.id and dlv.status = 'VERIFIED'
       left join rider_verification_sessions s on s.id = dlv.session_id
       left join verification_photos p
              on p.rider_id = r.id and p.deleted_at is null
       left join pickup_identity_checks c on c.booking_id = b.id
      where b.id = $1 and exists (select 1 from shop_members sm where sm.shop_id = sh.id and sm.merchant_user_id = $2 and sm.status = 'ACTIVE' and sm.deleted_at is null) and b.deleted_at is null
      order by dlv.verified_at desc nulls last, p.created_at desc
      limit 1`,
    [bookingId, merchantUserId],
  );
  if (rows.length === 0) {
    throw new BookingNotFoundError(`booking ${bookingId} not found for this merchant`);
  }
  const row = rows[0];

  return {
    bookingId: row.booking_id,
    riderName: row.rider_name,
    riderDob: row.rider_dob,
    licenceNumberMasked: row.licence_number_masked,
    licenceStatus: row.licence_status,
    licenceExpiresOn: row.licence_expires_on,
    verificationState: row.verification_state ?? "NOT_STARTED",
    assuranceLevel: row.assurance_level,
    reviewRequired: row.review_required ?? false,
    photoSource: row.photo_source ?? null,
    // Short-lived, and generated per request rather than stored: a licence
    // photograph behind a long-lived URL is a licence photograph on the
    // internet.
    photoUrl: row.photo_key ? await presignDownload(row.photo_key, 300) : null,
    alreadyChecked: row.existing_check_id !== null,
    pickupLicenceRequired: !!row.pickup_licence_ack_at,
  };
}

/**
 * Re-runs everything that must still be true at the moment the keys change
 * hands. Shared by the merchant's own pickup and by the customer's inspection
 * upload, so the two cannot disagree.
 */
async function assertHandoverAllowed(
  client: PoolClient,
  args: { bookingId: string; requireIdentityCheck: boolean },
) {
  const { rows } = await client.query(
    `select b.id, b.rider_id, b.vehicle_id, b.status, b.pickup_licence_ack_at,
            to_char(b.scheduled_pickup_at, 'YYYY-MM-DD') as start_date,
            to_char(b.scheduled_return_at, 'YYYY-MM-DD') as end_date,
            b.scheduled_return_at > now() as before_return,
            g.user_id,
            s.state as verification_state,
            (select 1 from pickup_identity_checks c where c.booking_id = b.id) as checked
       from bookings b
       -- left: a walk-in has no group, and must reach the exemption below
       left join booking_groups g on g.id = b.group_id
       left join driving_licence_verifications dlv
              on dlv.rider_id = b.rider_id and dlv.status = 'VERIFIED'
       left join rider_verification_sessions s on s.id = dlv.session_id
      where b.id = $1 and b.deleted_at is null
      order by dlv.verified_at desc nulls last
      limit 1`,
    [args.bookingId],
  );
  if (rows.length === 0) throw new BookingNotFoundError(`booking ${args.bookingId} not found`);
  const booking = rows[0];

  // A walk-in has no rider record: the merchant is standing in front of the
  // customer and checked the licence by hand. Exempt by design -- do not
  // "fix" this by requiring a rider.
  if (!booking.rider_id) return;

  if (booking.pickup_licence_ack_at) {
    if (booking.status !== "CONFIRMED" || !booking.before_return) {
      throw new VerificationRequiredError("This booking is outside the licence handover window.");
    }
    if (!args.requireIdentityCheck || !booking.checked) {
      throw new IdentityCheckMissingError("The shop must check the original licence before handover.");
    }
    return;
  }

  if (booking.verification_state !== "VERIFIED") {
    throw new VerificationRequiredError(
      `rider verification for booking ${args.bookingId} is ${booking.verification_state ?? "NOT_STARTED"}, not VERIFIED`,
    );
  }

  // The whole reason this runs again: a licence valid when the booking was
  // made can have expired by the pickup date.
  const gate = await evaluateRiderForVehicle(client, {
    userId: booking.user_id,
    riderId: booking.rider_id,
    vehicleId: booking.vehicle_id,
    rentalStart: istDate(new Date()),
    rentalEnd: booking.end_date,
  });
  if (gate.outcome !== "PASS") {
    throw new VerificationRequiredError(
      `rider is no longer eligible for this vehicle: ${gate.reasons.join(", ")}`,
    );
  }

  if (args.requireIdentityCheck && !booking.checked) {
    throw new IdentityCheckMissingError(
      `shop staff have not confirmed the rider's identity for booking ${args.bookingId} yet`,
    );
  }
}

export { assertHandoverAllowed };

/**
 * Records the check. `photoMatched` and `physicalDlSeen` must both be true --
 * a recorded "no" is not a handover, it is a refusal, and the row exists to
 * say a human looked and agreed.
 *
 * `dlNumberLast4` is the digits read off the physical card, compared against
 * the stored mask. A mismatch means the card in the shop is not the licence
 * that was verified, which is the single most useful fraud signal this design
 * has.
 */
export async function recordIdentityCheck(
  pool: Pool,
  merchantUserId: string,
  bookingId: string,
  input: { photoMatched: boolean; physicalDlSeen: boolean; dlNumberLast4: string; notes?: string },
) {
  const { rows } = await pool.query(
    `select b.id, b.rider_id, dlv.licence_number as licence_number_masked
       from bookings b
       join vehicles v on v.id = b.vehicle_id
       join shops sh on sh.id = v.shop_id
       left join driving_licence_verifications dlv
              on dlv.rider_id = b.rider_id and dlv.status = 'VERIFIED'
      where b.id = $1 and exists (select 1 from shop_members sm where sm.shop_id = sh.id and sm.merchant_user_id = $2 and sm.status = 'ACTIVE' and sm.deleted_at is null) and b.deleted_at is null
      order by dlv.verified_at desc nulls last
      limit 1`,
    [bookingId, merchantUserId],
  );
  if (rows.length === 0) {
    throw new BookingNotFoundError(`booking ${bookingId} not found for this merchant`);
  }
  const booking = rows[0];
  if (!booking.rider_id) {
    throw new BookingNotFoundError(`booking ${bookingId} is a walk-in and needs no identity check`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertHandoverAllowed(client, { bookingId, requireIdentityCheck: false });

    if (!input.photoMatched || !input.physicalDlSeen) {
      // Audited before throwing: a refused handover is exactly the event
      // somebody will want to find later.
      await writeAudit(client, {
        actorType: "MERCHANT",
        actorId: merchantUserId,
        action: "booking.identity_check_failed",
        entityType: "booking",
        entityId: bookingId,
        after: { photoMatched: input.photoMatched, physicalDlSeen: input.physicalDlSeen },
      });
      await client.query("COMMIT");
      throw new IdentityCheckFailedError(
        "the photograph did not match or the original licence was not produced",
      );
    }

    const last4 = input.dlNumberLast4.trim().toUpperCase();
    const expected = String(booking.licence_number_masked ?? "")
      .trim()
      .toUpperCase()
      .slice(-4);
    if (!expected || last4 !== expected) {
      await writeAudit(client, {
        actorType: "MERCHANT",
        actorId: merchantUserId,
        action: "booking.identity_check_licence_mismatch",
        entityType: "booking",
        entityId: bookingId,
        after: { entered: last4, expected },
      });
      await client.query("COMMIT");
      throw new IdentityCheckFailedError(
        "the licence number on the card does not match the verified licence",
      );
    }

    const insert = await client.query(
      `insert into pickup_identity_checks
         (booking_id, rider_id, checked_by, photo_matched, physical_dl_seen, dl_number_last4, notes)
       values ($1, $2, $3, true, true, $4, $5)
       on conflict (booking_id) do nothing
       returning id`,
      [bookingId, booking.rider_id, merchantUserId, last4, input.notes ?? null],
    );
    if (insert.rows.length === 0) {
      throw new AlreadyCheckedError(`booking ${bookingId} has already been checked`);
    }

    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "booking.identity_checked",
      entityType: "booking",
      entityId: bookingId,
      after: { riderId: booking.rider_id, dlNumberLast4: last4 },
    });
    await client.query("COMMIT");
    return { id: insert.rows[0].id as string };
  } catch (err) {
    if (
      err instanceof IdentityCheckFailedError ||
      err instanceof VerificationRequiredError ||
      err instanceof IdentityCheckMissingError
    ) {
      throw err;
    }
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}


/** The original card is compared in person. This approval belongs to one booking. */
export async function approvePickupLicence(pool: Pool, merchantUserId: string, shopId: string, bookingId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `select b.rider_id from bookings b join vehicles v on v.id = b.vehicle_id
        where b.id = $1 and v.shop_id = $2 and b.deleted_at is null
          and b.status = 'CONFIRMED' and b.actual_pickup_at is null and b.scheduled_return_at > now()
          and b.pickup_licence_ack_at is not null
          and exists (select 1 from shop_members sm where sm.shop_id = v.shop_id and sm.merchant_user_id = $3
                       and sm.status = 'ACTIVE' and sm.deleted_at is null)
        for update of b`,
      [bookingId, shopId, merchantUserId],
    );
    const riderId = rows[0]?.rider_id;
    if (!riderId) throw new BookingNotFoundError("This booking is not awaiting an in-person licence check.");
    const approved = await client.query(
      `insert into pickup_identity_checks (booking_id, rider_id, checked_by, photo_matched, physical_dl_seen)
       values ($1, $2, $3, true, true) on conflict (booking_id) do nothing returning id`,
      [bookingId, riderId, merchantUserId],
    );
    if (approved.rowCount) {
      await writeAudit(client, {
        actorType: "MERCHANT", actorId: merchantUserId, action: "booking.pickup_licence_approved",
        entityType: "booking", entityId: bookingId,
        after: { originalSeen: true, photoMatched: true, validForVehicleAndDates: true },
      });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
