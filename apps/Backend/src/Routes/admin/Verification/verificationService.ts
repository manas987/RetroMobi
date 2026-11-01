import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";

export class VerificationTargetNotFoundError extends Error {}

export type VerifiableType = "SHOP" | "VEHICLE" | "VEHICLE_DOCUMENT" | "MERCHANT_DOCUMENT" | "SHOP_LICENCE";

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

// Switches on type rather than five near-identical endpoints with five
// near-identical services.
export async function listVerificationQueue(pool: Pool, type: VerifiableType, status?: string) {
  const { rows } = await pool.query(QUEUE_QUERIES[type], [status ?? DEFAULT_PENDING]);
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

// Verification is never a gate: approving or rejecting must not change
// vehicles.status, must not soft-delete anything, and must not touch
// bookability. The badge is a trust signal; a rejected shop stays searchable.
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
