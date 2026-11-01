import type { Pool } from "pg";

export class MerchantNotFoundError extends Error {}

export interface Paging {
  page?: number;
  limit?: number;
}

function pagingClause(paging: Paging, values: unknown[]): string {
  const limit = Math.min(paging.limit ?? 25, 100);
  const page = Math.max(paging.page ?? 1, 1);
  const offset = (page - 1) * limit;
  values.push(limit, offset);
  return `limit $${values.length - 1} offset $${values.length}`;
}

export async function listMerchants(pool: Pool, filters: Paging & { q?: string }) {
  const conditions: string[] = ["deleted_at is null"];
  const values: unknown[] = [];
  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`(name ilike $${values.length} or phone ilike $${values.length})`);
  }
  const limitClause = pagingClause(filters, values);
  const { rows } = await pool.query(
    `select id, phone, email, name, status, created_at
       from merchant_users where ${conditions.join(" and ")} order by created_at desc ${limitClause}`,
    values,
  );
  return rows;
}

export async function getMerchant(pool: Pool, merchantUserId: string) {
  const { rows } = await pool.query(
    `select id, phone, email, name, status, created_at from merchant_users where id = $1 and deleted_at is null`,
    [merchantUserId],
  );
  if (rows.length === 0) throw new MerchantNotFoundError(`merchant ${merchantUserId} not found`);

  const { rows: shops } = await pool.query(
    `select id, name, city, verification_status from shops where merchant_user_id = $1 and deleted_at is null`,
    [merchantUserId],
  );
  return { ...rows[0], shops };
}

/**
 * Admin-facing licence list. It exists because the only other place a licence
 * id surfaced was `GET /verification/queue?type=SHOP_LICENCE`, which is
 * `status = 'PENDING'` only — so approving a licence made its id vanish from
 * the API, and nothing could then link a vehicle to it.
 *
 * Joins the holder and the branches the licence covers, because a bare
 * licence number is not enough to pick the right one.
 */
export async function listLicences(
  pool: Pool,
  filters: Paging & { q?: string; status?: string },
) {
  const conditions: string[] = ["sl.deleted_at is null"];
  const values: unknown[] = [];
  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`(sl.licence_number ilike $${values.length} or mu.name ilike $${values.length})`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`sl.status = $${values.length}`);
  }
  const limitClause = pagingClause(filters, values);
  const { rows } = await pool.query(
    `select sl.id, sl.licence_number, sl.issuing_authority, sl.issued_at, sl.expires_at,
            sl.status, sl.storage_key, sl.created_at,
            sl.merchant_user_id, mu.name as merchant_name, mu.phone as merchant_phone,
            coalesce(
              (select json_agg(json_build_object('id', s.id, 'name', s.name, 'city', s.city))
                 from license_shops ls
                 join shops s on s.id = ls.shop_id and s.deleted_at is null
                where ls.license_id = sl.id),
              '[]'::json
            ) as shops,
            (select count(*) from license_vehicles lv
              where lv.license_id = sl.id and lv.removed_at is null) as vehicle_count
       from shop_licenses sl
       join merchant_users mu on mu.id = sl.merchant_user_id
      where ${conditions.join(" and ")}
      order by sl.created_at desc ${limitClause}`,
    values,
  );
  return rows;
}

export async function listAllShops(pool: Pool, filters: Paging & { city?: string; verificationStatus?: string }) {
  const conditions: string[] = ["deleted_at is null"];
  const values: unknown[] = [];
  if (filters.city) {
    values.push(filters.city);
    conditions.push(`lower(city) = lower($${values.length})`);
  }
  if (filters.verificationStatus) {
    values.push(filters.verificationStatus);
    conditions.push(`verification_status = $${values.length}`);
  }
  const limitClause = pagingClause(filters, values);
  const { rows } = await pool.query(
    `select * from shops where ${conditions.join(" and ")} order by created_at desc ${limitClause}`,
    values,
  );
  return rows;
}

export async function listAllVehicles(pool: Pool, filters: Paging & { shopId?: string; status?: string }) {
  const conditions: string[] = ["deleted_at is null"];
  const values: unknown[] = [];
  if (filters.shopId) {
    values.push(filters.shopId);
    conditions.push(`shop_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  const limitClause = pagingClause(filters, values);
  const { rows } = await pool.query(
    `select * from vehicles where ${conditions.join(" and ")} order by created_at desc ${limitClause}`,
    values,
  );
  return rows;
}

export async function listAllBookings(pool: Pool, filters: Paging & { status?: string; from?: Date; to?: Date }) {
  const conditions: string[] = ["deleted_at is null"];
  const values: unknown[] = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`scheduled_pickup_at >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`scheduled_pickup_at <= $${values.length}`);
  }
  const limitClause = pagingClause(filters, values);
  // Joined so an admin row names the scooter, the shop and the renter instead
  // of three UUIDs. Every join is LEFT except the vehicle's: a booking always
  // has a vehicle, but `group_id`/`rider_id` are null for walk-ins and
  // `walkin_*` null for online bookings.
  const { rows } = await pool.query(
    `select b.*,
            v.registration_number, m.make, m.model,
            s.id as shop_id, s.name as shop_name, s.city as shop_city,
            r.name as rider_name,
            u.name as customer_name, u.phone as customer_phone
       from bookings b
       join vehicles v on v.id = b.vehicle_id
       join vehicle_models m on m.id = v.model_id
       join shops s on s.id = v.shop_id
       left join riders r on r.id = b.rider_id
       left join booking_groups g on g.id = b.group_id
       left join users u on u.id = g.user_id
      where ${conditions.map((c) => `b.${c}`).join(" and ")}
      order by b.created_at desc ${limitClause}`,
    values,
  );
  return rows;
}

export async function listAllPayments(pool: Pool, filters: Paging & { status?: string; from?: Date; to?: Date }) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`created_at >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`created_at <= $${values.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const limitClause = pagingClause(filters, values);
  const { rows } = await pool.query(
    `select * from payments ${where} order by created_at desc ${limitClause}`,
    values,
  );
  return rows;
}

export async function listAllPayouts(pool: Pool, filters: Paging & { status?: string; stage?: string }) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.stage) {
    values.push(filters.stage);
    conditions.push(`stage = $${values.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const limitClause = pagingClause(filters, values);
  const { rows } = await pool.query(
    `select * from payouts ${where} order by created_at desc ${limitClause}`,
    values,
  );
  return rows;
}

// Must use the existing indexes -- filter on (entity_type, entity_id) or
// (actor_type, actor_id) or fall back to created_at desc. No unfiltered scan.
export async function listAuditLogs(
  pool: Pool,
  filters: Paging & { actorType?: string; actorId?: string; entityType?: string; entityId?: string },
) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.entityType) {
    values.push(filters.entityType);
    conditions.push(`entity_type = $${values.length}`);
  }
  if (filters.entityId) {
    values.push(filters.entityId);
    conditions.push(`entity_id = $${values.length}`);
  }
  if (filters.actorType) {
    values.push(filters.actorType);
    conditions.push(`actor_type = $${values.length}`);
  }
  if (filters.actorId) {
    values.push(filters.actorId);
    conditions.push(`actor_id = $${values.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const limitClause = pagingClause(filters, values);
  const { rows } = await pool.query(
    `select * from audit_logs ${where} order by created_at desc ${limitClause}`,
    values,
  );
  return rows;
}
