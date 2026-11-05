import { expect, test } from "bun:test";
import { missingSearchField } from "./SearchCapsule";

const date = new Date("2026-11-12T10:00:00+05:30");

test("search opens Where first when no destination is selected", () => {
  expect(missingSearchField("", null, null)).toBe("where");
  expect(missingSearchField("", date, date)).toBe("where");
});

test("search opens When if either date is missing", () => {
  expect(missingSearchField("Dehradun", null, null)).toBe("when");
  expect(missingSearchField("Dehradun", date, null)).toBe("when");
  expect(missingSearchField("Dehradun", null, date)).toBe("when");
});

test("a complete search needs no guidance", () => {
  expect(missingSearchField("Dehradun", date, date)).toBeNull();
});
