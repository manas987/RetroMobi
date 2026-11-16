import { test, expect } from "bun:test";
import { activeFilters, bodyTypeLabel, CLEAR_SEARCH_FILTERS, defaultWindow, parseSearchParams, toSearchParams } from "./searchParams";

test("bodyType survives a URL round trip", () => {
  const criteria = parseSearchParams("?city=Dehradun&bodyType=SCOOTER,MOTORCYCLE");
  expect(criteria.bodyType).toEqual(["SCOOTER", "MOTORCYCLE"]);
  expect(new URLSearchParams(toSearchParams(criteria)).get("bodyType")).toBe("SCOOTER,MOTORCYCLE");
});

test("an absent bodyType stays absent rather than becoming an empty filter", () => {
  const criteria = parseSearchParams("?city=Dehradun");
  expect(criteria.bodyType).toBeUndefined();
  expect(new URLSearchParams(toSearchParams(criteria)).has("bodyType")).toBe(false);
});

test("clearing one bodyType chip keeps the others", () => {
  const criteria = parseSearchParams("?city=Dehradun&bodyType=SCOOTER,MOTORCYCLE");
  const chip = activeFilters(criteria).find((f) => f.key === "bodyType:SCOOTER");
  expect(chip?.label).toBe("Scooter");
  expect(chip?.clear.bodyType).toEqual(["MOTORCYCLE"]);
});

test("clearing Browse filters keeps the city, rental window and sort", () => {
  const criteria = parseSearchParams(
    "?city=Dehradun&pickupAt=2026-12-01T10:00:00Z&returnAt=2026-12-02T10:00:00Z&sort=rating&minRating=4&make=Honda&minPrice=100",
  );
  const cleared = new URLSearchParams(toSearchParams({ ...criteria, ...CLEAR_SEARCH_FILTERS }));
  expect(Object.fromEntries(cleared)).toEqual({
    city: criteria.city,
    pickupAt: criteria.pickupAt,
    returnAt: criteria.returnAt,
    sort: "rating",
  });
});

test("bodyTypeLabel formats values it was never told about", () => {
  expect(bodyTypeLabel("MOTORCYCLE")).toBe("Motorcycle");
  expect(bodyTypeLabel("QUADRICYCLE")).toBe("Quadricycle");
  expect(bodyTypeLabel("E_RICKSHAW")).toBe("E rickshaw");
});

// The server refuses a hold whose pickup has already passed, and the cart stores
// whatever window it was built with -- so a default of "today 10am" meant every
// cart assembled after 10am carried a dead window to checkout.
test("the default window is never in the past", () => {
  const { pickupAt, returnAt } = defaultWindow();
  expect(Date.parse(pickupAt)).toBeGreaterThan(Date.now());
  expect(Date.parse(returnAt)).toBeGreaterThan(Date.parse(pickupAt));
});

test("default dates roll at 10am IST, independent of the phone's local timezone", () => {
  expect(defaultWindow(new Date("2026-11-15T04:29:00Z")).pickupAt).toBe("2026-11-15T10:00:00+05:30");
  expect(defaultWindow(new Date("2026-11-15T04:30:00Z")).pickupAt).toBe("2026-11-16T10:00:00+05:30");
});
