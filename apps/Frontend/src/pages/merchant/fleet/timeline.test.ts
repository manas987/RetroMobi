import { describe, expect, test } from "bun:test";
import { dayRange, spanFor } from "./timeline";

const days = dayRange("2031-03-10", 7); // 10..16 March

describe("dayRange", () => {
  test("steps over a month end", () => {
    expect(dayRange("2031-02-27", 3)).toEqual(["2031-02-27", "2031-02-28", "2031-03-01"]);
  });
});

describe("spanFor", () => {
  test("inside the range", () => {
    expect(spanFor("2031-03-11T10:00:00+05:30", "2031-03-13T18:00:00+05:30", days)).toEqual({ start: 1, span: 3 });
  });
  test("a single-day booking spans one column", () => {
    expect(spanFor("2031-03-12T10:00:00+05:30", "2031-03-12T18:00:00+05:30", days)).toEqual({ start: 2, span: 1 });
  });
  test("starts before the range: clamped to the first column", () => {
    expect(spanFor("2031-03-08T10:00:00+05:30", "2031-03-11T18:00:00+05:30", days)).toEqual({ start: 0, span: 2 });
  });
  test("ends after the range: clamped to the last column", () => {
    expect(spanFor("2031-03-15T10:00:00+05:30", "2031-03-20T18:00:00+05:30", days)).toEqual({ start: 5, span: 2 });
  });
  test("crosses both edges", () => {
    expect(spanFor("2031-03-01T10:00:00+05:30", "2031-03-30T18:00:00+05:30", days)).toEqual({ start: 0, span: 7 });
  });
  test("wholly outside is null", () => {
    expect(spanFor("2031-03-01T10:00:00+05:30", "2031-03-09T18:00:00+05:30", days)).toBeNull();
    expect(spanFor("2031-03-17T10:00:00+05:30", "2031-03-18T18:00:00+05:30", days)).toBeNull();
  });
  test("IST midnight: 11:30pm IST on the 9th is still the 9th, so outside", () => {
    expect(spanFor("2031-03-09T08:00:00+05:30", "2031-03-09T23:30:00+05:30", days)).toBeNull();
  });
});
