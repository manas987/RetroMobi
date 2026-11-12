import type { Pool } from "pg";

export type ActivityKind = "bookings" | "vehicles" | "staff" | "shop";

const KIND_FILTER: Record<ActivityKind, string> = {
  bookings: `a.entity_type = 'booking'`,
  vehicles: `a.entity_type in ('vehicle','vehicle_document')`,
  staff: `(a.action like 'shop.member_%' or a.action like 'shop.invite_%')`,
  shop: `(a.entity_type = 'shop' and a.action not like 'shop.member_%' and a.action not like 'shop.invite_%')`,
};

const PAGE = 50;

export async function listActivity(
  pool: Pool,
  shopId: string,
  filters: { before?: Date; actorId?: string; kind?: ActivityKind },
) {
  // KIND_FILTER values are constants chosen by key, never user text.
  const kindSql = filters.kind ? KIND_FILTER[filters.kind] : "true";
  const { rows } = await pool.query(
    `select a.id, a.action, a.entity_type, a.entity_id, a.after, a.created_at, a.actor_type, a.actor_id,
            mu.name as actor_name, sm.role as actor_role,
            b.id as booking_id, v.id as vehicle_id, v.registration_number, vm.make, vm.model,
            coalesce(r.name, u.name, b.walkin_name) as customer_name
       from audit_logs a
       left join merchant_users mu on a.actor_type = 'MERCHANT' and mu.id = a.actor_id
       left join shop_members sm on sm.shop_id = a.shop_id and sm.merchant_user_id = a.actor_id and sm.deleted_at is null
       left join bookings b on a.entity_type = 'booking' and b.id = a.entity_id
       left join vehicles v on v.id = case when a.entity_type = 'vehicle' then a.entity_id else b.vehicle_id end
       left join vehicle_models vm on vm.id = v.model_id
       left join riders r on r.id = b.rider_id
       left join booking_groups g on g.id = b.group_id
       left join users u on u.id = g.user_id
      where a.shop_id = $1
        and ($2::timestamptz is null or a.created_at < $2)
        and ($3::uuid is null or a.actor_id = $3)
        and (${kindSql})
      order by a.created_at desc, a.id desc
      limit ${PAGE + 1}`,
    [shopId, filters.before ?? null, filters.actorId ?? null],
  );
  return {
    items: rows.slice(0, PAGE),
    nextBefore: rows.length > PAGE ? rows[PAGE - 1].created_at : null,
  };
}
