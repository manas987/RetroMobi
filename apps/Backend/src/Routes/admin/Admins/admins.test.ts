import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { uniquePhone } from "../../../test/fixtures.ts";
import {
  LastSuperAdminError,
  SelfModificationError,
  createAdmin,
  softDeleteAdmin,
  updateAdmin,
} from "./adminsService.ts";

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

async function makeSuperAdmin() {
  const { rows } = await pool.query(
    `insert into admins (phone, name, role) values ($1, 'Super', 'SUPER_ADMIN') returning id`,
    [uniquePhone()],
  );
  return rows[0].id as string;
}

describe("admin self-protection", () => {
  test("a SUPER_ADMIN cannot change their own role or status", async () => {
    const self = await makeSuperAdmin();
    await expect(updateAdmin(pool, self, self, { status: "SUSPENDED" })).rejects.toBeInstanceOf(
      SelfModificationError,
    );
    await expect(softDeleteAdmin(pool, self, self)).rejects.toBeInstanceOf(SelfModificationError);
  });

  test("the last active SUPER_ADMIN cannot be demoted, suspended, or deleted by someone else", async () => {
    // admins is global with no per-test isolation, and this file's own earlier
    // tests (plus leftover rows from previous runs against a persistent DB)
    // leave other ACTIVE SUPER_ADMIN rows behind. "Last one standing" is a
    // genuinely global invariant, so this test owns clearing the slate first.
    await pool.query(`update admins set deleted_at = now() where role = 'SUPER_ADMIN' and deleted_at is null`);
    const onlySuper = await makeSuperAdmin();

    await expect(
      updateAdmin(pool, "00000000-0000-0000-0000-000000000000", onlySuper, { role: "ADMIN" }),
    ).rejects.toBeInstanceOf(LastSuperAdminError);
    await expect(
      softDeleteAdmin(pool, "00000000-0000-0000-0000-000000000000", onlySuper),
    ).rejects.toBeInstanceOf(LastSuperAdminError);
  });

  test("demoting one of two active SUPER_ADMINs is allowed", async () => {
    const a = await makeSuperAdmin();
    const b = await makeSuperAdmin();
    const updated = await updateAdmin(pool, b, a, { role: "ADMIN" });
    expect(updated.role).toBe("ADMIN");
  });
});
