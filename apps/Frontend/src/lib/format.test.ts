import { test, expect } from "bun:test";
import { dateLabel, enumLabel, phoneLabel, reviewTimeLabel, rupees } from "./format";

test("reviews use relative times today, Yesterday, and the date for older posts", () => {
  const now = new Date("2026-11-12T08:00:00+05:30");
  expect(reviewTimeLabel("2026-11-12T07:59:45+05:30", now)).toBe("Just now");
  expect(reviewTimeLabel("2026-11-12T07:52:00+05:30", now)).toBe("8 minutes ago");
  expect(reviewTimeLabel("2026-11-12T05:30:00+05:30", now)).toBe("2 hours ago");
  expect(reviewTimeLabel("2026-11-11T23:55:00+05:30", now)).toBe("Yesterday");
  expect(reviewTimeLabel("2026-11-10T23:55:00+05:30", now)).toBe("10 Nov 2026");
  expect(reviewTimeLabel("invalid", now)).toBeNull();
});

test("enumLabel turns a DB enum into a sentence", () => {
  expect(enumLabel("BANK_PROOF")).toBe("Bank proof");
  expect(enumLabel("IN_PROGRESS")).toBe("In progress");
  expect(enumLabel("OWNER")).toBe("Owner");
  expect(enumLabel(null)).toBe("—");
  expect(enumLabel("")).toBe("—");
});

test("enumLabel keeps acronyms upper-case", () => {
  // "Gstin" and "Rc" read as bugs to anyone who knows the document.
  expect(enumLabel("GSTIN")).toBe("GSTIN");
  expect(enumLabel("PAN")).toBe("PAN");
  expect(enumLabel("RC")).toBe("RC");
  expect(enumLabel("PUC")).toBe("PUC");
  expect(enumLabel("GST_RATE")).toBe("GST rate");
  expect(enumLabel("BANK_PROOF")).toBe("Bank proof");
});

test("dateLabel drops the meaningless midnight a Postgres date serialises with", () => {
  // What `pg` actually hands back for a `date` column, via JSON.
  expect(dateLabel("2026-04-01T00:00:00.000Z")).toBe("1 Apr 2026");
  expect(dateLabel("2026-04-01")).toBe("1 Apr 2026");
});

test("dateLabel keeps the stored day regardless of the viewer's timezone", () => {
  // Parsed at local noon: UTC midnight would render as 31 Mar anywhere west
  // of Greenwich, which is the bug this exists to avoid.
  expect(dateLabel("2026-04-01T00:00:00.000Z")).toContain("1 Apr");
});

test("dateLabel passes through anything that is not a date", () => {
  expect(dateLabel("not a date")).toBe("not a date");
  expect(dateLabel(null)).toBe("—");
});

test("rupees still formats integer paise", () => {
  expect(rupees(50_000)).toBe("₹500");
});

test("Indian mobile numbers are grouped 5 + 5, others are untouched", () => {
  expect(phoneLabel("+917039408159")).toBe("+91\u00a070394\u00a008159");
  expect(phoneLabel("+14155550100")).toBe("+14155550100");
  expect(phoneLabel("7039408159")).toBe("7039408159");
});
