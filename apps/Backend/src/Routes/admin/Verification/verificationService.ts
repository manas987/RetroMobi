import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import { presignDownload } from "../../../lib/storage.ts";
import {
  IllegalTransitionError,
  transition,
} from "../../../lib/verificationStateMachine.ts";

export class VerificationTargetNotFoundError extends Error {}

export type VerifiableType =
  | "SHOP"
  | "VEHICLE"
  | "VEHICLE_DOCUMENT"
  | "MERCHANT_DOCUMENT"
  | "SHOP_LICENCE"
  | "RIDER_VERIFICATION";

/** Only a session a human is supposed to judge can be approved. */
export class NotReviewableError extends Error {}

/**
 * Every row has to identify itself to the admin deciding on it. These queries
 * used to select bare ids, which meant approving an insurance paper showed a
 * `vehicle_id` UUID and nothing else — no vehicle, no shop, no merchant, and
 * no `storage_key` with which to look at the document being judged.
 *
 * `$1` is the status filter in every query so the caller can review decided
 * items too, not only the pending ones.
 */
const QUEUE_QUERIES: Record<VerifiableType, string> = {
  SHOP: `
    select s.id, s.name, s.city, s.verification_status as status, s.created_at,
           mu.name as merchant_name, mu.phone as merchant_phone
      from shops s
      join merchant_users mu on mu.id = s.merchant_user_id
     where s.verification_status = $1 and s.deleted_at is null
     order by s.created_at`,

  VEHICLE: `
    select v.id, v.registration_number, v.verification_status as status, v.created_at,
           m.make, m.model, s.name as shop_name, s.city,
           mu.name as merchant_name
      from vehicles v
      join vehicle_models m on m.id = v.model_id
      join shops s on s.id = v.shop_id
      join merchant_users mu on mu.id = s.merchant_user_id
     where v.verification_status = $1 and v.deleted_at is null
     order by v.created_at`,

  VEHICLE_DOCUMENT: `
    select d.id, d.type, d.document_number, d.issued_at, d.expires_at,
           d.status, d.storage_key, d.created_at,
           v.id as vehicle_id, v.registration_number,
           m.make, m.model, s.name as shop_name, mu.name as merchant_name
      from vehicle_documents d
      join vehicles v on v.id = d.vehicle_id
      join vehicle_models m on m.id = v.model_id
      join shops s on s.id = v.shop_id
      join merchant_users mu on mu.id = s.merchant_user_id
     where d.status = $1 and d.deleted_at is null
     order by d.created_at`,

  MERCHANT_DOCUMENT: `
    select d.id, d.type, d.document_number, d.issued_at, d.expires_at,
           d.status, d.storage_key, d.created_at,
           mu.id as merchant_user_id, mu.name as merchant_name, mu.phone as merchant_phone
      from merchant_documents d
      join merchant_users mu on mu.id = d.merchant_user_id
     where d.status = $1 and d.deleted_at is null
     order by d.created_at`,

  // A customer's driving licence, which is a different kind of review from the
  // five merchant-side ones: there is no document to look at, only evidence to
  // weigh. So this row carries the reason it needs a human (review_required
  // with a rejection_code), the assurance level, and the photo's source --
  // SELF_UPLOADED being the case where there is genuinely nothing to verify
  // against.
  //
  // $1 is the session state, matching the other queries' status filter.
  RIDER_VERIFICATION: `
    select s.id, s.state as status, s.method, s.assurance_level, s.review_required,
           s.rejection_code, s.policy_version, s.created_at,
           r.id as rider_id, r.name as rider_name,
           to_char(r.dob, 'YYYY-MM-DD') as rider_dob,
           u.phone as account_phone,
           dlv.licence_number as licence_number_masked,
           dlv.licence_number_hash,
           dlv.holder_name, dlv.licence_status, dlv.source_type, dlv.issuing_authority,
           to_char(dlv.expires_on, 'YYYY-MM-DD') as licence_expires_on,
           p.storage_key as photo_key, p.source as photo_source,
           coalesce(
             (select json_agg(json_build_object('code', c.code, 'abbreviation', c.abbreviation)
                              order by c.code)
                from driving_licence_categories c
               where c.licence_verification_id = dlv.id),
             '[]'::json) as categories,
           -- The same licence on another account. A flag for a human, never a
           -- refusal: families share accounts.
           (select count(*)::int from driving_licence_verifications d2
              join riders r2 on r2.id = d2.rider_id
             where d2.licence_number_hash = dlv.licence_number_hash
               and r2.user_id <> r.user_id) as other_accounts
      from rider_verification_sessions s
      join riders r on r.id = s.rider_id
      join users u on u.id = s.user_id
      left join driving_licence_verifications dlv on dlv.session_id = s.id
      left join verification_photos p on p.session_id = s.id and p.deleted_at is null
     where s.state = $1
     order by s.created_at`,

  SHOP_LICENCE: `
    select sl.id, sl.licence_number, sl.issuing_authority, sl.issued_at, sl.expires_at,
           sl.status, sl.storage_key, sl.created_at,
           mu.id as merchant_user_id, mu.name as merchant_name, mu.phone as merchant_phone,
           coalesce(
             (select json_agg(json_build_object('id', s.id, 'name', s.name, 'city', s.city))
                from license_shops ls
                join shops s on s.id = ls.shop_id and s.deleted_at is null
               where ls.license_id = sl.id),
             '[]'::json
           ) as shops
      from shop_licenses sl
      join merchant_users mu on mu.id = sl.merchant_user_id
     where sl.status = $1 and sl.deleted_at is null
     order by sl.created_at`,
};

