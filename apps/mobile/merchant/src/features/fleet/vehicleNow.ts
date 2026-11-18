import type { Row, BookingStage } from "@retromobi/mobile-shared";

/**
 * Where a vehicle is right now, as the counter sees it when a walk-in arrives.
 * BLOCKED: taken off the road (servicing etc.). A paused listing is still FREE:
 * the shop rents unlisted vehicles at the counter too.
 */
export type Avail = "FREE" | "TODAY" | "OUT" | "BLOCKED";
export const AVAIL_TONE = { FREE: "good", TODAY: "attention", OUT: "info", BLOCKED: "muted" } as const;
export const AVAIL_ORDER: Record<Avail, number> = { FREE: 0, TODAY: 1, OUT: 2, BLOCKED: 3 };

export type Staged = { b: Row; stage: BookingStage };

/** Out with a customer, blocked, going out today, or free -- plus the booking that decides it. */
export function vehicleNow(v: Row, staged: Staged[]) {
  const mine = staged.filter((x) => x.b.vehicle_id === v.id);
  const out = mine.find((x) => ["ON_RIDE", "RETURN_TODAY", "OVERDUE"].includes(x.stage));
  const goes = mine.find((x) => ["PICKUP_TODAY", "PICKUP_LATE"].includes(x.stage));
  const next = mine
    .filter((x) => x.stage === "UPCOMING")
    .sort((p, q) => String(p.b.scheduled_pickup_at).localeCompare(String(q.b.scheduled_pickup_at)))[0];
  const blockedUntil = v.blocked_until == null ? null : String(v.blocked_until);
  const avail: Avail = out ? "OUT" : blockedUntil ? "BLOCKED" : goes ? "TODAY" : "FREE";
  // A pickup the customer missed still holds the vehicle, but it's a problem, not "goes out".
  return { avail, blockedUntil, out, goes, next, late: out?.stage === "OVERDUE", missed: goes?.stage === "PICKUP_LATE" };
}
