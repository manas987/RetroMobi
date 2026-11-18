import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../lib/audit.ts";
import { notify } from "../../lib/notify.ts";
import { assertOwnUpload } from "../../lib/storage.ts";

export class TicketNotFoundError extends Error {}
export class TicketCategoryAlreadySetError extends Error {}
export class TicketNotAboutBookingError extends Error {}

const SYSTEM_SENDER_ID = "00000000-0000-0000-0000-000000000000";

export type PartyType = "CUSTOMER" | "MERCHANT" | "ADMIN";

// Assignment runs on creation: ACTIVE SUPPORT with fewest non-resolved tickets,
// then ACTIVE ADMIN, then SUPER_ADMIN. No self-service escalation -- admins
// reassign via a separate action.
async function pickAssignee(client: PoolClient): Promise<string | null> {
  for (const role of ["SUPPORT", "ADMIN", "SUPER_ADMIN"]) {
    const { rows } = await client.query(
      `select a.id
         from admins a
         left join tickets t on t.assigned_to = a.id and t.status <> 'RESOLVED'
        where a.role = $1 and a.status = 'ACTIVE' and a.deleted_at is null
        group by a.id
        order by count(t.id) asc
        limit 1`,
      [role],
    );
    if (rows.length > 0) return rows[0].id;
  }
  return null;
}

export async function openTicket(
  pool: Pool,
  input: {
    bookingId?: string | null;
    openedByType: Exclude<PartyType, "ADMIN">;
    openedById: string;
    counterpartyType?: Exclude<PartyType, "ADMIN">;
    counterpartyId?: string;
    subject?: string;
    firstMessage?: string;
    /** Set by callers that already know (e.g. a deposit claim is always BOOKING, booking_id already set). Otherwise null until setTicketCategory. */
    category?: "BOOKING" | "APP_HELP" | "OTHER";
  },
): Promise<{ id: string; assignedTo: string | null; reused?: boolean }> {
  const client = await pool.connect();
  let released = false;
  try {
    await client.query("BEGIN");

    if (input.openedByType === "CUSTOMER" && input.bookingId) {
      const { rowCount } = await client.query(
        `select 1 from bookings b join booking_groups g on g.id = b.group_id
          where b.id = $1 and g.user_id = $2`,
        [input.bookingId, input.openedById],
      );
      if (!rowCount) throw new TicketNotAboutBookingError("Choose one of your bookings.");
    }
    // Same rule for a shop: only a booking at a shop this merchant works at.
    // Otherwise the chat list would show another shop's plate and support's
    // "add party" picker would offer that shop's customer.
    if (input.openedByType === "MERCHANT" && input.bookingId) {
      const { rowCount } = await client.query(
        `select 1 from bookings b
           join vehicles v on v.id = b.vehicle_id
           join shop_members m on m.shop_id = v.shop_id
          where b.id = $1 and m.merchant_user_id = $2 and m.status = 'ACTIVE' and m.deleted_at is null`,
        [input.bookingId, input.openedById],
      );
      if (!rowCount) throw new TicketNotAboutBookingError("Choose one of your shop's bookings.");
    }

    // One chat per booking per person: asking again (or a deposit claim on a
    // booking the shop already chats about) lands in the existing chat, and a
    // closed one reopens. Two creates in the same instant: the customer side is
    // guarded by ux_tickets_customer_booking (migration 0026, caught below).
    if (input.bookingId) {
      const { rows: existing } = await client.query(
        `select t.id, t.status, t.assigned_to from tickets t
           join ticket_participants p on p.ticket_id = t.id and p.party_type = $2 and p.party_id = $3
          where t.booking_id = $1
          order by t.created_at desc limit 1
          for update of t`,
        [input.bookingId, input.openedByType, input.openedById],
      );
      const found = existing[0];
      if (found) {
        await client.query(`update tickets set subject = coalesce($2, subject), updated_at = now() where id = $1`, [
          found.id,
          input.subject ?? null,
        ]);
        if (input.firstMessage) {
          await client.query(
            `insert into ticket_messages (ticket_id, sender_type, sender_id, body) values ($1, $2, $3, $4)`,
            [found.id, input.openedByType, input.openedById, input.firstMessage],
          );
        }
        if (found.status === "RESOLVED") {
          await reopen(client, found.id, { type: input.openedByType, id: input.openedById });
        }
        await client.query("COMMIT");
        return { id: found.id, assignedTo: found.assigned_to, reused: true };
      }
    }

    const assignedTo = await pickAssignee(client);

    const { rows } = await client.query(
      `insert into tickets (booking_id, opened_by_type, opened_by_id, assigned_to, subject, status, category)
       values ($1, $2, $3, $4, $5, 'OPEN', $6)
       returning id`,
      [
        input.bookingId ?? null,
        input.openedByType,
        input.openedById,
        assignedTo,
        input.subject ?? null,
        input.category ?? null,
      ],
    );
    const ticketId = rows[0].id;

    await client.query(
      `insert into ticket_participants (ticket_id, party_type, party_id) values ($1, $2, $3)
       on conflict do nothing`,
      [ticketId, input.openedByType, input.openedById],
    );
    if (input.counterpartyType && input.counterpartyId) {
      await client.query(
        `insert into ticket_participants (ticket_id, party_type, party_id) values ($1, $2, $3)
         on conflict do nothing`,
        [ticketId, input.counterpartyType, input.counterpartyId],
      );
    }
    if (assignedTo) {
      await client.query(
        `insert into ticket_participants (ticket_id, party_type, party_id) values ($1, 'ADMIN', $2)
         on conflict do nothing`,
        [ticketId, assignedTo],
      );
    }

    if (input.firstMessage) {
      await client.query(
        `insert into ticket_messages (ticket_id, sender_type, sender_id, body)
         values ($1, $2, $3, $4)`,
        [ticketId, input.openedByType, input.openedById, input.firstMessage],
      );
    }

    if (!input.category) await client.query(
      `insert into ticket_messages (ticket_id, sender_type, sender_id, body)
       values ($1, 'SYSTEM', $2, $3)`,
      [
        ticketId,
        SYSTEM_SENDER_ID,
        "What is this about? Reply with booking, app help, or something else.",
      ],
    );

    await writeAudit(client, {
      actorType: input.openedByType,
      actorId: input.openedById,
      action: "ticket.opened",
      entityType: "ticket",
      entityId: ticketId,
      after: { assignedTo },
    });

    await client.query("COMMIT");
    return { id: ticketId, assignedTo };
  } catch (err) {
    await client.query("ROLLBACK");
    // Two "Get help" taps raced past the lookup: the index let one through,
    // so this one lands in that chat.
    if ((err as { constraint?: string }).constraint === "ux_tickets_customer_booking") {
      client.release();
      released = true;
      return openTicket(pool, input);
    }
    throw err;
  } finally {
    if (!released) client.release();
  }
}

