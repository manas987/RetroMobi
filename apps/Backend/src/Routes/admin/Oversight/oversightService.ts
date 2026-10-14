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
  const { rows } = await pool.query(
    `select * from bookings where ${conditions.join(" and ")} order by created_at desc ${limitClause}`,
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
