import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import type { ShopRole } from "../../../lib/permissions.ts";

export class MemberNotFoundError extends Error {}
export class InviteNotFoundError extends Error {}
export class LastOwnerError extends Error {}

export async function listMembers(pool: Pool, shopId: string) {
  const { rows } = await pool.query(
    `select m.id, m.merchant_user_id, m.role, m.status, m.created_at, u.name, u.phone, u.email
       from shop_members m
       join merchant_users u on u.id = m.merchant_user_id
      where m.shop_id = $1 and m.deleted_at is null
      order by m.created_at`,
    [shopId],
  );
  return rows;
}

export async function listInvites(pool: Pool, shopId: string) {
  const { rows } = await pool.query(
    `select * from shop_join_requests where shop_id = $1 and status = 'PENDING' order by created_at desc`,
    [shopId],
  );
  return rows;
}

export async function inviteMember(
  pool: Pool,
  merchantUserId: string,
  shopId: string,
  input: { phone: string; role: ShopRole },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `insert into shop_join_requests (shop_id, requested_by, requested_to, role)
       values ($1, $2, $3, $4) returning *`,
      [shopId, merchantUserId, input.phone, input.role],
    );
    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "shop.member_invited",
      entityType: "shop",
      entityId: shopId,
      after: { phone: input.phone, role: input.role },
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

export async function listMyInvites(pool: Pool, merchantUserId: string) {
  const { rows } = await pool.query(
    `select r.*, s.name as shop_name
       from shop_join_requests r
       join shops s on s.id = r.shop_id
       join merchant_users u on u.phone = r.requested_to
      where u.id = $1 and r.status = 'PENDING'
      order by r.created_at desc`,
    [merchantUserId],
  );
  return rows;
}

export async function respondToInvite(
  pool: Pool,
  merchantUserId: string,
  inviteId: string,
  accept: boolean,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `select r.* from shop_join_requests r
         join merchant_users u on u.phone = r.requested_to
        where r.id = $1 and u.id = $2 and r.status = 'PENDING'`,
      [inviteId, merchantUserId],
    );
    const invite = rows[0];
    if (!invite) throw new InviteNotFoundError(`invite ${inviteId} not found`);

    await client.query(
      `update shop_join_requests set status = $1, responded_at = now() where id = $2`,
      [accept ? "ACCEPTED" : "REJECTED", inviteId],
    );

    if (accept) {
      await client.query(
        `insert into shop_members (merchant_user_id, shop_id, role)
         values ($1, $2, $3)
         on conflict (shop_id, merchant_user_id) where deleted_at is null do nothing`,
        [merchantUserId, invite.shop_id, invite.role],
      );
      await writeAudit(client, {
        actorType: "MERCHANT",
        actorId: merchantUserId,
        action: "shop.member_joined",
        entityType: "shop",
        entityId: invite.shop_id,
        after: { role: invite.role },
      });
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function activeOwnerCount(client: PoolClient, shopId: string, excludeMemberId?: string): Promise<number> {
  const { rows } = await client.query(
    `select count(*)::int as n from shop_members
      where shop_id = $1 and role = 'OWNER' and status = 'ACTIVE' and deleted_at is null
        and id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
    [shopId, excludeMemberId ?? null],
  );
  return rows[0].n;
}

export async function updateMemberRole(
  pool: Pool,
  merchantUserId: string,
  shopId: string,
  memberId: string,
  role: ShopRole,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `select * from shop_members where id = $1 and shop_id = $2 and deleted_at is null`,
      [memberId, shopId],
    );
    const member = rows[0];
    if (!member) throw new MemberNotFoundError(`member ${memberId} not found`);

    if (member.role === "OWNER" && role !== "OWNER") {
      const remaining = await activeOwnerCount(client, shopId, memberId);
      if (remaining === 0) throw new LastOwnerError("shop must keep at least one owner");
    }

    const { rows: updated } = await client.query(
      `update shop_members set role = $1 where id = $2 returning *`,
      [role, memberId],
    );

    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "shop.member_role_updated",
      entityType: "shop_member",
      entityId: memberId,
      before: { role: member.role },
      after: { role },
    });

    await client.query("COMMIT");
    return updated[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function removeMember(pool: Pool, merchantUserId: string, shopId: string, memberId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `select * from shop_members where id = $1 and shop_id = $2 and deleted_at is null`,
      [memberId, shopId],
    );
    const member = rows[0];
    if (!member) throw new MemberNotFoundError(`member ${memberId} not found`);

    if (member.role === "OWNER") {
      const remaining = await activeOwnerCount(client, shopId, memberId);
      if (remaining === 0) throw new LastOwnerError("shop must keep at least one owner");
    }

    await client.query(`update shop_members set deleted_at = now() where id = $1`, [memberId]);

    await writeAudit(client, {
      actorType: "MERCHANT",
      actorId: merchantUserId,
      action: "shop.member_removed",
      entityType: "shop_member",
      entityId: memberId,
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
