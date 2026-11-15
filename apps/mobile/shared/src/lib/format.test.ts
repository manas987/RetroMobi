import { test, expect } from "bun:test";
import { dateLabel, enumLabel, phoneLabel, reviewTimeLabel, rupees } from "./format";
import { splitPhone, validPhone } from "./countries";

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

test("splitPhone and validPhone keep the country apart from the number", () => {
  expect(splitPhone("+919812340001")).toMatchObject({ country: { code: "IN" }, local: "9812340001" });
  expect(splitPhone("+9779812345678")).toMatchObject({ country: { code: "NP" }, local: "9812345678" });
  expect(splitPhone("")).toMatchObject({ country: { code: "IN" }, local: "" });
  expect(validPhone("+919812340001")).toBe(true);
  expect(validPhone("+91981234000")).toBe(false);
  expect(validPhone("+6591234567")).toBe(true);
});

// ---- app-only: the Intl-free formatters ----
import { formatClock, formatIstDate, formatIstTime, groupDigits, istDay, rentalDays } from "./format";

test("rupees groups the Indian way and handles negatives", () => {
  expect(rupees(12_345_600)).toBe("₹1,23,456");
  expect(rupees(100_000_000)).toBe("₹10,00,000");
  expect(rupees(99_900)).toBe("₹999");
  expect(rupees(0)).toBe("₹0");
  expect(rupees(-250_000)).toBe("-₹2,500");
  expect(groupDigits(1234567)).toBe("12,34,567");
});

test("istDay is the IST calendar date, whatever the phone's timezone", () => {
  // 20:00 UTC is already the next day in India.
  expect(istDay(new Date("2026-11-14T20:00:00Z"))).toBe("2026-11-15");
  expect(istDay(new Date("2026-11-14T18:29:59Z"))).toBe("2026-11-14");
  expect(istDay(new Date("2026-11-14T18:30:00Z"))).toBe("2026-11-15");
});

test("rentalDays counts IST days touched", () => {
  expect(rentalDays("2026-11-13T10:00:00+05:30", "2026-11-13T22:00:00+05:30")).toBe(1);
  expect(rentalDays("2026-11-13T10:00:00+05:30", "2026-11-15T09:00:00+05:30")).toBe(3);
});

test("formatIstDate shows only the parts asked for, in IST", () => {
  const at = "2026-11-14T20:00:00Z"; // Sunday 15 Nov, 1:30 am IST
  expect(formatIstDate(at)).toBe("15 Nov");
  expect(formatIstDate(at, { weekday: "short", day: "numeric", month: "short" })).toBe("Sun, 15 Nov");
  expect(formatIstDate(at, { weekday: "long", day: "numeric", month: "long" })).toBe("Sunday, 15 November");
  expect(formatIstDate(at, { month: "long", year: "numeric" })).toBe("November 2026");
  expect(formatIstDate(at, { weekday: "short" })).toBe("Sun");
  expect(formatIstDate(at, { day: "numeric" })).toBe("15");
  expect(formatIstDate(at, { weekday: "long", day: "numeric", month: "long" }, "hi")).toBe("रविवार, 15 नवंबर");
  expect(formatIstDate(null)).toBe("—");
  expect(formatIstDate("nonsense")).toBe("—");
});

test("formatIstTime is 12-hour in English and names the part of day in Hindi", () => {
  expect(formatIstTime("2026-11-15T13:35:00Z")).toBe("7:05 pm");
  expect(formatIstTime("2026-11-15T18:30:00Z")).toBe("12:00 am");
  expect(formatIstTime("2026-11-15T06:30:00Z")).toBe("12:00 pm");
  expect(formatIstTime("2026-11-15T13:35:00Z", "hi")).toBe("शाम 7:05");
  expect(formatIstTime("2026-11-15T03:30:00Z", "hi")).toBe("सुबह 9:00");
  expect(formatClock("22:15")).toBe("10:15 PM");
});