export async function listTickets(
  pool: Pool,
  participant: { partyType: PartyType; partyId: string },
) {
  const { rows } = await pool.query(
    `select t.* from tickets t
       join ticket_participants p on p.ticket_id = t.id
      where p.party_type = $1 and p.party_id = $2
      order by t.created_at desc`,
    [participant.partyType, participant.partyId],
  );
  return rows;
}

export async function listMerchantConversations(pool: Pool, merchantUserId: string) {
  const { rows } = await pool.query(
    `select t.*, latest.body as latest_message, latest.sender_type as latest_sender_type,
            (latest.sender_type = 'MERCHANT' and latest.sender_id = $1) as latest_is_mine,
            latest.created_at as latest_message_at,
            v.registration_number, m.make, m.model
       from ticket_participants p
       join tickets t on t.id = p.ticket_id
       left join bookings b on b.id = t.booking_id
       left join vehicles v on v.id = b.vehicle_id
       left join vehicle_models m on m.id = v.model_id
       left join lateral (
         select left(body, 240) as body, sender_type, sender_id, created_at from ticket_messages
          where ticket_id = t.id and sender_type <> 'SYSTEM' and nullif(btrim(body), '') is not null
          order by created_at desc, id desc limit 1
       ) latest on true
      where p.party_type = 'MERCHANT' and p.party_id = $1
      order by coalesce(latest.created_at, t.created_at) desc, t.id`,
    [merchantUserId],
  );
  return rows;
}

