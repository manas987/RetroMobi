import type { Pool, PoolClient } from "pg";

// Takes a PoolClient so the audit row joins the caller's transaction wherever
// one is open; a bare Pool is accepted too for call sites with no transaction
// to join (e.g. session/login bookkeeping, which is a single insert either way).
// Feeds metrics/analytics, not just compliance -- populate before/after on updates.
export async function writeAudit(
  client: Pool | PoolClient,
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
