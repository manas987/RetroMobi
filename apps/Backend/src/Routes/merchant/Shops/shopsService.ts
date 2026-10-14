import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";

export class ShopNotFoundError extends Error {}
export class ShopHasActiveBookingsError extends Error {}

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
  status?: "OPEN" | "CLOSED";
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

    const { rows } = await client.query(
      `insert into shops (merchant_user_id, name, phone, email, address_line1, city, state, pincode,
                           latitude, longitude, gstin)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
  status: "status",
};

export async function updateShop(
  pool: Pool,
  merchantUserId: string,
  shopId: string,
  input: UpdateShopInput,
) {
  const before = await getShop(pool, shopId);

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
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getShop(pool, shopId);
}
