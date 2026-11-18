import { expect, test } from "bun:test";
import { overviewSchedule } from "./schedule";

test("home separates overdue work from today's IST schedule without duplicating bookings", () => {
  const now = new Date("2031-03-10T12:00:00+05:30");
  const booking = (id, pickup, ret, collected = false) => ({
    id, status: "CONFIRMED", scheduled_pickup_at: pickup, scheduled_return_at: ret,
    actual_pickup_at: collected ? pickup : null,
  });
  const data = overviewSchedule([
    booking("old", "2031-03-08T10:00:00+05:30", "2031-03-12T10:00:00+05:30"),
    booking("today", "2031-03-09T19:00:00Z", "2031-03-12T10:00:00+05:30"),
    booking("late-return", "2031-03-08T10:00:00+05:30", "2031-03-10T11:00:00+05:30", true),
    booking("return", "2031-03-08T10:00:00+05:30", "2031-03-10T18:00:00+05:30", true),
    booking("future", "2031-03-12T10:00:00+05:30", "2031-03-13T10:00:00+05:30"),
  ], now);
  expect(data.overdue.map(({ b }) => b.id)).toEqual(["old", "late-return"]);
  expect(data.today.map(({ b }) => b.id)).toEqual(["today", "return"]);
  expect(data.upcoming.map(({ b }) => b.id)).toEqual(["future"]);
});
