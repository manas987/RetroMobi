import type { Row } from "../../../lib/portal";
import { bookingStage, type BookingStage } from "../../../lib/bookingStage";
import { useMerchantShop } from "../Layout";
import { useMerchantQuery } from "../query";

/**
 * Where a vehicle is right now, as the counter sees it when a walk-in arrives.
 * BLOCKED: taken off the road (servicing etc.). A paused listing is still FREE:
 * the shop rents unlisted vehicles at the counter too.
 */
export type Avail = "FREE" | "TODAY" | "OUT" | "BLOCKED";
export const AVAIL_TONE = { FREE: "good", TODAY: "attention", OUT: "info", BLOCKED: "muted" } as const;
export const AVAIL_ORDER: Record<Avail, number> = { FREE: 0, TODAY: 1, OUT: 2, BLOCKED: 3 };

export type Staged = { b: Row; stage: BookingStage };

/**
 * Every not-yet-returned booking with its stage. Same path and refresh as
 * Home, so every page reading it shares one cached request.
 */
export function useStagedBookings() {
  const { token, shopId } = useMerchantShop();
  const query = useMerchantQuery<{ bookings: Row[] }>(`/shops/${shopId}/bookings?status=CONFIRMED`, token, {
    refetchInterval: 30_000,
  });
  const now = new Date();
  const staged: Staged[] = (query.data?.bookings ?? []).map((b) => ({ b, stage: bookingStage(b, now) }));
  return { query, staged };
}

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
