import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import type { AdminRole } from "../Auth/token.ts";

export class AdminNotFoundError extends Error {}
export class SelfModificationError extends Error {}
export class LastSuperAdminError extends Error {}
export class PhoneOrEmailTakenError extends Error {}

export async function listAdmins(pool: Pool) {
  const { rows } = await pool.query(
    `select id, phone, email, name, role, status, created_at, updated_at
       from admins where deleted_at is null order by created_at`,
  );
  return rows;
}

export async function createAdmin(
  pool: Pool,
  actorId: string,
  input: { phone: string; name: string; email?: string; role: AdminRole },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `insert into admins (phone, name, email, role) values ($1, $2, $3, $4) returning *`,
      [input.phone, input.name, input.email ?? null, input.role],
    );
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId,
      action: "admin.created",
      entityType: "admin",
      entityId: rows[0].id,
      after: { phone: input.phone, role: input.role },
    });
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    if (isUniqueViolation(err)) {
      throw new PhoneOrEmailTakenError("this phone or email is already in use by an admin");
    }
    throw err;
  } finally {
    client.release();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

async function activeSuperAdminCount(client: PoolClient, excludeAdminId?: string): Promise<number> {
  const { rows } = await client.query(
    `select count(*)::int as n from admins
      where role = 'SUPER_ADMIN' and status = 'ACTIVE' and deleted_at is null
        and id <> coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
    [excludeAdminId ?? null],
  );
  return rows[0].n;
}

export async function updateAdmin(
  pool: Pool,
  actorId: string,
  adminId: string,
  input: { role?: AdminRole; status?: "ACTIVE" | "SUSPENDED" | "INACTIVE" },
) {
  // A SUPER_ADMIN demoting or deleting themselves can lock the whole platform out.
  if (adminId === actorId) {
    throw new SelfModificationError("admins cannot change their own role or status");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: beforeRows } = await client.query(
      `select * from admins where id = $1 and deleted_at is null`,
      [adminId],
    );
    const before = beforeRows[0];
    if (!before) throw new AdminNotFoundError(`admin ${adminId} not found`);

    const demotedAway = input.role !== undefined && input.role !== "SUPER_ADMIN";
    const deactivated = input.status === "SUSPENDED" || input.status === "INACTIVE";
    const wouldLeaveNoSuperAdmin = before.role === "SUPER_ADMIN" && (demotedAway || deactivated);
    if (wouldLeaveNoSuperAdmin) {
      const remaining = await activeSuperAdminCount(client, adminId);
      if (remaining === 0) throw new LastSuperAdminError("platform must keep at least one active super admin");
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    if (input.role !== undefined) {
      values.push(input.role);
      sets.push(`role = $${values.length}`);
    }
    if (input.status !== undefined) {
      values.push(input.status);
      sets.push(`status = $${values.length}`);
    }
    values.push(adminId);

    const { rows } = await client.query(
      `update admins set ${sets.join(", ")}, updated_at = now() where id = $${values.length} returning *`,
      values,
    );

    // Suspending/deactivating must kill live sessions, not just block new logins.
    if (input.status === "SUSPENDED" || input.status === "INACTIVE") {
      await client.query(
        `update admin_sessions set revoked_at = now() where admin_id = $1 and revoked_at is null`,
        [adminId],
      );
    }

    await writeAudit(client, {
      actorType: "ADMIN",
      actorId,
      action: "admin.updated",
      entityType: "admin",
      entityId: adminId,
      before: { role: before.role, status: before.status },
      after: { role: rows[0].role, status: rows[0].status },
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

export async function softDeleteAdmin(pool: Pool, actorId: string, adminId: string) {
  if (adminId === actorId) {
    throw new SelfModificationError("admins cannot delete themselves");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `select role from admins where id = $1 and deleted_at is null`,
      [adminId],
    );
    const admin = rows[0];
    if (!admin) throw new AdminNotFoundError(`admin ${adminId} not found`);

    if (admin.role === "SUPER_ADMIN") {
      const remaining = await activeSuperAdminCount(client, adminId);
      if (remaining === 0) throw new LastSuperAdminError("platform must keep at least one active super admin");
    }

    await client.query(`update admins set deleted_at = now(), updated_at = now() where id = $1`, [adminId]);
    await client.query(
      `update admin_sessions set revoked_at = now() where admin_id = $1 and revoked_at is null`,
      [adminId],
    );

    await writeAudit(client, {
      actorType: "ADMIN",
      actorId,
      action: "admin.deleted",
      entityType: "admin",
      entityId: adminId,
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
