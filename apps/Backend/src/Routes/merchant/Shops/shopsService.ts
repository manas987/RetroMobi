import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import { assertOwnUpload, storedContentType } from "../../../lib/storage.ts";

export class ShopNotFoundError extends Error {}
export class ShopHasActiveBookingsError extends Error {}
export class ShopOtherStateError extends Error {}
export class NoFileError extends Error {}

export interface CreateShopInput {
  name: string;
  phone?: string;
  email?: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  gstin?: string;
  landmark?: string;
}

export interface UpdateShopInput {
  name?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  gstin?: string;
  landmark?: string;
  status?: "OPEN" | "CLOSED";
}

/** A merchant's shops must all be in one state for now: one transport licence and one GSTIN per state, and billing is single-state. */
async function assertSameState(db: Pick<Pool, "query">, merchantUserId: string, state: string, exceptShopId?: string) {
  const { rows } = await db.query(
    `select 1 from shops
      where merchant_user_id = $1 and deleted_at is null
        and ($3::uuid is null or id <> $3)
        and lower(btrim(state)) <> lower(btrim($2)) limit 1`,
    [merchantUserId, state, exceptShopId ?? null],
  );
  if (rows.length > 0) throw new ShopOtherStateError("shops in another state are not supported yet");
}

// Joined on shop_members, not shops.merchant_user_id, so a MANAGER or STAFF
// member sees shops they were invited to, not just ones they created.
export async function listShops(pool: Pool, merchantUserId: string) {
  const { rows } = await pool.query(
    `select s.*, m.role
       from shops s
       join shop_members m on m.shop_id = s.id
      where m.merchant_user_id = $1 and m.status = 'ACTIVE'
        and m.deleted_at is null and s.deleted_at is null
      order by s.created_at desc`,
    [merchantUserId],
  );
  return rows;
}

export async function getShop(pool: Pool, shopId: string) {
  const { rows } = await pool.query(
    `select s.*,
            coalesce(
              (select json_agg(json_build_object(
                 'dayOfWeek', h.day_of_week, 'opensAt', h.opens_at, 'closesAt', h.closes_at
               ) order by h.day_of_week)
               from shop_hours h where h.shop_id = s.id),
              '[]'
            ) as hours
       from shops s
      where s.id = $1 and s.deleted_at is null`,
    [shopId],
  );
  if (rows.length === 0) throw new ShopNotFoundError(`shop ${shopId} not found`);
  return rows[0];
}

export async function createShop(pool: Pool, merchantUserId: string, input: CreateShopInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertSameState(client, merchantUserId, input.state);

    const { rows } = await client.query(
      `insert into shops (merchant_user_id, name, phone, email, address_line1, city, state, pincode,
                           latitude, longitude, gstin, landmark)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning *`,
      [
        merchantUserId,
        input.name,
        input.phone ?? null,
        input.email ?? null,
        input.addressLine1,
        input.city,
        input.state,
        input.pincode,
        input.latitude ?? null,
        input.longitude ?? null,
        input.gstin ?? null,
        input.landmark ?? null,
      ],
    );
    const shop = rows[0];

    // requirePermission only ever reads shop_members, so without this the
    // creator could not see or manage the shop they just made.
    await client.query(
      `insert into shop_members (merchant_user_id, shop_id, role) values ($1, $2, 'OWNER')`,
      [merchantUserId, shop.id],
    );

    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "shop.created",
      entityType: "shop",
      entityId: shop.id,
      after: { name: shop.name, city: shop.city },
    });

    await client.query("COMMIT");
    return shop;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const UPDATABLE_COLUMNS = [
  "name",
  "phone",
  "email",
  "address_line1",
  "city",
  "state",
  "pincode",
  "latitude",
  "longitude",
  "gstin",
  "landmark",
  "status",
] as const;

const COLUMN_BY_KEY: Record<string, string> = {
  name: "name",
  phone: "phone",
  email: "email",
  addressLine1: "address_line1",
  city: "city",
  state: "state",
  pincode: "pincode",
  latitude: "latitude",
  longitude: "longitude",
  gstin: "gstin",
  landmark: "landmark",
  status: "status",
};

export async function updateShop(
  pool: Pool,
  merchantUserId: string,
  shopId: string,
  input: UpdateShopInput,
) {
  const before = await getShop(pool, shopId);
  if (input.state !== undefined) await assertSameState(pool, before.merchant_user_id, input.state, shopId);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    const column = COLUMN_BY_KEY[key];
    if (!column || !UPDATABLE_COLUMNS.includes(column as any) || value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length === 0) return before;

  values.push(shopId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `update shops set ${sets.join(", ")}, updated_at = now()
        where id = $${values.length} and deleted_at is null
        returning *`,
      values,
    );
    if (rows.length === 0) throw new ShopNotFoundError(`shop ${shopId} not found`);

    const after: Record<string, unknown> = {};
    const beforeChanged: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      const column = COLUMN_BY_KEY[key];
      if (column) {
        after[key] = rows[0][column];
        beforeChanged[key] = before[column];
      }
    }
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "shop.updated",
      entityType: "shop",
      entityId: shopId,
      before: beforeChanged,
      after,
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