// The default status per type: shops and vehicles carry a verification_status,
// documents and licences a status, and the pending value differs for licences
// (which go PENDING -> ACTIVE, not PENDING -> VERIFIED).
const DEFAULT_PENDING = "PENDING";

// A verification session's "needs a human" state is not called PENDING, so the
// shared default would have returned an empty queue for it -- silently, which
// is the worst kind of empty queue.
const DEFAULT_STATUS: Partial<Record<VerifiableType, string>> = {
  RIDER_VERIFICATION: "MANUAL_REVIEW_REQUIRED",
};

// Switches on type rather than five near-identical endpoints with five
// near-identical services.
export async function listVerificationQueue(pool: Pool, type: VerifiableType, status?: string) {
  const { rows } = await pool.query(QUEUE_QUERIES[type], [
    status ?? DEFAULT_STATUS[type] ?? DEFAULT_PENDING,
  ]);
  return rows;
}

export class NoFileError extends Error {}

const FILE_TABLE: Partial<Record<VerifiableType, string>> = {
  VEHICLE_DOCUMENT: "vehicle_documents",
  MERCHANT_DOCUMENT: "merchant_documents",
  SHOP_LICENCE: "shop_licenses",
};

/**
 * The file behind a queue row, so the decision is made against the actual
 * paper rather than a row of metadata. SHOP and VEHICLE have no file of their
 * own — their evidence is their documents — so they are absent from
 * FILE_TABLE and asking for one is a 404, not an empty string.
 *
 * The table name comes from FILE_TABLE, never from the request, so the
 * interpolation below cannot be steered by a caller.
 */
export async function getVerificationStorageKey(
  pool: Pool,
  type: VerifiableType,
  id: string,
): Promise<string> {
  const table = FILE_TABLE[type];
  if (!table) throw new VerificationTargetNotFoundError(`${type} has no document of its own`);

  const { rows } = await pool.query(
    `select storage_key from ${table} where id = $1 and deleted_at is null`,
    [id],
  );
  if (rows.length === 0) throw new VerificationTargetNotFoundError(`${type} ${id} not found`);
  if (!rows[0].storage_key) throw new NoFileError(`${type} ${id} has no file attached`);
  return rows[0].storage_key;
}

export interface Decision {
  status: "VERIFIED" | "REJECTED";
  note?: string;
}

// A review updates verification status. Public search and booking read that status
// independently of the merchant's ACTIVE/INACTIVE listing switch.
async function decide(
  client: PoolClient,
  table: string,
  id: string,
  statusColumn: string,
  decision: Decision,
  entityType: string,
  adminId: string,
  hasVerifiedAt: boolean,
) {
  const { rows: beforeRows } = await client.query(
    `select ${statusColumn} from ${table} where id = $1`,
    [id],
  );
  if (beforeRows.length === 0) throw new VerificationTargetNotFoundError(`${entityType} ${id} not found`);
  const before = beforeRows[0][statusColumn];

  const verifiedAtSet = hasVerifiedAt ? `, verified_at = $2` : "";
  await client.query(
    `update ${table} set ${statusColumn} = $1${verifiedAtSet}, updated_at = now() where id = $${hasVerifiedAt ? 3 : 2}`,
    hasVerifiedAt
      ? [decision.status, decision.status === "VERIFIED" ? new Date() : null, id]
      : [decision.status, id],
  );

  await writeAudit(client, {
    actorType: "ADMIN",
    actorId: adminId,
    action: `${entityType}.verification_decided`,
    entityType,
    entityId: id,
    before: { status: before },
    after: { status: decision.status, note: decision.note ?? null },
  });
}

