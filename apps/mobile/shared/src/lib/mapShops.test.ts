import { expect, test } from "bun:test";
import { mapShops } from "./mapShops";
import type { SearchResult } from "./types";

function result(shopId: string, price: number, latitude: number | null = 30): SearchResult {
  return {
    model: {
      id: `model-${price}`, make: "Test", model: "Scooter", imageKey: null,
      fuelType: "PETROL", engineCc: 125, bodyType: "SCOOTER", seatingCapacity: 2,
    },
    primaryOffer: {
      vehicleId: `vehicle-${price}`, shopId, shopName: shopId, shopPhone: null,
      shopAddress: "", shopLatitude: latitude, shopLongitude: 78,
      pricePerDay: price, totalAmount: price, securityDeposit: 0,
      rating: null, reviewCount: 0, distanceKm: null, licence: null,
    },
    offerCount: 1, offerVehicleIds: [`vehicle-${price}`],
  };
}

test("one shop marker uses the cheapest matching rate and retains every vehicle", () => {
  const results = [result("a", 70000), result("a", 50000), result("b", 90000)];
  const shops = mapShops(results);
  expect(shops).toHaveLength(2);
  expect(shops[0]?.pricePerDay).toBe(50000);
  expect(shops[0]?.results).toEqual(results.slice(0, 2));
  expect(results[0]?.primaryOffer.pricePerDay).toBe(70000);
});

test("missing coordinates are skipped, while zero coordinates remain valid", () => {
  const missingLongitude = result("missing-longitude", 60000);
  missingLongitude.primaryOffer.shopLongitude = null;
  expect(mapShops([result("missing-latitude", 50000, null), missingLongitude])).toEqual([]);
  expect(mapShops([result("zero", 50000, 0)])[0]?.latitude).toBe(0);
  expect(mapShops([])).toEqual([]);
});
