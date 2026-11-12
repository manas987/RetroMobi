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
    // Derived from the entity when omitted (shop, vehicle, booking, vehicle_document).
    shopId?: string | null;
  },
): Promise<void> {
  await client.query(
    `insert into audit_logs (actor_type, actor_id, action, entity_type, entity_id, before, after, shop_id)
     values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::uuid, case $4::text
       when 'shop' then $5::uuid
       when 'vehicle' then (select shop_id from vehicles where id = $5::uuid)
       when 'booking' then (select v.shop_id from bookings b join vehicles v on v.id = b.vehicle_id where b.id = $5::uuid)
       when 'vehicle_document' then (select v.shop_id from vehicle_documents d join vehicles v on v.id = d.vehicle_id where d.id = $5::uuid)
     end))`,
    [
      entry.actorType,
      entry.actorId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.shopId ?? null,
    ],
  );
}