export async function softDeleteShop(pool: Pool, merchantUserId: string, shopId: string) {
  const { rows: activeBookings } = await pool.query(
    `select 1 from bookings b
       join vehicles v on v.id = b.vehicle_id
      where v.shop_id = $1 and b.status in ('HOLD', 'CONFIRMED') and b.deleted_at is null
      limit 1`,
    [shopId],
  );
  if (activeBookings.length > 0) {
    throw new ShopHasActiveBookingsError("shop has active bookings and cannot be deleted");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `update shops set deleted_at = now(), updated_at = now() where id = $1 and deleted_at is null`,
      [shopId],
    );
    if (!rowCount) throw new ShopNotFoundError(`shop ${shopId} not found`);
    await client.query(
      `update vehicles set deleted_at = now(), updated_at = now() where shop_id = $1 and deleted_at is null`,
      [shopId],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "shop.deleted",
      entityType: "shop",
      entityId: shopId,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function submitForVerification(pool: Pool, merchantUserId: string, shopId: string) {
  const { rows } = await pool.query(
    `update shops set verification_status = 'PENDING', updated_at = now()
      where id = $1 and deleted_at is null and verification_status in ('UNVERIFIED', 'REJECTED')
      returning verification_status`,
    [shopId],
  );
  if (rows.length === 0) throw new ShopNotFoundError(`shop ${shopId} not found or not eligible`);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "shop.submitted_for_checking",
    entityType: "shop",
    entityId: shopId,
  });
  return rows[0];
}

export async function setShopHours(
  pool: Pool,
  merchantUserId: string,
  shopId: string,
  hours: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`delete from shop_hours where shop_id = $1`, [shopId]);
    for (const h of hours) {
      await client.query(
        `insert into shop_hours (shop_id, day_of_week, opens_at, closes_at) values ($1, $2, $3, $4)`,
        [shopId, h.dayOfWeek, h.opensAt, h.closesAt],
      );
    }
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "shop.hours_updated",
      entityType: "shop",
      entityId: shopId,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getShop(pool, shopId);
}

/**
 * A shop's reviews as its own staff see them. Reviewer names follow the same
 * rule as the public page: a deleted account's name is not shown.
 */
export async function listShopReviews(pool: Pool, shopId: string) {
  const { rows } = await pool.query(
    `select r.id, r.rating, r.comment, r.created_at,
            case when u.status <> 'DELETED' then u.name end as reviewer_name,
            v.registration_number, m.make, m.model
       from reviews r
       join users u on u.id = r.user_id
       join vehicles v on v.id = r.vehicle_id
       join vehicle_models m on m.id = v.model_id
      where r.shop_id = $1 and r.deleted_at is null
      order by r.created_at desc
      limit 50`,
    [shopId],
  );
  const { rows: shopRows } = await pool.query(`select rating, review_count from shops where id = $1`, [shopId]);
  return {
    rating: shopRows[0]?.rating == null ? null : Number(shopRows[0].rating),
    reviewCount: Number(shopRows[0]?.review_count ?? 0),
    reviews: rows,
  };
}

// Shop photos. Mirrors the vehicle media functions in Fleet/fleetService.ts.

export async function listShopMedia(pool: Pool, shopId: string) {
  const { rows } = await pool.query(
    `select * from shop_media where shop_id = $1 and deleted_at is null order by display_order, created_at`,
    [shopId],
  );
  return rows;
}

export async function addShopMedia(
  pool: Pool,
  merchantUserId: string,
  shopId: string,
  input: { storageKey: string; displayOrder?: number },
) {
  assertOwnUpload(input.storageKey, `shops/${shopId.toLowerCase()}/media/`);
  const { rows } = await pool.query(
    `insert into shop_media (shop_id, storage_key, display_order) values ($1, $2, $3) returning *`,
    [shopId, input.storageKey, input.displayOrder ?? 0],
  );
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "shop.photo_added",
    entityType: "shop",
    entityId: shopId,
  });
  return rows[0];
}

export async function reorderShopMedia(pool: Pool, shopId: string, order: Array<{ id: string; displayOrder: number }>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of order) {
      await client.query(`update shop_media set display_order = $1 where id = $2 and shop_id = $3`, [item.displayOrder, item.id, shopId]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function softDeleteShopMedia(pool: Pool, merchantUserId: string, shopId: string, mediaId: string) {
  const { rowCount } = await pool.query(
    `update shop_media set deleted_at = now() where id = $1 and shop_id = $2 and deleted_at is null`,
    [mediaId, shopId],
  );
  if (!rowCount) throw new ShopNotFoundError(`photo ${mediaId} not found at this shop`);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "shop.photo_removed",
    entityType: "shop",
    entityId: shopId,
  });
}