export async function listCustomerConversations(pool: Pool, userId: string) {
  const { rows } = await pool.query(
    `select t.id, t.subject, t.status, t.category, t.created_at, t.resolution,
            b.id as booking_id, b.scheduled_pickup_at as booking_pickup_at,
            m.make as booking_make, m.model as booking_model, s.name as booking_shop,
            first_message.body as first_message, latest.body as latest_message,
            latest.sender_type as latest_sender_type, latest.sender_id = $1 as latest_is_mine,
            latest.created_at as latest_message_at
       from ticket_participants p
       join tickets t on t.id = p.ticket_id
       left join bookings b on b.id = t.booking_id
         and exists (select 1 from booking_groups g where g.id = b.group_id and g.user_id = $1)
       left join vehicles v on v.id = b.vehicle_id
       left join vehicle_models m on m.id = v.model_id
       left join shops s on s.id = v.shop_id
       left join lateral (
         select left(body, 240) as body from ticket_messages
          where ticket_id = t.id and sender_type <> 'SYSTEM' and nullif(btrim(body), '') is not null
          order by created_at, id limit 1
       ) first_message on true
       left join lateral (
         select left(body, 240) as body, sender_type, sender_id, created_at from ticket_messages
          where ticket_id = t.id and sender_type <> 'SYSTEM' and nullif(btrim(body), '') is not null
          order by created_at desc, id desc limit 1
       ) latest on true
      where p.party_type = 'CUSTOMER' and p.party_id = $1
      order by coalesce(latest.created_at, t.created_at) desc, t.id`,
    [userId],
  );
  return rows;
}

