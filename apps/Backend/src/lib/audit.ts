import type { PoolClient } from "pg";

// Takes a PoolClient (not a Pool) so the audit row joins the caller's transaction.
// Feeds metrics/analytics, not just compliance -- populate before/after on updates.
export async function writeAudit(
  client: PoolClient,
  entry: {
    actorType: "CUSTOMER" | "MERCHANT" | "ADMIN" | "SYSTEM";
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into audit_logs (actor_type, actor_id, action, entity_type, entity_id, before, after)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorType,
      entry.actorId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
    ],
  );
}