export async function getShopMediaStorageKey(pool: Pool, shopId: string, mediaId: string): Promise<string> {
  const { rows } = await pool.query(
    `select storage_key from shop_media where id = $1 and shop_id = $2 and deleted_at is null`,
    [mediaId, shopId],
  );
  if (rows.length === 0) throw new ShopNotFoundError(`photo ${mediaId} not found at this shop`);
  return rows[0].storage_key;
}

/** False when the stored object isn't a real image: shop photos are shown publicly. */
export async function setShopMediaPublication(pool: Pool, shopId: string, mediaId: string, published: boolean, merchantUserId: string) {
  if (published) {
    const key = await getShopMediaStorageKey(pool, shopId, mediaId);
    const prefix = `shops/${shopId}/media/`;
    if (!key.startsWith(prefix) || !/^(?:\d{13}|[0-9a-f-]{36})$/.test(key.slice(prefix.length))) return false;
    const contentType = await storedContentType(key);
    if (!contentType || !/^image\/(jpeg|png|webp|avif|gif)$/.test(contentType)) return false;
  }
  const { rowCount } = await pool.query(
    `update shop_media set published = $3 where id = $1 and shop_id = $2 and deleted_at is null`,
    [mediaId, shopId, published],
  );
  if (!rowCount) throw new ShopNotFoundError(`photo ${mediaId} not found at this shop`);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "shop.photo_visibility",
    entityType: "shop",
    entityId: shopId,
    after: { published },
  });
  return true;
}

// Per-shop papers (Shop Act / trade licence, premises proof, landlord NOC).
// Mirrors the vehicle document functions in Fleet/fleetService.ts.

export type ShopDocType = "SHOP_ACT" | "PREMISES" | "LANDLORD_NOC";

export async function listShopDocuments(pool: Pool, shopId: string) {
  const { rows } = await pool.query(
    `select * from shop_documents where shop_id = $1 and deleted_at is null order by created_at desc`,
    [shopId],
  );
  return rows;
}

export async function createShopDocument(
  pool: Pool,
  merchantUserId: string,
  shopId: string,
  input: { type: ShopDocType; documentNumber?: string; issuedAt?: string; expiresAt?: string },
) {
  const { rows } = await pool.query(
    `insert into shop_documents (shop_id, type, document_number, issued_at, expires_at, status)
     values ($1, $2, $3, $4, $5, 'PENDING') returning *`,
    [shopId, input.type, input.documentNumber ?? null, input.issuedAt ?? null, input.expiresAt ?? null],
  );
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "shop.document_added",
    entityType: "shop",
    entityId: shopId,
    after: { type: input.type },
  });
  return rows[0];
}

async function requireShopDocument(pool: Pool, shopId: string, documentId: string) {
  const { rows } = await pool.query(
    `select * from shop_documents where id = $1 and shop_id = $2 and deleted_at is null`,
    [documentId, shopId],
  );
  if (rows.length === 0) throw new ShopNotFoundError(`document ${documentId} not found at this shop`);
  return rows[0];
}

export async function attachShopDocumentFile(pool: Pool, merchantUserId: string, shopId: string, documentId: string, storageKey: string) {
  // Pinned to the shop in the URL: requirePermission only vouches for that shop.
  assertOwnUpload(storageKey, `shops/${shopId}/documents/${documentId}/`);
  // A new file is checked again, so it goes back to PENDING.
  const { rows } = await pool.query(
    `update shop_documents set storage_key = $1, status = 'PENDING', updated_at = now()
      where id = $2 and shop_id = $3 and deleted_at is null returning *`,
    [storageKey, documentId, shopId],
  );
  if (rows.length === 0) throw new ShopNotFoundError(`document ${documentId} not found`);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "shop.document_uploaded",
    entityType: "shop_document",
    entityId: documentId,
    after: { type: rows[0].type },
  });
  return rows[0];
}

export async function getShopDocumentStorageKey(pool: Pool, shopId: string, documentId: string): Promise<string> {
  const doc = await requireShopDocument(pool, shopId, documentId);
  if (!doc.storage_key) throw new NoFileError(`document ${documentId} has no file attached`);
  return doc.storage_key;
}

export async function softDeleteShopDocument(pool: Pool, merchantUserId: string, shopId: string, documentId: string) {
  const doc = await requireShopDocument(pool, shopId, documentId);
  await pool.query(`update shop_documents set deleted_at = now(), updated_at = now() where id = $1`, [documentId]);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantUserId,
    action: "shop.document_removed",
    entityType: "shop",
    entityId: shopId,
    after: { type: doc.type },
  });
}
