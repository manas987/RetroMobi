import type { Row } from "@retromobi/mobile-shared";
import { istDay } from "@retromobi/mobile-shared/src/lib/format";

export const vehicleName = (row: Row) => [row.make, row.model].filter(Boolean).join(" ");
export const pickupOnOrBefore = (row: Row, today: string) => {
  const date = new Date(String(row.scheduled_pickup_at));
  return Number.isFinite(date.getTime()) && istDay(date) <= today;
};
export const isPast = (row: Row) => !!(row.deleted_at || row.actual_return_at || row.status === "COMPLETED");
export const canReview = (row: Row) => row.status === "COMPLETED" && !!row.actual_return_at && !row.deleted_at && !row.has_review;
export const liveHold = (row: Row, now: number) => row.status === "HOLD" && !row.deleted_at &&
  row.payment_status !== "SUCCEEDED" && Date.parse(String(row.hold_expires_at)) > now;

export function groupBookings(rows: Row[], now: number) {
  const upcoming: Row[] = [];
  const past: Row[] = [];
  for (const row of rows) {
    const ongoing = row.status === "CONFIRMED" && (row.actual_pickup_at || Date.parse(String(row.scheduled_return_at)) > now);
    const paymentNeedsAttention = row.status === "HOLD" && row.payment_status === "SUCCEEDED";
    (isPast(row) || (!ongoing && !liveHold(row, now) && !paymentNeedsAttention) ? past : upcoming).push(row);
  }
  const upcomingDate = (row: Row) => Date.parse(String(row.actual_pickup_at ? row.scheduled_return_at : row.scheduled_pickup_at));
  const pastDate = (row: Row) => Date.parse(String(row.actual_return_at ?? row.deleted_at ?? row.scheduled_return_at));
  upcoming.sort((a, b) => Number(!!b.actual_pickup_at) - Number(!!a.actual_pickup_at) || upcomingDate(a) - upcomingDate(b));
  past.sort((a, b) => pastDate(b) - pastDate(a));
  return { upcoming, past };
}

export function bookingLabel(row: Row, now: number) {
  if (row.deleted_at) return { label: "Cancelled", tone: "bad" } as const;
  if (isPast(row)) return { label: "Completed", tone: "good" } as const;
  if (liveHold(row, now)) return { label: "Payment due", tone: "attention" } as const;
  if (row.actual_pickup_at) return { label: "In progress", tone: "good" } as const;
  if (row.status === "CONFIRMED" && Date.parse(String(row.scheduled_return_at)) <= now) {
    return { label: "Pickup missed", tone: "muted" } as const;
  }
  if (row.status === "CONFIRMED") return pickupOnOrBefore(row, istDay(new Date(now)))
    ? { label: "Awaiting pickup", tone: "attention" } as const : { label: "Confirmed", tone: "good" } as const;
  return { label: row.payment_status === "SUCCEEDED" ? "Payment received · booking not confirmed" : "Hold expired", tone: "muted" } as const;
}
