// No test contract provided (Tickets isn't in implementation.md's locked-test
// list). Minimal self-check for the two easy-to-break rules: assignment order
// (SUPPORT before ADMIN before SUPER_ADMIN, fewest open tickets) and the
// messages cursor only returning what's after `since`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../DB/migrate.ts";
import { createBookableVehicle, createMerchant, createRider, createUser, futureWindow, insertBooking } from "../../test/fixtures.ts";
import { getMessages, listCustomerConversations, listMerchantConversations, openTicket, postMessage, TicketNotAboutBookingError } from "./ticketsService.ts";

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

test("the customer inbox includes owned booking context and human message previews", async () => {
  const user = await createUser(pool);
  const other = await createUser(pool);
  const rider = await createRider(pool, user.id);
  const vehicle = await createBookableVehicle(pool);
  const group = await pool.query("insert into booking_groups (user_id) values ($1) returning id", [user.id]);
  const window = futureWindow();
  const booking = await insertBooking(pool, {
    vehicleId: vehicle.id, groupId: group.rows[0].id, riderId: rider.id,
    pickupAt: window.pickupAt.toISOString(), returnAt: window.returnAt.toISOString(),
  });

  await expect(openTicket(pool, { openedByType: "CUSTOMER", openedById: other.id, bookingId: booking.id }))
    .rejects.toBeInstanceOf(TicketNotAboutBookingError);
  const linked = await openTicket(pool, {
    openedByType: "CUSTOMER", openedById: user.id, bookingId: booking.id, category: "BOOKING", firstMessage: "Pickup question",
  });
  const general = await openTicket(pool, {
    openedByType: "CUSTOMER", openedById: user.id, firstMessage: "The app keeps closing",
  });
  const inbox = await listCustomerConversations(pool, user.id);
  expect(inbox.find((ticket) => ticket.id === linked.id)).toMatchObject({
    booking_id: booking.id, booking_make: "Honda", first_message: "Pickup question", latest_message: "Pickup question",
  });
  expect(inbox.find((ticket) => ticket.id === general.id)).toMatchObject({
    booking_id: null, first_message: "The app keeps closing", latest_message: "The app keeps closing", latest_is_mine: true,
  });
  expect(await listCustomerConversations(pool, other.id)).toEqual([]);
});

test("the merchant inbox says whether the latest message is the merchant's own", async () => {
  const merchantId = (await createMerchant(pool)).id;
  await makeAdmin("SUPPORT");
  const ticket = await openTicket(pool, { openedByType: "MERCHANT", openedById: merchantId, firstMessage: "Payout missing" });
  const find = async () => (await listMerchantConversations(pool, merchantId)).find((x) => x.id === ticket.id)!;
  expect(await find()).toMatchObject({ latest_message: "Payout missing", latest_is_mine: true });
  const assigned = await pool.query("select party_id from ticket_participants where ticket_id = $1 and party_type = 'ADMIN'", [ticket.id]);
  await postMessage(pool, ticket.id, { partyType: "ADMIN", partyId: assigned.rows[0].party_id }, "On it");
  expect(await find()).toMatchObject({ latest_message: "On it", latest_is_mine: false });
  await postMessage(pool, ticket.id, { partyType: "MERCHANT", partyId: merchantId }, "Thanks");
  expect((await find()).latest_is_mine).toBe(true);
});
