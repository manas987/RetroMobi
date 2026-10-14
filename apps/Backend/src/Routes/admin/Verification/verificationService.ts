import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";

export class VerificationTargetNotFoundError extends Error {}

export type VerifiableType = "SHOP" | "VEHICLE" | "VEHICLE_DOCUMENT" | "MERCHANT_DOCUMENT" | "SHOP_LICENCE";

const QUEUE_QUERIES: Record<VerifiableType, string> = {
  SHOP: `select id, name, city, created_at from shops where verification_status = 'PENDING' and deleted_at is null order by created_at`,
  VEHICLE: `select id, registration_number, created_at from vehicles where verification_status = 'PENDING' and deleted_at is null order by created_at`,
  VEHICLE_DOCUMENT: `select id, vehicle_id, type, created_at from vehicle_documents where status = 'PENDING' and deleted_at is null order by created_at`,
  MERCHANT_DOCUMENT: `select id, merchant_user_id, type, created_at from merchant_documents where status = 'PENDING' and deleted_at is null order by created_at`,
  SHOP_LICENCE: `select id, merchant_user_id, licence_number, created_at from shop_licenses where status = 'PENDING' and deleted_at is null order by created_at`,
};

// Switches on type rather than five near-identical endpoints with five
// near-identical services.
export async function listVerificationQueue(pool: Pool, type: VerifiableType) {
  const { rows } = await pool.query(QUEUE_QUERIES[type]);
  return rows;
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
