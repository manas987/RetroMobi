// No test contract provided (Tickets isn't in implementation.md's locked-test
// list). Minimal self-check for the two easy-to-break rules: assignment order
// (SUPPORT before ADMIN before SUPER_ADMIN, fewest open tickets) and the
// messages cursor only returning what's after `since`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../DB/migrate.ts";
import { createBookableVehicle, createMerchant, createRider, createUser, futureWindow, insertBooking } from "../../test/fixtures.ts";
import { getMessages, listCustomerConversations, listMerchantConversations, openTicket, postMessage, reopenTicket, resolveTicket, TicketNotAboutBookingError, TicketNotResolvedError } from "./ticketsService.ts";

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

test("a merchant can only open a chat about a booking at their own shop", async () => {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id);
  const vehicle = await createBookableVehicle(pool);
  const group = await pool.query("insert into booking_groups (user_id) values ($1) returning id", [user.id]);
  const window = futureWindow();
  const booking = await insertBooking(pool, {
    vehicleId: vehicle.id, groupId: group.rows[0].id, riderId: rider.id,
    pickupAt: window.pickupAt.toISOString(), returnAt: window.returnAt.toISOString(),
  });
  const owner = await pool.query(`select merchant_user_id from shops where id = $1`, [vehicle.shopId]);
  const stranger = await createMerchant(pool);

  await expect(openTicket(pool, { openedByType: "MERCHANT", openedById: stranger.id, bookingId: booking.id }))
    .rejects.toBeInstanceOf(TicketNotAboutBookingError);
  const ticket = await openTicket(pool, { openedByType: "MERCHANT", openedById: owner.rows[0].merchant_user_id, bookingId: booking.id });
  expect(ticket.id).toBeTruthy();
});

test("a second chat about the same booking reuses the first, and a closed one reopens", async () => {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id);
  const vehicle = await createBookableVehicle(pool);
  const group = await pool.query("insert into booking_groups (user_id) values ($1) returning id", [user.id]);
  const window = futureWindow();
  const booking = await insertBooking(pool, {
    vehicleId: vehicle.id, groupId: group.rows[0].id, riderId: rider.id,
    pickupAt: window.pickupAt.toISOString(), returnAt: window.returnAt.toISOString(),
  });
  const owner = (await pool.query(`select merchant_user_id from shops where id = $1`, [vehicle.shopId])).rows[0].merchant_user_id;

  const first = await openTicket(pool, { openedByType: "CUSTOMER", openedById: user.id, bookingId: booking.id, category: "BOOKING", firstMessage: "Where do I park?" });
  const again = await openTicket(pool, { openedByType: "CUSTOMER", openedById: user.id, bookingId: booking.id, category: "BOOKING", firstMessage: "Hello?" });
  expect(again).toMatchObject({ id: first.id, reused: true });

  await pool.query(`update tickets set status = 'RESOLVED', resolved_at = now() where id = $1`, [first.id]);
  const reopened = await openTicket(pool, { openedByType: "CUSTOMER", openedById: user.id, bookingId: booking.id, category: "BOOKING", firstMessage: "One more thing" });
  expect(reopened.id).toBe(first.id);
  const t = (await pool.query(`select status, resolved_at from tickets where id = $1`, [first.id])).rows[0];
  expect(t).toMatchObject({ status: "OPEN", resolved_at: null });
  const bodies = (await getMessages(pool, first.id, "CUSTOMER", user.id)).map((m: { body: string }) => m.body);
  expect(bodies).toEqual(expect.arrayContaining(["Where do I park?", "Hello?", "One more thing"]));

  // The shop's chat about the same booking is its own conversation, and a
  // deposit claim joins it rather than opening a third.
  const shopChat = await openTicket(pool, { openedByType: "MERCHANT", openedById: owner, bookingId: booking.id, category: "BOOKING" });
  expect(shopChat.id).not.toBe(first.id);
  const claim = await openTicket(pool, { openedByType: "MERCHANT", openedById: owner, bookingId: booking.id, category: "BOOKING", subject: "Deposit claim on return", firstMessage: "Scratched mirror" });
  expect(claim.id).toBe(shopChat.id);
  expect((await pool.query(`select subject from tickets where id = $1`, [shopChat.id])).rows[0].subject).toBe("Deposit claim on return");
});

describe("one support chat per booking", () => {
  async function bookingFor() {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id);
    const vehicle = await createBookableVehicle(pool);
    const group = await pool.query("insert into booking_groups (user_id) values ($1) returning id", [user.id]);
    const window = futureWindow();
    const booking = await insertBooking(pool, {
      vehicleId: vehicle.id, groupId: group.rows[0].id, riderId: rider.id,
      pickupAt: window.pickupAt.toISOString(), returnAt: window.returnAt.toISOString(),
    });
    return { userId: user.id as string, bookingId: booking.id as string };
  }
  const ask = (b: { userId: string; bookingId: string }, firstMessage: string) =>
    openTicket(pool, { openedByType: "CUSTOMER", openedById: b.userId, bookingId: b.bookingId, category: "BOOKING", firstMessage });

  test("asking again about the same booking lands in the same chat", async () => {
    const b = await bookingFor();
    const first = await ask(b, "Where do I park?");
    const second = await ask(b, "Also, is a helmet included?");
    expect(second).toMatchObject({ id: first.id, reused: true });
    const messages = await getMessages(pool, first.id, "CUSTOMER", b.userId);
    expect(messages.filter((m) => m.sender_type === "CUSTOMER").map((m) => m.body)).toEqual(["Where do I park?", "Also, is a helmet included?"]);
  });

  test("two taps at once still make one chat", async () => {
    const b = await bookingFor();
    const [one, two] = await Promise.all([ask(b, "first"), ask(b, "second")]);
    expect(one.id).toBe(two.id);
  });

  test("a resolved chat can be reopened, and only a resolved one", async () => {
    const b = await bookingFor();
    const admin = await makeAdmin("SUPPORT");
    const chat = await ask(b, "Refund?");
    await expect(reopenTicket(pool, chat.id, b.userId)).rejects.toBeInstanceOf(TicketNotResolvedError);
    await resolveTicket(pool, chat.id, "Refund sent.", admin);
    await reopenTicket(pool, chat.id, b.userId);
    const { rows } = await pool.query("select status, resolution from tickets where id = $1", [chat.id]);
    expect(rows[0]).toEqual({ status: "OPEN", resolution: null });
  });

  test("replying inside a resolved chat reopens it", async () => {
    const b = await bookingFor();
    const admin = await makeAdmin("SUPPORT");
    const chat = await ask(b, "Refund?");
    await resolveTicket(pool, chat.id, "Refund sent.", admin);
    await postMessage(pool, chat.id, { partyType: "CUSTOMER", partyId: b.userId }, "Not received yet.");
    const { rows } = await pool.query("select status from tickets where id = $1", [chat.id]);
    expect(rows[0].status).toBe("OPEN");
  });

  test("a new message on a resolved booking chat reopens it", async () => {
    const b = await bookingFor();
    const admin = await makeAdmin("SUPPORT");
    const chat = await ask(b, "Refund?");
    await resolveTicket(pool, chat.id, "Refund sent.", admin);
    await ask(b, "It still hasn't arrived.");
    const { rows } = await pool.query("select status from tickets where id = $1", [chat.id]);
    expect(rows[0].status).toBe("OPEN");
  });
});
