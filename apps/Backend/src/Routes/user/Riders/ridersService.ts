import type { Pool } from "pg";
import type { KycClient } from "../../../providers/kyc.ts";
import { isPickupLicenceOutage, pickupLicenceRejections } from "../../../lib/pickupLicence.ts";
import { writeAudit } from "../../../lib/audit.ts";
import { maskDl } from "../../../lib/maskSecrets.ts";
import { hashLicenceNumber, normaliseLicenceNumber } from "../../../lib/verificationHash.ts";

export class RiderNotFoundError extends Error {}
export class RiderHasActiveBookingError extends Error {}
export class DigilockerRequestNotFoundError extends Error {}

/**
 * The vendor is not configured, so no check happened. This is deliberately an
 * error rather than a status: the one thing a missing credential must never do
 * is produce an approved licence (see providers/kyc.ts). Phase 4 replaces it
 * with a MANUAL_REVIEW_REQUIRED session; until then it is a loud 503.
 */
export class KycUnavailableError extends Error {}

async function requireOwnedRider(pool: Pool, userId: string, riderId: string) {
  const { rows } = await pool.query(
    `select id from riders where id = $1 and user_id = $2 and deleted_at is null`,
    [riderId, userId],
  );
  if (rows.length === 0) throw new RiderNotFoundError(`rider ${riderId} not found`);
}

export async function listRiders(pool: Pool, userId: string) {
  const { rows } = await pool.query(
    // dob as text, not a date: pg maps a `date` column to a JS Date at *local*
    // midnight, which JSON.stringify then shifts back a day in any timezone
    // east of Greenwich — the stored 1995-06-15 reached the client as the 14th.
    // Both dates as text, for the same reason: `licence_expires_on` had been
    // left as a `date` and so displayed a day early in IST, exactly like dob did.
    `select r.id, r.name, to_char(r.dob, 'YYYY-MM-DD') as dob,
            dlv.status as licence_status,
            to_char(dlv.expires_on, 'YYYY-MM-DD') as licence_expires_on,
            s.state, s.rejection_code, s.expires_at > now() as current,
            exists (select 1 from rider_verification_sessions past
              where past.rider_id = r.id and past.rejection_code = any($2::text[])) as known_ineligible
       from riders r
       left join lateral (
         select status, expires_on from driving_licence_verifications
          where rider_id = r.id and status = 'VERIFIED'
          order by verified_at desc nulls last, created_at desc, id desc limit 1
       ) dlv on true
       left join lateral (
         select state, rejection_code, expires_at from rider_verification_sessions
          where rider_id = r.id and user_id = r.user_id
          order by created_at desc, id desc limit 1
       ) s on true
      where r.user_id = $1 and r.deleted_at is null
      order by r.created_at`,
    [userId, pickupLicenceRejections],
  );
  return rows.map(({ current, state, rejection_code, known_ineligible, ...rider }) => ({
    ...rider,
    verification_state: state ?? null,
    pickup_licence_available: !rider.licence_status && isPickupLicenceOutage({ current, state, rejection_code, known_ineligible }),
  }));
}

export async function createRider(
  pool: Pool,
  userId: string,
  input: { name: string; dob?: string },
) {
  const { rows } = await pool.query(
    `insert into riders (user_id, name, dob) values ($1, $2, $3) returning id, name, dob`,
    [userId, input.name, input.dob ?? null],
  );
  return rows[0];
}

export async function updateRider(
  pool: Pool,
  userId: string,
  riderId: string,
  input: { name?: string; dob?: string },
) {
  await requireOwnedRider(pool, userId, riderId);
  const { rows } = await pool.query(
    `update riders
        set name = coalesce($1, name),
            dob = coalesce($2, dob),
            updated_at = now()
      where id = $3
      returning id, name, dob`,
    [input.name ?? null, input.dob ?? null, riderId],
  );
  return rows[0];
}

export async function deleteRider(pool: Pool, userId: string, riderId: string) {
  await requireOwnedRider(pool, userId, riderId);

  const active = await pool.query(
    `select id from bookings where rider_id = $1 and status in ('HOLD', 'CONFIRMED') and deleted_at is null`,
    [riderId],
  );
  if (active.rows.length > 0) {
    throw new RiderHasActiveBookingError(`rider ${riderId} has an active booking`);
  }

  await pool.query(`update riders set deleted_at = now() where id = $1`, [riderId]);
}

export async function requestDigilockerConsent(
  pool: Pool,
  userId: string,
  riderId: string,
  redirectUrl: string,
  kyc: KycClient,
) {
  await requireOwnedRider(pool, userId, riderId);

  // The correlation key is ours, not the vendor's: the callback looks the row
  // up by (rider, verification_id), so a client cannot name someone else's
  // verification. The old code stored a vendor-minted id and then trusted
  // whatever id the client posted back.
  const verificationId = crypto.randomUUID();
  const { consentUrl } = await kyc.digilockerCreateRequest({ verificationId, redirectUrl });

  await pool.query(
    `insert into driving_licence_verifications (rider_id, provider, licence_number, status, provider_reference)
     values ($1, 'DIGILOCKER', '', 'PENDING', $2)`,
    [riderId, verificationId],
  );

  return { consentUrl, requestId: verificationId };
}

