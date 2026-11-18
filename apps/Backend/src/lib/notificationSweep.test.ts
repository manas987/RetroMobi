import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import { createUser } from "../test/fixtures.ts";
import { sendPendingNotifications, sweepBookingReminders } from "./notificationSweep.ts";

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

describe("sendPendingNotifications", () => {
  test("a PENDING notification is sent as its WhatsApp template and marked SENT", async () => {
    const user = await createUser(pool);
    await pool.query(
      `insert into notifications (recipient_type, recipient_id, channel, template, payload)
       values ('CUSTOMER', $1, 'WHATSAPP', 'refund_processed', $2)`,
      [user.id, JSON.stringify({ bookingId: "x", refundAmount: 150000 })],
    );

    // The sweep claims up to 50 PENDING rows oldest-first, and a persistent test
    // DB can carry a backlog from earlier runs -- so drain repeatedly rather than
    // assuming this row lands in the very first batch.
    const calls: Array<{ to: string; template: string; params: string[] }> = [];
    for (let i = 0; i < 20; i++) {
      const sent = await sendPendingNotifications(pool, {
        whatsapp: async (to, template, params) => {
          calls.push({ to, template, params });
        },
        email: async () => {},
      });
      if (sent === 0) break;
    }

    // Paise become rupees, in the {{1}}, {{2}} order the approved template expects.
    expect(calls).toContainEqual({ to: user.phone, template: "refund_processed", params: ["1,500", "x"] });

    const { rows } = await pool.query(
      `select status from notifications where recipient_id = $1 and template = 'refund_processed'`,
      [user.id],
    );
    expect(rows[0].status).toBe("SENT");
  });

  // Legacy SMS rows (call sites not yet switched) go out over WhatsApp too.
  test("a sender that throws marks the row FAILED, not retried in-process", async () => {
    const user = await createUser(pool);
    await pool.query(
      `insert into notifications (recipient_type, recipient_id, channel, template, payload)
       values ('CUSTOMER', $1, 'SMS', 'ticket_reply', $2)`,
      [user.id, JSON.stringify({ ticketId: "x" })],
    );

    // Concurrent test files can also be inserting PENDING rows into this same
    // global table, so a single call might claim 50 of theirs first -- drain
    // until this row is reached.
    for (let i = 0; i < 20; i++) {
      const { rows: stillPending } = await pool.query(
        `select 1 from notifications where recipient_id = $1 and template = 'ticket_reply' and status = 'PENDING'`,
        [user.id],
      );
      if (stillPending.length === 0) break;
      await sendPendingNotifications(pool, {
        whatsapp: async () => {
          throw new Error("WhatsApp is down");
        },
        email: async () => {
          throw new Error("WhatsApp is down");
        },
      });
    }

    const { rows } = await pool.query(
      `select status, error from notifications where recipient_id = $1 and template = 'ticket_reply'`,
      [user.id],
    );
    expect(rows[0].status).toBe("FAILED");
    expect(rows[0].error).toContain("WhatsApp is down");
  });
});

describe("sweepBookingReminders", () => {
  test("running twice does not duplicate the same reminder for the same booking", async () => {
    const before = await pool.query(`select count(*)::int as n from notifications where template = 'pickup_tomorrow'`);
    await sweepBookingReminders(pool);
    const afterFirst = await pool.query(`select count(*)::int as n from notifications where template = 'pickup_tomorrow'`);
    await sweepBookingReminders(pool);
    const afterSecond = await pool.query(`select count(*)::int as n from notifications where template = 'pickup_tomorrow'`);
    expect(afterSecond.rows[0].n).toBe(afterFirst.rows[0].n);
    void before;
  });
});
