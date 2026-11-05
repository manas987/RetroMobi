import { expect, test } from "bun:test";
import { formatDateSummary } from "./dateRange";
import { stockPhotos } from "./stockPhoto";

const date = (value: string) => new Date(`${value}T10:00:00`);

test.each([
  [null, null, "Add dates"],
  ["2026-11-12", null, "Add dates"],
  [null, "2026-11-19", "Add dates"],
  ["2026-11-12", "2026-11-12", "12 Nov"],
  ["2026-11-12", "2026-11-19", "12–19 Nov"],
  ["2026-11-28", "2026-12-03", "28 Nov–3 Dec"],
  ["2026-12-28", "2027-01-03", "28 Dec 2026–3 Jan 2027"],
])("date summary %s to %s", (from, to, expected) => {
  const start = from ? date(from) : null;
  const end = to ? date(to) : null;
  const before = [start?.getTime(), end?.getTime()];
  expect(formatDateSummary(start, end)).toBe(expected);
  expect([start?.getTime(), end?.getTime()]).toEqual(before);
});

test("fallback galleries contain only the matching model", () => {
  const honda = stockPhotos("Honda", "Activa 6G");
  const ather = stockPhotos("Ather", "450X");
  expect(honda).toHaveLength(1);
  expect(ather).toHaveLength(1);
  expect(honda[0]).toContain("honda-activa-6g");
  expect(ather[0]).toContain("ather-450x");
  expect(honda).not.toEqual(ather);
  expect(stockPhotos("TVS", "Jupiter 125")).toEqual([]);
  expect(stockPhotos("Suzuki", "Access 125")).toEqual([]);
  expect(stockPhotos("Unknown", "Model")).toEqual([]);
});