export async function decideShop(pool: Pool, adminId: string, shopId: string, decision: Decision) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await decide(client, "shops", shopId, "verification_status", decision, "shop", adminId, false);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function decideVehicle(pool: Pool, adminId: string, vehicleId: string, decision: Decision) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await decide(client, "vehicles", vehicleId, "verification_status", decision, "vehicle", adminId, false);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function decideVehicleDocument(pool: Pool, adminId: string, documentId: string, decision: Decision) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await decide(client, "vehicle_documents", documentId, "status", decision, "vehicle_document", adminId, true);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function decideMerchantDocument(pool: Pool, adminId: string, documentId: string, decision: Decision) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await decide(client, "merchant_documents", documentId, "status", decision, "merchant_document", adminId, false);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function decideShopLicence(
  pool: Pool,
  adminId: string,
  licenceId: string,
  decision: { status: "ACTIVE" | "REJECTED"; note?: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: beforeRows } = await client.query(`select status from shop_licenses where id = $1`, [licenceId]);
    if (beforeRows.length === 0) throw new VerificationTargetNotFoundError(`shop_licence ${licenceId} not found`);

    await client.query(`update shop_licenses set status = $1, updated_at = now() where id = $2`, [
      decision.status,
      licenceId,
    ]);

    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "shop_licence.verification_decided",
      entityType: "shop_licence",
      entityId: licenceId,
      before: { status: beforeRows[0].status },
      after: { status: decision.status, note: decision.note ?? null },
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The decision on a customer's driving licence.
 *
 * Deliberately NOT routed through `decide()` above. That helper writes a status
 * column straight onto a table, which is right for the five merchant-side
 * reviews; a verification session has a state machine, and an admin must not be
 * able to step outside it. So this goes through
 * `verificationStateMachine.transition`, which means an admin can only approve
 * a session sitting in MANUAL_REVIEW_REQUIRED -- never one whose document
 * failed, and never one still waiting on the vendor.
 */
export async function decideRiderVerification(
  pool: Pool,
  adminId: string,
  sessionId: string,
  decision: { status: "VERIFIED" | "REJECTED"; reason: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `select state from rider_verification_sessions where id = $1`,
      [sessionId],
    );
    if (rows.length === 0) {
      throw new VerificationTargetNotFoundError(`verification session ${sessionId} not found`);
    }
    if (rows[0].state !== "MANUAL_REVIEW_REQUIRED") {
      throw new NotReviewableError(
        `verification session ${sessionId} is ${rows[0].state}; only a session awaiting review can be decided`,
      );
    }

    await transition(client, {
      sessionId,
      to: decision.status,
      actorType: "ADMIN",
      actorId: adminId,
      eventType: decision.status === "VERIFIED" ? "approved_by_admin" : "rejected_by_admin",
      // An approval out of review is a human vouching, not new evidence, so
      // the assurance level is not raised by it.
      reviewRequired: false,
      rejectionCode: decision.status === "REJECTED" ? "REJECTED_ON_REVIEW" : null,
      metadata: { reason: decision.reason },
    });

    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "rider_verification.decided",
      entityType: "rider_verification_session",
      entityId: sessionId,
      before: { state: rows[0].state },
      after: { state: decision.status, reason: decision.reason },
    });
    await client.query("COMMIT");
    return { state: decision.status };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof IllegalTransitionError) {
      throw new NotReviewableError(err.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The photograph behind a queue row. Short-lived and generated per request,
 * never stored: a licence photograph behind a long-lived URL is a licence
 * photograph on the internet.
 */
export async function getRiderVerificationPhotoUrl(
  pool: Pool,
  sessionId: string,
): Promise<string> {
  const { rows } = await pool.query(
    `select storage_key from verification_photos
      where session_id = $1 and deleted_at is null
      order by created_at desc limit 1`,
    [sessionId],
  );
  if (rows.length === 0) throw new NoFileError(`verification session ${sessionId} has no photo`);
  return presignDownload(rows[0].storage_key, 300);
}

/** The full transition trail, for the admin deciding. Metadata is already masked. */
export async function getRiderVerificationEvents(pool: Pool, sessionId: string) {
  const { rows } = await pool.query(
    `select actor_type, actor_id, event_type, previous_state, next_state, metadata, created_at
       from rider_verification_events
      where session_id = $1
      order by created_at`,
    [sessionId],
  );
  return rows;
}
