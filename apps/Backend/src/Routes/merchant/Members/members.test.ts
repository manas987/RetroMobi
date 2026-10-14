import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createMerchant, uniquePhone } from "../../../test/fixtures.ts";
import { createShop } from "../Shops/shopsService.ts";
import {
  LastOwnerError,
  inviteMember,
  listMembers,
  listMyInvites,
  removeMember,
  respondToInvite,
  updateMemberRole,
} from "./membersService.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("merchant members", () => {
  test("inviting a merchant by phone, then accepting, adds them as a member", async () => {
    const owner = await createMerchant(pool);
    const shop = await createShop(pool, owner.id, {
      name: "A",
      addressLine1: "1 Road",
      city: "City",
      state: "State",
      pincode: "100001",
    });

    const staffPhone = uniquePhone();
    await pool.query(`insert into merchant_users (phone, name) values ($1, 'Staffer')`, [staffPhone]);
    const { rows } = await pool.query(`select id from merchant_users where phone = $1`, [staffPhone]);
    const staffId = rows[0].id;

    await inviteMember(pool, owner.id, shop.id, { phone: staffPhone, role: "STAFF" });

    const invites = await listMyInvites(pool, staffId);
    expect(invites).toHaveLength(1);

    await respondToInvite(pool, staffId, invites[0].id, true);

    const members = await listMembers(pool, shop.id);
    expect(members.map((m) => m.role).sort()).toEqual(["OWNER", "STAFF"]);
  });

  test("the last owner cannot be demoted or removed", async () => {
    const owner = await createMerchant(pool);
    const shop = await createShop(pool, owner.id, {
      name: "B",
      addressLine1: "1 Road",
      city: "City",
      state: "State",
      pincode: "100001",
    });
    const members = await listMembers(pool, shop.id);
    const ownerMemberId = members[0].id;

    await expect(
      updateMemberRole(pool, owner.id, shop.id, ownerMemberId, "STAFF"),
    ).rejects.toBeInstanceOf(LastOwnerError);
    await expect(removeMember(pool, owner.id, shop.id, ownerMemberId)).rejects.toBeInstanceOf(
      LastOwnerError,
    );
  });
});