export async function completeDigilockerVerification(
  pool: Pool,
  userId: string,
  riderId: string,
  requestId: string,
  kyc: KycClient,
) {
  await requireOwnedRider(pool, userId, riderId);

  const live = await kyc.digilockerStatus({ verificationId: requestId });
  if (!live) throw new DigilockerRequestNotFoundError(`digilocker request ${requestId} not found`);
  if (live.status === "SANDBOX_UNAVAILABLE" || live.status === "PROVIDER_OUTAGE") {
    throw new KycUnavailableError("DigiLocker verification is unavailable");
  }
  // PENDING means the customer has not finished on DigiLocker's side yet, so
  // the row stays PENDING and they can come back. Only CONSENT_DENIED and
  // EXPIRED are terminal failures.
  if (live.status === "PENDING") return { status: "PENDING" as const };
  const result = { status: live.status === "AUTHENTICATED" ? ("VERIFIED" as const) : ("REJECTED" as const) };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(
      `select status from driving_licence_verifications where rider_id = $1 and provider_reference = $2`,
      [riderId, requestId],
    );

    // No licence number or expiry yet: those live in the issued DigiLocker XML,
    // which Phase 4 downloads and parses. Until then this records consent only
    // -- which is why the booking gate (which requires a non-null expires_on)
    // still will not pass on the strength of a DigiLocker consent alone.
    await client.query(
      `update driving_licence_verifications
          set status = $1, verified_at = case when $1 = 'VERIFIED' then now() else null end,
              updated_at = now()
        where rider_id = $2 and provider_reference = $3`,
      [result.status, riderId, requestId],
    );

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "rider.licence_verified",
      entityType: "rider",
      entityId: riderId,
      before: before.rows[0],
      after: { status: result.status },
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return result;
}

export async function verifyLicenceManually(
  pool: Pool,
  userId: string,
  riderId: string,
  input: { licenceNumber: string; dob: string },
  kyc: KycClient,
) {
  await requireOwnedRider(pool, userId, riderId);

  const result = await kyc.verifyLicence({
    verificationId: crypto.randomUUID(),
    licenceNumber: input.licenceNumber,
    dob: input.dob,
  });
  if (result?.status === "SANDBOX_UNAVAILABLE" || result?.status === "PROVIDER_OUTAGE") {
    throw new KycUnavailableError("Licence verification is unavailable");
  }
  // A null result is a licence the RTO has no record of -- a rejection, not an
  // outage. The two are kept apart deliberately: only one of them is our fault.
  const status = result?.status ?? "REJECTED";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `insert into driving_licence_verifications
         (rider_id, provider, licence_number, licence_number_hash, status,
          licence_status, source_type, valid_from, expires_on, issuing_authority, verified_at)
       values ($1, 'CASHFREE_SECURE_ID', $2, $7, $3, $8, 'RTO_RECORD', $4, $5, $6,
               case when $3 = 'VERIFIED' then now() else null end)
       returning id, status`,
      [
        riderId,
        // The MASK, and the hash beside it. The full number is never stored
        // (migration 0015). This deprecated shim was still writing the raw
        // value, which would have put real licence numbers in the database for
        // as long as a stale browser tab kept calling it.
        maskDl(normaliseLicenceNumber(input.licenceNumber)),
        status,
        result?.validFrom ?? null,
        result?.expiresOn ?? null,
        result?.issuingAuthority ?? null,
        hashLicenceNumber(input.licenceNumber),
        result?.licenceStatus ?? null,
      ],
    );

    // This is the only place a dob is entered now, so keep it on the rider —
    // Profile's "Born …" line and any later verification read it from here
    // instead of asking again. Stored even on a REJECTED result: a rejection
    // usually means a mistyped licence number, not a wrong birth date.
    await client.query(`update riders set dob = $1, updated_at = now() where id = $2`, [
      input.dob,
      riderId,
    ]);

    if (result?.categories?.length) {
      for (const category of result.categories) {
        // All four columns, not just `code`: Phase 3's eligibility check needs
        // the endorsement date to tell an entitlement that is on the licence
        // from one that is on it but not yet effective.
        await client.query(
          `insert into driving_licence_categories
             (licence_verification_id, code, abbreviation, issue_date, endorse_date)
           values ($1, $2, $3, $4, $5)`,
          [
            rows[0].id,
            category.code,
            category.abbreviation ?? null,
            category.issueDate ?? null,
            category.endorseDate ?? null,
          ],
        );
      }
    }

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "rider.licence_manual_verify",
      entityType: "rider",
      entityId: riderId,
      after: { status },
    });
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
