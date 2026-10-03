import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../lib/audit.ts";

export class TicketNotFoundError extends Error {}

type PartyType = "CUSTOMER" | "MERCHANT" | "ADMIN";

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
  },
): Promise<{ id: string; assignedTo: string | null }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const assignedTo = await pickAssignee(client);

    const { rows } = await client.query(
      `insert into tickets (booking_id, opened_by_type, opened_by_id, assigned_to, subject, status)
       values ($1, $2, $3, $4, $5, 'OPEN')
       returning id`,
      [input.bookingId ?? null, input.openedByType, input.openedById, assignedTo, input.subject ?? null],
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
    throw err;
  } finally {
    client.release();
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
  return rows[0];
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
