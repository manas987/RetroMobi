import { describe, expect, test } from "bun:test";
import { best, bucketize, compare, mergeReports, runningTotals, share, weekdayAverages, type Day, type Summary } from "./reportMath";
import { previousRange, rangeDates } from "./ranges";

const day = (date: string, online = 0, walkin = 0, onlineEarnings = 0, walkinCash = 0): Day => ({ date, online, walkin, onlineEarnings, walkinCash });
// 10:00 IST on a day, as an instant.
const at = (d: string) => new Date(`${d}T10:00:00+05:30`);

describe("report maths", () => {
  test("months add up across a year boundary, in order", () => {
    const b = bucketize([day("2025-12-30", 1, 0, 100), day("2025-12-31", 0, 1, 0, 50), day("2026-01-01", 2, 0, 300)], "month");
    expect(b.map((x) => [x.key, x.online, x.walkin, x.onlineEarnings, x.walkinCash])).toEqual([
      ["2025-12", 1, 1, 100, 50],
      ["2026-01", 2, 0, 300, 0],
    ]);
  });

  test("running totals keep adding", () => {
    expect(runningTotals([100, 0, 50, 25])).toEqual([100, 100, 150, 175]);
  });

  test("weekday averages are Monday first", () => {
    // 2026-11-09 is a Monday; two Mondays with 2 and 4 rides average 3.
    const avg = weekdayAverages([day("2026-11-09", 2), day("2026-11-14", 1), day("2026-11-16", 4)]);
    expect(avg[0]).toBe(3);
    expect(avg[5]).toBe(1);
    expect(avg[6]).toBe(0);
  });

  test("comparing against nothing gives no percentage", () => {
    expect(compare(500, 0)).toEqual({ diff: 500, pct: null, direction: "up" });
    expect(compare(800, 1000)).toEqual({ diff: -200, pct: -20, direction: "down" });
    expect(compare(0, 0).direction).toBe("same");
  });

  test("best ignores zeros; shares add up to 100", () => {
    expect(best([0, 0], (x) => x)).toBeNull();
    expect(best([3, 9, 4], (x) => x)).toBe(9);
    expect(share(2, 1)).toEqual({ online: 67, walkin: 33 });
    expect(share(0, 0)).toBeNull();
  });

  test("this month so far is compared with last month by the same date", () => {
    expect(rangeDates("month", at("2026-03-31"))).toEqual({ from: "2026-03-01", to: "2026-03-31" });
    expect(previousRange("month", at("2026-03-31"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousRange("month", at("2026-01-13"))).toEqual({ from: "2025-12-01", to: "2025-12-13" });
    expect(previousRange("12m", at("2026-11-13"))).toEqual({ from: "2024-12-01", to: "2025-11-13" });
    expect(previousRange("all", at("2026-11-13"))).toBeNull();
  });

  test("all branches merge by date and keep each vehicle's shop", () => {
    const v = (id: string) => ({ id, registrationNumber: id, make: "Honda", model: "Activa", busyDays: 1, rides: 1 });
    const a: Summary = { from: "2026-11-01", to: "2026-11-02", rangeDays: 2, days: [day("2026-11-01", 1, 0, 100), day("2026-11-02")], vehicles: [v("A1")] };
    const b: Summary = { from: "2026-11-02", to: "2026-11-02", rangeDays: 1, days: [day("2026-11-02", 0, 2, 0, 400)], vehicles: [v("B1")] };
    const r = mergeReports([{ shopName: "Rishikesh", current: a, previous: null }, { shopName: "Mussoorie", current: b, previous: null }]);
    expect(r.days.map((d) => [d.date, d.online, d.walkin, d.onlineEarnings, d.walkinCash])).toEqual([
      ["2026-11-01", 1, 0, 100, 0],
      ["2026-11-02", 0, 2, 0, 400],
    ]);
    expect(r.vehicles.map((x) => [x.id, x.shopName])).toEqual([["A1", "Rishikesh"], ["B1", "Mussoorie"]]);
    expect(r.prevDays).toBeNull();
  });
});
