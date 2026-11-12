import { test, expect } from "bun:test";
import { activeFilters, bodyTypeLabel, CLEAR_SEARCH_FILTERS, parseSearchParams, toSearchParams } from "./searchParams";

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
