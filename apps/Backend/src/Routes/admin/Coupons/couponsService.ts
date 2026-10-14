import type { Pool } from "pg";
import { writeAudit } from "../../../lib/audit.ts";

export class CouponNotFoundError extends Error {}
export class CouponCodeTakenError extends Error {}
export class CouponInUseError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function listCoupons(pool: Pool, filters: { status?: string }) {
  const conditions: string[] = ["deleted_at is null"];
  const values: unknown[] = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  const { rows } = await pool.query(
    `select * from coupons where ${conditions.join(" and ")} order by created_at desc`,
    values,
  );
  return rows;
}

export async function createCoupon(
  pool: Pool,
  adminId: string,
  input: { code: string; type: "PERCENT" | "FLAT"; value: number; validFrom: Date; validUntil: Date; maxUses?: number },
) {
  const code = input.code.toUpperCase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let rows;
    try {
      ({ rows } = await client.query(
        `insert into coupons (code, type, value, valid_from, valid_until, max_uses)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [code, input.type, input.value, input.validFrom, input.validUntil, input.maxUses ?? null],
      ));
    } catch (err) {
      if (isUniqueViolation(err)) throw new CouponCodeTakenError(`coupon code ${code} already exists`);
      throw err;
    }
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "coupon.created",
      entityType: "coupon",
      entityId: rows[0].id,
      after: { code, type: input.type, value: input.value },
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

export async function setCouponStatus(pool: Pool, adminId: string, couponId: string, status: "ACTIVE" | "PAUSED") {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: beforeRows } = await client.query(
      `select status from coupons where id = $1 and deleted_at is null`,
      [couponId],
    );
    if (beforeRows.length === 0) throw new CouponNotFoundError(`coupon ${couponId} not found`);

    const { rows } = await client.query(`update coupons set status = $1 where id = $2 returning *`, [
      status,
      couponId,
    ]);

    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "coupon.status_updated",
      entityType: "coupon",
      entityId: couponId,
      before: { status: beforeRows[0].status },
      after: { status },
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

export async function softDeleteCoupon(pool: Pool, adminId: string, couponId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `update coupons set deleted_at = now() where id = $1 and deleted_at is null`,
      [couponId],
    );
    if (!rowCount) throw new CouponNotFoundError(`coupon ${couponId} not found`);
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "coupon.soft_deleted",
      entityType: "coupon",
      entityId: couponId,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// booking_groups.coupon_id is ON DELETE SET NULL, so a hard delete silently
// detaches the coupon from every booking that used it -- refused once used.
export async function hardDeleteCoupon(pool: Pool, adminId: string, couponId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`select * from coupons where id = $1`, [couponId]);
    const coupon = rows[0];
    if (!coupon) throw new CouponNotFoundError(`coupon ${couponId} not found`);
    if (coupon.used_count > 0) {
      throw new CouponInUseError("coupon has been used and cannot be hard-deleted, soft-delete instead");
    }

    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "coupon.hard_deleted",
      entityType: "coupon",
      entityId: couponId,
      before: coupon,
    });

    await client.query(`delete from coupons where id = $1`, [couponId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
