import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";

export class LicenceNotFoundError extends Error {}
export class DocumentNotFoundError extends Error {}

export async function listLicences(pool: Pool, merchantUserId: string) {
  const { rows } = await pool.query(
    `select * from shop_licenses where merchant_user_id = $1 and deleted_at is null order by created_at desc`,
    [merchantUserId],
  );
  return rows;
}

export async function createLicence(
  pool: Pool,
  merchantUserId: string,
  input: { licenceNumber: string; issuingAuthority?: string; issuedAt?: string; expiresAt?: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `insert into shop_licenses (merchant_user_id, licence_number, issuing_authority, issued_at, expires_at, status)
       values ($1, $2, $3, $4, $5, 'PENDING') returning *`,
      [merchantUserId, input.licenceNumber, input.issuingAuthority ?? null, input.issuedAt ?? null, input.expiresAt ?? null],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "licence.created",
      entityType: "shop_licence",
      entityId: rows[0].id,
      after: { licenceNumber: input.licenceNumber },
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

async function requireOwnedLicence(pool: Pool, merchantUserId: string, licenceId: string) {
  const { rows } = await pool.query(
    `select * from shop_licenses where id = $1 and merchant_user_id = $2 and deleted_at is null`,
    [licenceId, merchantUserId],
  );
  if (rows.length === 0) throw new LicenceNotFoundError(`licence ${licenceId} not found`);
  return rows[0];
}

export async function attachLicenceFile(pool: Pool, merchantUserId: string, licenceId: string, storageKey: string) {
  await requireOwnedLicence(pool, merchantUserId, licenceId);
  const { rows } = await pool.query(
    `update shop_licenses set storage_key = $1, updated_at = now() where id = $2 returning *`,
    [storageKey, licenceId],
  );
  return rows[0];
}

export async function softDeleteLicence(pool: Pool, merchantUserId: string, licenceId: string) {
  await requireOwnedLicence(pool, merchantUserId, licenceId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`update shop_licenses set deleted_at = now(), updated_at = now() where id = $1`, [licenceId]);
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "licence.deleted",
      entityType: "shop_licence",
      entityId: licenceId,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function linkLicenceToShop(
  pool: Pool,
  merchantUserId: string,
  licenceId: string,
  input: { shopId: string; branchType?: string },
) {
  await requireOwnedLicence(pool, merchantUserId, licenceId);

  const { rows: shopRows } = await pool.query(
    `select id from shops where id = $1 and merchant_user_id = $2 and deleted_at is null`,
    [input.shopId, merchantUserId],
  );
  if (shopRows.length === 0) throw new LicenceNotFoundError(`shop ${input.shopId} not found for this merchant`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into license_shops (license_id, shop_id, branch_type) values ($1, $2, $3)
       on conflict (license_id, shop_id) do nothing`,
      [licenceId, input.shopId, input.branchType ?? null],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "licence.linked_to_shop",
      entityType: "shop_licence",
      entityId: licenceId,
      after: { shopId: input.shopId },
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function unlinkLicenceFromShop(pool: Pool, merchantUserId: string, licenceId: string, shopId: string) {
  await requireOwnedLicence(pool, merchantUserId, licenceId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`delete from license_shops where license_id = $1 and shop_id = $2`, [licenceId, shopId]);
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "licence.unlinked_from_shop",
      entityType: "shop_licence",
      entityId: licenceId,
      after: { shopId },
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listMerchantDocuments(pool: Pool, merchantUserId: string) {
  const { rows } = await pool.query(
    `select * from merchant_documents where merchant_user_id = $1 and deleted_at is null order by created_at desc`,
    [merchantUserId],
  );
  return rows;
}

export async function createMerchantDocument(
  pool: Pool,
  merchantUserId: string,
  input: { type: string; documentNumber?: string; issuedAt?: string; expiresAt?: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `insert into merchant_documents (merchant_user_id, type, document_number, issued_at, expires_at, status)
       values ($1, $2, $3, $4, $5, 'PENDING') returning *`,
      [merchantUserId, input.type, input.documentNumber ?? null, input.issuedAt ?? null, input.expiresAt ?? null],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "merchant_document.created",
      entityType: "merchant_document",
      entityId: rows[0].id,
      after: { type: input.type },
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

async function requireOwnedDocument(pool: Pool, merchantUserId: string, documentId: string) {
  const { rows } = await pool.query(
    `select * from merchant_documents where id = $1 and merchant_user_id = $2 and deleted_at is null`,
    [documentId, merchantUserId],
  );
  if (rows.length === 0) throw new DocumentNotFoundError(`document ${documentId} not found`);
  return rows[0];
}

export async function attachMerchantDocumentFile(pool: Pool, merchantUserId: string, documentId: string, storageKey: string) {
  await requireOwnedDocument(pool, merchantUserId, documentId);
  const { rows } = await pool.query(
    `update merchant_documents set storage_key = $1, updated_at = now() where id = $2 returning *`,
    [storageKey, documentId],
  );
  return rows[0];
}

export async function softDeleteMerchantDocument(pool: Pool, merchantUserId: string, documentId: string) {
  await requireOwnedDocument(pool, merchantUserId, documentId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`update merchant_documents set deleted_at = now(), updated_at = now() where id = $1`, [documentId]);
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "merchant_document.deleted",
      entityType: "merchant_document",
      entityId: documentId,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
