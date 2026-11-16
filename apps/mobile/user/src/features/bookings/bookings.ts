import { istDay, type Row } from "@retromobi/mobile-shared";

export const vehicleName = (row: Row) => [row.make, row.model].filter(Boolean).join(" ");
export const pickupOnOrBefore = (row: Row, today: string) => {
  const date = new Date(String(row.scheduled_pickup_at));
  return Number.isFinite(date.getTime()) && istDay(date) <= today;
};
export const isPast = (row: Row) => !!(row.deleted_at || row.actual_return_at || row.status === "COMPLETED");
export const canReview = (row: Row) => row.status === "COMPLETED" && !!row.actual_return_at && !row.deleted_at && !row.has_review;
export const liveHold = (row: Row, now: number) => row.status === "HOLD" && !row.deleted_at &&
  row.payment_status !== "SUCCEEDED" && Date.parse(String(row.hold_expires_at)) > now;

export function groupBookings(rows: Row[], today: string) {
  const sections = [
    { title: "Active rentals", data: [] as Row[] },
    { title: "Upcoming", data: [] as Row[] },
    { title: "Past bookings", data: [] as Row[] },
  ] as const;
  for (const row of rows) {
    sections[isPast(row) ? 2 : row.status === "CONFIRMED" && (row.actual_pickup_at || pickupOnOrBefore(row, today)) ? 0 : 1].data.push(row);
  }
  const date = (row: Row, active: boolean) => Date.parse(String(active && row.actual_pickup_at ? row.scheduled_return_at : row.scheduled_pickup_at));
  sections[0].data.sort((a, b) => date(a, true) - date(b, true));
  sections[1].data.sort((a, b) => date(a, false) - date(b, false));
  return sections.filter((section) => section.data.length);
}

export function bookingLabel(row: Row, now: number) {
  if (row.deleted_at) return { label: "Cancelled", tone: "muted" } as const;
  if (isPast(row)) return { label: "Completed", tone: "muted" } as const;
  if (liveHold(row, now)) return { label: "Payment due", tone: "attention" } as const;
  if (row.actual_pickup_at) return { label: "In progress", tone: "good" } as const;
  if (row.status === "CONFIRMED") return pickupOnOrBefore(row, istDay(new Date(now)))
    ? { label: "Awaiting pickup", tone: "attention" } as const : { label: "Confirmed", tone: "good" } as const;
  return { label: row.payment_status === "SUCCEEDED" ? "Payment received · booking not confirmed" : "Hold expired", tone: "muted" } as const;
}
