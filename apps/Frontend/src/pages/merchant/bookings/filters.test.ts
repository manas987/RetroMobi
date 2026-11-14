import { describe, expect, test } from "bun:test";
import { daysCovered, groupByDay, rowsForTab, TAB_STAGES, weekSegments, withFilters, type Tab } from "./filters";
import type { BookingStage } from "../../../lib/bookingStage";

// Noon IST on Sat 15 Nov 2025.
const NOW = new Date("2025-11-15T12:00:00+05:30");

describe("tab membership", () => {
  const expected: Record<BookingStage, Tab[]> = {
    AWAITING_PAYMENT: [],
    UPCOMING: ["upcoming", "all"],
    PICKUP_TODAY: ["today", "all"],
    PICKUP_LATE: ["today", "late", "all"],
    ON_RIDE: ["onride", "all"],
    RETURN_TODAY: ["today", "onride", "all"],
    OVERDUE: ["today", "onride", "late", "all"],
    RETURNED: ["finished", "all"],
    DEPOSIT_CLAIMED: ["finished", "all"],
  };
  for (const [stage, tabs] of Object.entries(expected)) {
    test(stage, () => {
      const inTabs = (Object.keys(TAB_STAGES) as Tab[]).filter((t) => TAB_STAGES[t].includes(stage as BookingStage));
      expect(inTabs.sort()).toEqual([...tabs].sort());
    });
  }
});

describe("rowsForTab", () => {
  const row = (id: string, pickup: string, ret: string, extra = {}) => ({
    id, status: "CONFIRMED", scheduled_pickup_at: pickup, scheduled_return_at: ret, ...extra,
  });
  test("today puts late ones first, then by time", () => {
    const rows = [
      row("a", "2025-11-15T16:00:00+05:30", "2025-11-15T20:00:00+05:30"),
      row("b", "2025-11-15T09:00:00+05:30", "2025-11-15T11:00:00+05:30"),
      row("c", "2025-11-13T09:00:00+05:30", "2025-11-14T09:00:00+05:30"), // never picked up: late
    ];
    expect(rowsForTab(rows, "today", NOW).map((x) => x.b.id)).toEqual(["c", "b", "a"]);
  });
  test("HOLD is never shown", () => {
    const hold = row("h", "2025-11-15T16:00:00+05:30", "2025-11-15T20:00:00+05:30", { status: "HOLD" });
    expect(rowsForTab([hold], "all", NOW)).toEqual([]);
  });
});

describe("groupByDay", () => {
  test("groups by IST day around midnight", () => {
    const rows = [
      { at: "2025-11-15T18:29:00Z" }, // 23:59 IST on the 15th
      { at: "2025-11-15T18:31:00Z" }, // 00:01 IST on the 16th
      { at: "2025-11-15T01:00:00Z" }, // 06:30 IST on the 15th
    ];
    const g = groupByDay(rows, (r) => r.at);
    expect(g.map((x) => [x.day, x.rows.length])).toEqual([["2025-11-15", 2], ["2025-11-16", 1]]);
  });
});

describe("daysCovered", () => {
  test("a 3-day ride covers three days, inclusive", () => {
    const b = { scheduled_pickup_at: "2025-11-14T10:00:00+05:30", scheduled_return_at: "2025-11-16T18:00:00+05:30" };
    expect(daysCovered(b)).toEqual(["2025-11-14", "2025-11-15", "2025-11-16"]);
  });
  test("uses the actual return when there is one", () => {
    const b = { scheduled_pickup_at: "2025-11-14T10:00:00+05:30", scheduled_return_at: "2025-11-16T18:00:00+05:30", actual_return_at: "2025-11-15T09:00:00+05:30" };
    expect(daysCovered(b)).toEqual(["2025-11-14", "2025-11-15"]);
  });
});

test("withFilters sends only what is set", () => {
  expect(withFilters(new URLSearchParams({ status: "CONFIRMED" }), { q: " UK07 ", source: "", vehicleId: "" }).toString()).toBe("status=CONFIRMED&q=UK07");
});

describe("weekSegments", () => {
  // Mon 10 .. Sun 16 Nov 2025.
  const week = ["2025-11-10", "2025-11-11", "2025-11-12", "2025-11-13", "2025-11-14", "2025-11-15", "2025-11-16"];
  const ride = (id: string, from: string, to: string) => ({
    b: { id, scheduled_pickup_at: `${from}T10:00:00+05:30`, scheduled_return_at: `${to}T18:00:00+05:30` },
    stage: "UPCOMING" as BookingStage,
  });
  const pick = (s: ReturnType<typeof weekSegments>[number]) => ({ id: s.b.id, start: s.start, span: s.span, lane: s.lane, contLeft: s.contLeft, contRight: s.contRight });

  test("a ride across the week edge is cut at the edge, flat on that side", () => {
    expect(weekSegments([ride("a", "2025-11-08", "2025-11-11"), ride("b", "2025-11-15", "2025-11-18")], week).map(pick)).toEqual([
      { id: "a", start: 0, span: 2, lane: 0, contLeft: true, contRight: false },
      { id: "b", start: 5, span: 2, lane: 0, contLeft: false, contRight: true },
    ]);
  });

  test("overlapping rides take separate rows; a free row is reused", () => {
    const segs = weekSegments([ride("long", "2025-11-11", "2025-11-14"), ride("mid", "2025-11-12", "2025-11-12"), ride("late", "2025-11-15", "2025-11-15")], week);
    expect(segs.map(pick)).toEqual([
      { id: "long", start: 1, span: 4, lane: 0, contLeft: false, contRight: false },
      { id: "mid", start: 2, span: 1, lane: 1, contLeft: false, contRight: false },
      { id: "late", start: 5, span: 1, lane: 0, contLeft: false, contRight: false },
    ]);
  });

  test("a ride outside the week gives no bar", () => {
    expect(weekSegments([ride("x", "2025-11-01", "2025-11-02")], week)).toEqual([]);
  });
});
