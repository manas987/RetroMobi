// No test contract provided (Tickets isn't in implementation.md's locked-test
// list). Minimal self-check for the two easy-to-break rules: assignment order
// (SUPPORT before ADMIN before SUPER_ADMIN, fewest open tickets) and the
// messages cursor only returning what's after `since`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../DB/migrate.ts";
import { createUser } from "../../test/fixtures.ts";
import { getMessages, openTicket, postMessage } from "./ticketsService.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

async function makeAdmin(role: "SUPER_ADMIN" | "ADMIN" | "SUPPORT") {
  const phone = `+917${(Date.now() % 1_000_000).toString().padStart(6, "0")}${Math.floor(Math.random() * 1000)}`;
  const { rows } = await pool.query(
    `insert into admins (phone, role, status) values ($1, $2, 'ACTIVE') returning id`,
    [phone, role],
  );
  return rows[0].id;
}

describe("openTicket assignment", () => {
  test("prefers an ACTIVE SUPPORT admin over ADMIN/SUPER_ADMIN", async () => {
    // admins is a global table with no tenant boundary, so other test files
    // (admin auth, Phase 12) also create ACTIVE SUPPORT rows -- this only
    // asserts the role tier picked, never a specific admin id, since ties on
    // "fewest open tickets" across files are expected and not a bug.
    await makeAdmin("SUPPORT");
    await makeAdmin("ADMIN");
    const user = await createUser(pool);

    const ticket = await openTicket(pool, { openedByType: "CUSTOMER", openedById: user.id });
    expect(ticket.assignedTo).not.toBeNull();
    const { rows } = await pool.query(`select role from admins where id = $1`, [ticket.assignedTo]);
    expect(rows[0].role).toBe("SUPPORT");
  });
});

describe("message cursor", () => {
  test("since=<id> returns only messages after that cursor", async () => {
    const user = await createUser(pool);
    await makeAdmin("SUPPORT");
    const ticket = await openTicket(pool, { openedByType: "CUSTOMER", openedById: user.id });

    const first = await postMessage(pool, ticket.id, { partyType: "CUSTOMER", partyId: user.id }, "hello");
    await postMessage(pool, ticket.id, { partyType: "CUSTOMER", partyId: user.id }, "second");

    const after = await getMessages(pool, ticket.id, "CUSTOMER", user.id, first.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.body).toBe("second");
  });
});
