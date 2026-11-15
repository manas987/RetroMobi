import { hasKey, type TKey, type TVars } from "../i18n";
import { phoneLabel } from "../lib/format";

export interface ActivityItem {
  id: string;
  action: string;
  after: Record<string, unknown> | null;
  created_at: string;
  actor_type: "CUSTOMER" | "MERCHANT" | "ADMIN" | "SYSTEM";
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  booking_id: string | null;
  vehicle_id: string | null;
  registration_number: string | null;
  make: string | null;
  model: string | null;
  customer_name: string | null;
}

type T = (key: TKey, vars?: TVars) => string;

export function actorName(item: ActivityItem, t: T): string {
  if (item.actor_type === "MERCHANT") return item.actor_name ?? t("staff.who_someone");
  if (item.actor_type === "CUSTOMER") return item.customer_name ?? t("staff.who_customer");
  return t("staff.who_retromobi");
}

/** One plain sentence for an audit row, in the merchant's language. */
export function activityText(item: ActivityItem, t: T): string {
  const status = item.after?.status;
  let key = `staff.act_${item.action.replace(/\./g, "_")}`;
  if (item.action === "vehicle.listing_changed") key += status === "ACTIVE" ? "_on" : "_off";
  else if (item.action.endsWith(".verification_decided")) key += status === "VERIFIED" ? "_approved" : "_rejected";
  else if (item.action === "booking.returned" && item.after?.claim) key += "_claim";
  if (!hasKey(key)) key = "staff.act_unknown";

  const role = item.after?.role;
  return t(key as TKey, {
    who: actorName(item, t),
    vehicle: item.registration_number ?? ([item.make, item.model].filter(Boolean).join(" ") || "—"),
    customer: item.customer_name ?? "—",
    // Staff rows: who was invited, and for what.
    phone: typeof item.after?.phone === "string" ? phoneLabel(item.after.phone) : "—",
    role: typeof role === "string" && hasKey(`common.role_${role}`) ? t(`common.role_${role}` as TKey) : "—",
    // A vehicle moved between branches.
    from: typeof item.after?.from === "string" ? item.after.from : "—",
    to: typeof item.after?.to === "string" ? item.after.to : "—",
  });
}
