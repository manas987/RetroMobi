import type { Pool, PoolClient } from "pg";

// Takes a PoolClient (or a bare Pool, for call sites with no open transaction
// to join), exactly like writeAudit. This only ever inserts a PENDING row --
// it never sends. Sending inside the payment webhook's transaction would mean
// a slow Twilio call holding a money transaction open, and a Twilio outage
// rolling back a confirmed booking.
export async function notify(
  client: Pool | PoolClient,
  n: {
    recipientType: "CUSTOMER" | "MERCHANT" | "ADMIN";
    recipientId: string;
    channel: "SMS" | "EMAIL";
    template: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `insert into notifications (recipient_type, recipient_id, channel, template, payload)
     values ($1, $2, $3, $4, $5)`,
    [n.recipientType, n.recipientId, n.channel, n.template, JSON.stringify(n.payload)],
  );
}
