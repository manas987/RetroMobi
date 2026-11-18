import { describe, test, expect } from "bun:test";
import { combine, formatDuration, splitIso, tapDay } from "./dateRange";

const day = (d: number) => new Date(2026, 10, d);

describe("tapDay", () => {
  test("the first tap is held as the pick-up and commits nothing", () => {
    expect(tapDay(null, day(12))).toEqual({ pending: day(12), commit: null });
  });

  test("a later tap completes the range", () => {
    expect(tapDay(day(12), day(15))).toEqual({ pending: null, commit: { from: day(12), to: day(15) } });
  });

  test("tapping the pick-up day again makes a same-day rental", () => {
    expect(tapDay(day(12), day(12)).commit).toEqual({ from: day(12), to: day(12) });
  });

  test("a tap before the pick-up starts over from that day", () => {
    expect(tapDay(day(12), day(9))).toEqual({ pending: day(9), commit: null });
  });
});

test("formatDuration reads as hours under a day and days after", () => {
  expect(formatDuration(new Date(2026, 10, 12, 10), new Date(2026, 10, 12, 22))).toBe("12 hrs");
  expect(formatDuration(new Date(2026, 10, 12, 10), new Date(2026, 10, 14, 10))).toBe("2d");
  expect(formatDuration(new Date(2026, 10, 12, 10), new Date(2026, 10, 14, 14))).toBe("2d 4h");
});

test("splitIso and combine round-trip a local date and time", () => {
  const at = new Date(2026, 10, 12, 9, 5);
  const { date, time } = splitIso(at.toISOString());
  expect(time).toBe("09:05");
  expect(combine(date, "18:30").getHours()).toBe(18);
});
