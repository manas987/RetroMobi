import { expect, test } from "bun:test";
import { istBookingTime, monthDays, shiftMonth, splitIstBookingTime } from "./calendar";

test("month grid is Monday-first and includes the full last week", () => {
  const days = monthDays({ y: 2026, m: 11 });
  expect(days).toHaveLength(42);
  expect(days[0]).toBe("2026-10-26");
  expect(days.at(-1)).toBe("2026-12-06");
  expect(shiftMonth({ y: 2026, m: 12 }, 1)).toEqual({ y: 2027, m: 1 });
});

test("time picker writes and reads IST independently of device timezone", () => {
  const iso = new Date(istBookingTime("2026-11-15", "00:30")).toISOString();
  expect(iso).toBe("2026-11-14T19:00:00.000Z");
  expect(splitIstBookingTime(iso)).toEqual({ day: "2026-11-15", time: "00:30" });
});