// These three skip the participant check BY ROLE, NOT BY ACCIDENT: an admin
// must be able to see the queue and a ticket before being assigned to it.
// postMessage and addAttachment below still gate on participation --
// assignTicket already inserts the ADMIN participant row, so an admin who
// replies has been added first.
export async function listTicketQueue(
  pool: Pool,
  filters: { status?: string; assignedTo?: string; unassigned?: boolean },
) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.assignedTo) {
    values.push(filters.assignedTo);
    conditions.push(`assigned_to = $${values.length}`);
  }
  if (filters.unassigned) {
    conditions.push(`assigned_to is null`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const { rows } = await pool.query(`select * from tickets ${where} order by created_at`, values);
  return rows;
}

export async function getTicketForAdmin(pool: Pool, ticketId: string) {
  const { rows } = await pool.query(`select * from tickets where id = $1`, [ticketId]);
  if (rows.length === 0) throw new TicketNotFoundError(`ticket ${ticketId} not found`);
  return rows[0];
}

export async function getMessagesForAdmin(pool: Pool, ticketId: string, sinceId?: string) {
  if (sinceId) {
    const { rows } = await pool.query(
      `select m.* from ticket_messages m
        where m.ticket_id = $1
          and (m.created_at, m.id) > (select created_at, id from ticket_messages where id = $2)
        order by m.created_at, m.id`,
      [ticketId, sinceId],
    );
    return rows;
  }
  const { rows } = await pool.query(
    `select * from ticket_messages where ticket_id = $1 order by created_at, id`,
    [ticketId],
  );
  return rows;
}

async function requireParticipant(pool: Pool, ticketId: string, partyType: PartyType, partyId: string) {
  const { rows } = await pool.query(
    `select 1 from ticket_participants where ticket_id = $1 and party_type = $2 and party_id = $3`,
    [ticketId, partyType, partyId],
  );
  if (rows.length === 0) throw new TicketNotFoundError(`ticket ${ticketId} not found`);
}

export async function getTicket(pool: Pool, ticketId: string, partyType: PartyType, partyId: string) {
  await requireParticipant(pool, ticketId, partyType, partyId);
  const { rows } = await pool.query(`select * from tickets where id = $1`, [ticketId]);
  return rows[0];
}

// The service only ever answers "messages after this cursor" -- never bake
// polling into storage, so a push transport later is a swap-in, not a rewrite.
export async function getMessages(
  pool: Pool,
  ticketId: string,
  partyType: PartyType,
  partyId: string,
  sinceId?: string,
) {
  await requireParticipant(pool, ticketId, partyType, partyId);

  if (sinceId) {
    const { rows } = await pool.query(
      `select m.*, coalesce(json_agg(a.*) filter (where a.id is not null), '[]') as attachments
         from ticket_messages m
         left join ticket_attachments a on a.message_id = m.id
        where m.ticket_id = $1
          and (m.created_at, m.id) > (select created_at, id from ticket_messages where id = $2)
        group by m.id
        order by m.created_at, m.id`,
      [ticketId, sinceId],
    );
    return rows;
  }

  const { rows } = await pool.query(
    `select m.*, coalesce(json_agg(a.*) filter (where a.id is not null), '[]') as attachments
       from ticket_messages m
       left join ticket_attachments a on a.message_id = m.id
      where m.ticket_id = $1
      group by m.id
      order by m.created_at, m.id`,
    [ticketId],
  );
  return rows;
}

export async function setTicketCategory(
  pool: Pool,
  ticketId: string,
  party: { partyType: PartyType; partyId: string },
  input: { category: "BOOKING" | "APP_HELP" | "OTHER"; bookingId?: string },
) {
  await requireParticipant(pool, ticketId, party.partyType, party.partyId);

  const { rows: ticketRows } = await pool.query(`select category from tickets where id = $1`, [ticketId]);
  if (ticketRows.length === 0) throw new TicketNotFoundError(`ticket ${ticketId} not found`);
  if (ticketRows[0].category !== null) {
    throw new TicketCategoryAlreadySetError(`ticket ${ticketId} already has a category`);
  }

  let bookingId: string | null = null;
  if (input.category === "BOOKING") {
    if (!input.bookingId) throw new TicketNotAboutBookingError("bookingId is required for category BOOKING");

    const { rows: ownedBooking } =
      party.partyType === "CUSTOMER"
        ? await pool.query(
            `select b.id from bookings b
               join booking_groups g on g.id = b.group_id
              where b.id = $1 and g.user_id = $2`,
            [input.bookingId, party.partyId],
          )
        : await pool.query(
            `select b.id from bookings b
               join vehicles v on v.id = b.vehicle_id
               join shops s on s.id = v.shop_id
              where b.id = $1 and s.merchant_user_id = $2`,
            [input.bookingId, party.partyId],
          );
    if (ownedBooking.length === 0) {
      throw new TicketNotAboutBookingError(`booking ${input.bookingId} is not this party's booking`);
    }
    bookingId = input.bookingId;
  } else if (input.bookingId) {
    throw new TicketNotAboutBookingError("bookingId must be omitted for a non-BOOKING category");
  }

  const { rows } = await pool.query(
    `update tickets set category = $1, booking_id = coalesce($2, booking_id), updated_at = now() where id = $3 returning *`,
    [input.category, bookingId, ticketId],
  );
  return rows[0];
}

export async function postMessage(
  pool: Pool,
  ticketId: string,
  sender: { partyType: PartyType; partyId: string },
  body: string,
) {
  await requireParticipant(pool, ticketId, sender.partyType, sender.partyId);
  const { rows } = await pool.query(
    `insert into ticket_messages (ticket_id, sender_type, sender_id, body)
     values ($1, $2, $3, $4) returning *`,
    [ticketId, sender.partyType, sender.partyId, body],
  );
  await pool.query(`update tickets set status = 'IN_PROGRESS', updated_at = now() where id = $1 and status = 'OPEN'`, [
    ticketId,
  ]);
  // A customer writing into a resolved chat means it isn't sorted: reopen it.
  if (sender.partyType === "CUSTOMER") {
    const { rows: state } = await pool.query(`select status from tickets where id = $1`, [ticketId]);
    if (state[0]?.status === "RESOLVED") await reopen(pool, ticketId, { type: "CUSTOMER", id: sender.partyId });
  }

  const { rows: participants } = await pool.query(
    `select party_type, party_id from ticket_participants
      where ticket_id = $1 and not (party_type = $2 and party_id = $3)`,
    [ticketId, sender.partyType, sender.partyId],
  );
  for (const p of participants) {
    await notify(pool, {
      recipientType: p.party_type,
      recipientId: p.party_id,
      channel: "WHATSAPP",
      template: "ticket_reply",
      payload: { ticketId },
    });
  }

  return rows[0];
}

export async function addAttachment(
  pool: Pool,
  messageId: string,
  sender: { partyType: PartyType; partyId: string },
  input: { storageKey: string; fileName?: string; sizeBytes?: number; durationSeconds?: number },
) {
  const { rows: messageRows } = await pool.query(
    `select ticket_id from ticket_messages where id = $1`,
    [messageId],
  );
  const message = messageRows[0];
  if (!message) throw new TicketNotFoundError(`message ${messageId} not found`);

  await requireParticipant(pool, message.ticket_id, sender.partyType, sender.partyId);
  assertOwnUpload(input.storageKey, `tickets/${message.ticket_id}/${messageId}/`);

  const { rows } = await pool.query(
    `insert into ticket_attachments (message_id, storage_key, file_name, size_bytes, duration_seconds)
     values ($1, $2, $3, $4, $5) returning *`,
    [messageId, input.storageKey, input.fileName ?? null, input.sizeBytes ?? null, input.durationSeconds ?? null],
  );
  return rows[0];
}

export async function getAttachmentDownloadUrl(
  pool: Pool,
  attachmentId: string,
  requester: { partyType: PartyType; partyId: string },
) {
  const { rows } = await pool.query(
    `select a.storage_key, m.ticket_id from ticket_attachments a
       join ticket_messages m on m.id = a.message_id
      where a.id = $1`,
    [attachmentId],
  );
  if (rows.length === 0) throw new TicketNotFoundError(`attachment ${attachmentId} not found`);
  await requireParticipant(pool, rows[0].ticket_id, requester.partyType, requester.partyId);
  return rows[0].storage_key as string;
}

// Populates the support UI's picker: for a ticket with a booking_id, that is
// the booking's customer and the vehicle's shop owner -- NOT a free search
// over every user. A support agent must not be able to add an unrelated
// person to someone else's dispute. For a ticket with no booking, empty.
export async function listAddableParties(pool: Pool, ticketId: string) {
  const { rows: ticketRows } = await pool.query(`select booking_id from tickets where id = $1`, [ticketId]);
  if (ticketRows.length === 0) throw new TicketNotFoundError(`ticket ${ticketId} not found`);
  if (!ticketRows[0].booking_id) return [];

  const { rows } = await pool.query(
    `select 'CUSTOMER' as party_type, g.user_id as party_id
       from bookings b join booking_groups g on g.id = b.group_id
      where b.id = $1
     union all
     select 'MERCHANT' as party_type, s.merchant_user_id as party_id
       from bookings b join vehicles v on v.id = b.vehicle_id join shops s on s.id = v.shop_id
      where b.id = $1`,
    [ticketRows[0].booking_id],
  );
  return rows;
}

export async function addParticipant(
  pool: Pool,
  adminId: string,
  ticketId: string,
  input: { partyType: "CUSTOMER" | "MERCHANT"; partyId: string },
) {
  const addable = await listAddableParties(pool, ticketId);
  const allowed = addable.some((p: any) => p.party_type === input.partyType && p.party_id === input.partyId);
  if (!allowed) {
    throw new TicketNotAboutBookingError("this party is not related to the ticket's booking");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into ticket_participants (ticket_id, party_type, party_id) values ($1, $2, $3)
       on conflict do nothing`,
      [ticketId, input.partyType, input.partyId],
    );
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "ticket.participant_added",
      entityType: "ticket",
      entityId: ticketId,
      after: { partyType: input.partyType, partyId: input.partyId },
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function assignTicket(pool: Pool, ticketId: string, adminId: string) {
  await pool.query(`update tickets set assigned_to = $1, updated_at = now() where id = $2`, [
    adminId,
    ticketId,
  ]);
  await pool.query(
    `insert into ticket_participants (ticket_id, party_type, party_id) values ($1, 'ADMIN', $2)
     on conflict do nothing`,
    [ticketId, adminId],
  );
}

export async function resolveTicket(pool: Pool, ticketId: string, resolution: string, adminId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `update tickets set status = 'RESOLVED', resolution = $1, resolved_at = now(), updated_at = now() where id = $2`,
      [resolution, ticketId],
    );
    await writeAudit(client, {
      actorType: "ADMIN",
      actorId: adminId,
      action: "ticket.resolved",
      entityType: "ticket",
      entityId: ticketId,
      after: { resolution },
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Puts a RESOLVED ticket back in the queue, with a note in the chat. */
async function reopen(client: Pool | PoolClient, ticketId: string, by: { type: "CUSTOMER" | "MERCHANT"; id: string }) {
  await client.query(
    `update tickets set status = 'OPEN', resolution = null, resolved_at = null, updated_at = now()
      where id = $1 and status = 'RESOLVED'`,
    [ticketId],
  );
  await client.query(
    `insert into ticket_messages (ticket_id, sender_type, sender_id, body) values ($1, 'SYSTEM', $2, $3)`,
    [ticketId, SYSTEM_SENDER_ID, by.type === "CUSTOMER" ? "The customer reopened this conversation." : "The shop reopened this conversation."],
  );
  await writeAudit(client, {
    actorType: by.type,
    actorId: by.id,
    action: "ticket.reopened",
    entityType: "ticket",
    entityId: ticketId,
  });
}

export class TicketNotResolvedError extends Error {}

/** The customer reopens their resolved chat ("this isn't sorted yet"). */
export async function reopenTicket(pool: Pool, ticketId: string, userId: string) {
  await requireParticipant(pool, ticketId, "CUSTOMER", userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`select status, assigned_to from tickets where id = $1 for update`, [ticketId]);
    if (rows[0]?.status !== "RESOLVED") throw new TicketNotResolvedError("This conversation is already open.");
    await reopen(client, ticketId, { type: "CUSTOMER", id: userId });
    if (rows[0].assigned_to) {
      await notify(client, {
        recipientType: "ADMIN",
        recipientId: rows[0].assigned_to,
        channel: "WHATSAPP",
        template: "ticket_reply",
        payload: { ticketId },
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
