import type { Pool } from "pg";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateString(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Claim-then-send with `for update skip locked`, so it is safe to run this
// from more than one process. Failure never retries in-process -- the row is
// just marked FAILED and the next sweep (or a human) decides what to do.
export async function sendPendingNotifications(
  pool: Pool,
  senders: {
    sms: (to: string, body: string) => Promise<void>;
    email: (to: string, subject: string, body: string) => Promise<void>;
  },
): Promise<number> {
  const client = await pool.connect();
  let claimed;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `update notifications set status = 'SENT', sent_at = now()
        where id in (
          select id from notifications where status = 'PENDING' order by created_at limit 50 for update skip locked
        )
        returning *`,
    );
    claimed = rows;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  let sent = 0;
  for (const row of claimed) {
    try {
      const contact = await resolveContact(pool, row.recipient_type, row.recipient_id, row.channel);
      if (!contact) throw new Error(`no ${row.channel} contact for ${row.recipient_type} ${row.recipient_id}`);

      const { subject, body } = renderTemplate(row.template, row.payload ?? {});
      if (row.channel === "SMS") {
        await senders.sms(contact, body);
      } else {
        await senders.email(contact, subject, body);
      }
      sent += 1;
    } catch (err) {
      await pool.query(`update notifications set status = 'FAILED', error = $1 where id = $2`, [
        err instanceof Error ? err.message : String(err),
        row.id,
      ]);
    }
  }
  return sent;
}

// Contact details are resolved at send time, never denormalised onto
// notifications -- a stale phone/email baked in at insert time would be wrong
// by the time the sweep runs.
async function resolveContact(
  pool: Pool,
  recipientType: "CUSTOMER" | "MERCHANT" | "ADMIN",
  recipientId: string,
  channel: "SMS" | "EMAIL",
): Promise<string | null> {
  const table = recipientType === "CUSTOMER" ? "users" : recipientType === "MERCHANT" ? "merchant_users" : "admins";
  const column = channel === "SMS" ? "phone" : "email";
  const { rows } = await pool.query(`select ${column} as contact from ${table} where id = $1`, [recipientId]);
  return rows[0]?.contact ?? null;
}

function renderTemplate(template: string, payload: Record<string, unknown>): { subject: string; body: string } {
  const TEMPLATES: Record<string, (p: Record<string, unknown>) => { subject: string; body: string }> = {
    booking_confirmed: (p) => ({
      subject: "Your RetroMobi booking is confirmed",
      body: `Your booking is confirmed. Invoices: ${p.merchantInvoiceNumber ?? "-"} / ${p.platformInvoiceNumber ?? "-"}.`,
    }),
    refund_processed: (p) => ({
      subject: "Your RetroMobi refund has been processed",
      body: `A refund of ₹${Number(p.refundAmount ?? 0) / 100} has been processed for booking ${p.bookingId}.`,
    }),
    deposit_claim_raised: (p) => ({
      subject: "A deposit claim was raised on your RetroMobi booking",
      body: `The merchant raised a deposit claim on booking ${p.bookingId}. Support will reach out.`,
    }),
    ticket_reply: (p) => ({
      subject: "New reply on your RetroMobi support ticket",
      body: `There is a new reply on ticket ${p.ticketId}.`,
    }),
    pickup_tomorrow: (p) => ({
      subject: "Your RetroMobi pickup is tomorrow",
      body: `Reminder: your pickup for booking ${p.bookingId} is tomorrow.`,
    }),
    return_due_today: (p) => ({
      subject: "Your RetroMobi return is due today",
      body: `Reminder: your return for booking ${p.bookingId} is due today.`,
    }),
  };
  const render = TEMPLATES[template];
  if (!render) throw new Error(`unknown notification template ${template}`);
  return render(payload);
}

// ponytail: query-based dedupe, so two app instances scanning in the same
// second could both insert. Harmless at one process; add a unique index on
// (template, recipient_id, (payload->>'bookingId')) in a new migration if a
// second instance ever ships.
async function alreadyQueued(pool: Pool, template: string, recipientId: string, bookingId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `select 1 from notifications where template = $1 and recipient_id = $2 and payload->>'bookingId' = $3`,
    [template, recipientId, bookingId],
  );
  return rows.length > 0;
}

export async function sweepBookingReminders(pool: Pool): Promise<number> {
  const now = new Date();
  const tomorrow = istDateString(new Date(now.getTime() + 86_400_000));
  const today = istDateString(now);
  let inserted = 0;

  const { rows: pickupRows } = await pool.query(
    `select b.id, g.user_id
       from bookings b
       join booking_groups g on g.id = b.group_id
      where b.status = 'CONFIRMED' and b.deleted_at is null
        and (b.scheduled_pickup_at + interval '5.5 hours')::date = $1::date`,
    [tomorrow],
  );
  for (const row of pickupRows) {
    if (await alreadyQueued(pool, "pickup_tomorrow", row.user_id, row.id)) continue;
    await pool.query(
      `insert into notifications (recipient_type, recipient_id, channel, template, payload)
       values ('CUSTOMER', $1, 'SMS', 'pickup_tomorrow', $2)`,
      [row.user_id, JSON.stringify({ bookingId: row.id })],
    );
    inserted += 1;
  }

  const { rows: returnRows } = await pool.query(
    `select b.id, g.user_id
       from bookings b
       join booking_groups g on g.id = b.group_id
      where b.status = 'CONFIRMED' and b.deleted_at is null and b.actual_return_at is null
        and (b.scheduled_return_at + interval '5.5 hours')::date = $1::date`,
    [today],
  );
  for (const row of returnRows) {
    if (await alreadyQueued(pool, "return_due_today", row.user_id, row.id)) continue;
    await pool.query(
      `insert into notifications (recipient_type, recipient_id, channel, template, payload)
       values ('CUSTOMER', $1, 'SMS', 'return_due_today', $2)`,
      [row.user_id, JSON.stringify({ bookingId: row.id })],
    );
    inserted += 1;
  }

  return inserted;
}
