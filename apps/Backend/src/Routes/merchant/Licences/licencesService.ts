import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import { assertOwnUpload } from "../../../lib/storage.ts";

export class LicenceNotFoundError extends Error {}
export class DocumentNotFoundError extends Error {}

/**
 * The `shops` aggregate is why this is not a plain `select *`: without it the
 * merchant portal had no way to read a licence's branch links back, so the
 * UI could only offer attach and detach blindly and say it did not know which
 * was in effect — the POST is `on conflict do nothing`, so even a 204 proved
 * nothing. Only non-deleted branches are counted, since a soft-deleted shop
 * leaves its `license_shops` row behind.
 */
export async function listLicences(pool: Pool, merchantUserId: string) {
  const { rows } = await pool.query(
    `select sl.*,
            coalesce(
              (select json_agg(json_build_object('id', s.id, 'name', s.name, 'city', s.city))
                 from license_shops ls
                 join shops s on s.id = ls.shop_id and s.deleted_at is null
                where ls.license_id = sl.id),
              '[]'::json
            ) as shops
       from shop_licenses sl
      where sl.merchant_user_id = $1 and sl.deleted_at is null
      order by sl.created_at desc`,
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

export class NoFileError extends Error {}

/** Ownership is re-checked here, not just at upload — a presigned GET is a
 *  readable copy of the file, so it must never be handed out on a licence the
 *  caller does not hold. */
export async function getLicenceStorageKey(pool: Pool, merchantUserId: string, licenceId: string): Promise<string> {
  const licence = await requireOwnedLicence(pool, merchantUserId, licenceId);
  if (!licence.storage_key) throw new NoFileError(`licence ${licenceId} has no file attached`);
  return licence.storage_key;
}

export async function attachLicenceFile(pool: Pool, merchantUserId: string, licenceId: string, storageKey: string) {
  await requireOwnedLicence(pool, merchantUserId, licenceId);
  assertOwnUpload(storageKey, `licences/${licenceId}/`);
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
  assertOwnUpload(storageKey, `merchant-documents/${documentId}/`);
  const { rows } = await pool.query(
    `update merchant_documents set storage_key = $1, updated_at = now() where id = $2 returning *`,
    [storageKey, documentId],
  );
  return rows[0];
}

export async function getMerchantDocumentStorageKey(
  pool: Pool,
  merchantUserId: string,
  documentId: string,
): Promise<string> {
  const doc = await requireOwnedDocument(pool, merchantUserId, documentId);
  if (!doc.storage_key) throw new NoFileError(`document ${documentId} has no file attached`);
  return doc.storage_key;
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
