import type { Pool } from "pg";
import type { KycClient } from "../../../providers/kyc.ts";
import { writeAudit } from "../../../lib/audit.ts";

export class RiderNotFoundError extends Error {}
export class RiderHasActiveBookingError extends Error {}
export class DigilockerRequestNotFoundError extends Error {}

async function requireOwnedRider(pool: Pool, userId: string, riderId: string) {
  const { rows } = await pool.query(
    `select id from riders where id = $1 and user_id = $2 and deleted_at is null`,
    [riderId, userId],
  );
  if (rows.length === 0) throw new RiderNotFoundError(`rider ${riderId} not found`);
}

export async function listRiders(pool: Pool, userId: string) {
  const { rows } = await pool.query(
    `select r.id, r.name, r.dob,
            dlv.status as licence_status, dlv.expires_on as licence_expires_on
       from riders r
       left join driving_licence_verifications dlv on dlv.rider_id = r.id and dlv.status = 'VERIFIED'
      where r.user_id = $1 and r.deleted_at is null
      order by r.created_at`,
    [userId],
  );
  return rows;
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
  const { consentUrl, requestId } = await kyc.digilockerConsentUrl({ riderId, redirectUrl });

  await pool.query(
    `insert into driving_licence_verifications (rider_id, provider, licence_number, status, provider_reference)
     values ($1, 'DIGILOCKER', '', 'PENDING', $2)`,
    [riderId, requestId],
  );

  return { consentUrl, requestId };
}

export async function completeDigilockerVerification(
  pool: Pool,
  userId: string,
  riderId: string,
  requestId: string,
  kyc: KycClient,
) {
  await requireOwnedRider(pool, userId, riderId);

  const result = await kyc.digilockerFetch({ requestId });
  if (!result) throw new DigilockerRequestNotFoundError(`digilocker request ${requestId} not found`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await client.query(
      `select status from driving_licence_verifications where rider_id = $1 and provider_reference = $2`,
      [riderId, requestId],
    );

    await client.query(
      `update driving_licence_verifications
          set status = $1, licence_number = coalesce($2, licence_number),
              expires_on = $3, verified_at = case when $1 = 'VERIFIED' then now() else null end
        where rider_id = $4 and provider_reference = $5`,
      [result.status, result.licenceNumber ?? null, result.expiresOn ?? null, riderId, requestId],
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

  const result = await kyc.verifyLicence({ licenceNumber: input.licenceNumber, dob: input.dob });
  const status = result?.status ?? "REJECTED";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `insert into driving_licence_verifications
         (rider_id, provider, licence_number, status, valid_from, expires_on, issuing_authority, verified_at)
       values ($1, 'CASHFREE_SECURE_ID', $2, $3, $4, $5, $6, case when $3 = 'VERIFIED' then now() else null end)
       returning id, status`,
      [
        riderId,
        input.licenceNumber,
        status,
        result?.validFrom ?? null,
        result?.expiresOn ?? null,
        result?.issuingAuthority ?? null,
      ],
    );

    if (result?.categories?.length) {
      for (const category of result.categories) {
        await client.query(
          `insert into driving_licence_categories (licence_verification_id, code) values ($1, $2)`,
          [rows[0].id, category.code],
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
