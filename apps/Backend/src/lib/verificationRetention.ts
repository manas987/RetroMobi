import type { Pool } from "pg";
import { deleteObject } from "./storage.ts";

/**
 * Deletes licence photographs once they are no longer needed.
 *
 * This exists because the consent the customer agreed to says so: *"these
 * details are deleted after my last rental"* (verificationService.CONSENT_TEXT).
 * A retention promise with nothing enforcing it is just text.
 *
 * What is NOT deleted: the masked licence number, the peppered hash, and the
 * verification event trail. Those are the audit record of a decision that let
 * a stranger ride away on a scooter, they identify nobody on their own, and a
 * duplicate-licence check across accounts depends on the hash surviving.
 *
 * ponytail: runs on the existing 30-second sweep timer with a small batch
 * rather than a scheduler. If photo volume ever makes that too slow, move it
 * to its own interval -- the function already takes a limit.
 */
const DEFAULT_RETENTION_DAYS = 90;

export function retentionDays(): number {
  const raw = Number(process.env.VERIFICATION_PHOTO_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RETENTION_DAYS;
}

export async function sweepVerificationPhotos(pool: Pool, limit = 25): Promise<number> {
  // A rider with no completed booking is measured from the photo's own age:
  // somebody who verified and never rented should not keep a photograph on
  // file forever either.
  const { rows } = await pool.query(
    `select p.id, p.storage_key
       from verification_photos p
      where p.deleted_at is null
        and greatest(
              p.created_at,
              coalesce((select max(b.actual_return_at) from bookings b
                         where b.rider_id = p.rider_id and b.deleted_at is null), p.created_at)
            ) < now() - ($1 || ' days')::interval
        -- Never while a rental is still open, whatever the dates say.
        and not exists (
              select 1 from bookings b
               where b.rider_id = p.rider_id
                 and b.status in ('HOLD', 'CONFIRMED')
                 and b.deleted_at is null)
      order by p.created_at
      limit $2`,
    [String(retentionDays()), limit],
  );

  let deleted = 0;
  for (const row of rows) {
    try {
      await deleteObject(row.storage_key);
    } catch (err) {
      // Leave the row alone so the next sweep retries. Marking it deleted when
      // the object survives is the one outcome that breaks the promise while
      // looking like it kept it.
      console.error(`retention: could not delete ${row.storage_key}`, err);
      continue;
    }
    await pool.query(`update verification_photos set deleted_at = now() where id = $1`, [row.id]);
    deleted += 1;
  }
  return deleted;
}

/**
 * Consent withdrawal, or an account deletion. Immediate, not on the retention
 * clock -- a withdrawn consent is withdrawn now.
 */
export async function deleteRiderVerificationData(pool: Pool, riderId: string): Promise<number> {
  const { rows } = await pool.query(
    `select id, storage_key from verification_photos
      where rider_id = $1 and deleted_at is null`,
    [riderId],
  );
  let deleted = 0;
  for (const row of rows) {
    await deleteObject(row.storage_key);
    await pool.query(`update verification_photos set deleted_at = now() where id = $1`, [row.id]);
    deleted += 1;
  }
  // The licence record itself stays, masked and hashed -- see the note at the
  // top of this file. What is removed is the photograph of a person.
  return deleted;
}
