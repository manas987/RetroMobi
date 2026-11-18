import { expect, test } from "bun:test";
import { groupBookings } from "./bookings";

test("Upcoming keeps active rides and live holds, while Past includes completed and missed bookings", () => {
  const now = Date.parse("2026-11-16T12:30:00Z");
  const next = { status: "CONFIRMED", scheduled_pickup_at: "2026-11-17T08:00:00Z", scheduled_return_at: "2026-11-18T08:00:00Z" };
  const rows = [
    { ...next, id: "upcoming" },
    { ...next, id: "cancelled", deleted_at: "2026-11-16T12:00:00Z" },
    { ...next, id: "complete", status: "COMPLETED", actual_return_at: "2026-11-15T08:00:00Z" },
    { ...next, id: "missed", scheduled_return_at: "2026-11-14T08:00:00Z" },
    { ...next, id: "on-ride", actual_pickup_at: "2026-11-16T08:00:00Z" },
    { ...next, id: "hold", status: "HOLD", hold_expires_at: "2026-11-16T12:45:00Z" },
    { ...next, id: "paid-hold", status: "HOLD", payment_status: "SUCCEEDED", hold_expires_at: "2026-11-16T12:00:00Z" },
  ];
  const groups = groupBookings(rows, now);
  expect(groups.upcoming.map((row) => row.id)).toEqual(["on-ride", "upcoming", "hold", "paid-hold"]);
  expect(groups.past.map((row) => row.id)).toEqual(["cancelled", "complete", "missed"]);
});
