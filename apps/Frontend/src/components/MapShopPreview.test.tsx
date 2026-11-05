import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { MapShopPreview } from "./MapShopPreview";
import type { SearchResult } from "../lib/types";

function vehicle(id: string, price: number): SearchResult {
  return {
    model: {
      id, make: "Test", model: id, imageKey: null, fuelType: "PETROL",
      engineCc: 110, bodyType: "SCOOTER", seatingCapacity: 2,
    },
    primaryOffer: {
      vehicleId: id, shopId: "shop", shopName: "Test shop", shopPhone: null, shopAddress: "",
      shopLatitude: 30, shopLongitude: 78, pricePerDay: price, totalAmount: price,
      securityDeposit: 100000, rating: 4.3, reviewCount: 12, distanceKm: null, licence: null,
    },
    offerCount: 1, offerVehicleIds: [id],
  };
}

function render(results: SearchResult[]) {
  return renderToStaticMarkup(<Router ssrPath="/browse" ssrSearch="city=Dehradun&pickupAt=selected">
    <MapShopPreview results={results} onClose={() => {}} />
  </Router>);
}

test("shop summary shows its lowest daily price and option count without vehicle rows", () => {
  const results = [vehicle("expensive", 90000), vehicle("affordable", 50000)];
  results[0]!.offerVehicleIds = ["unit-1", "unit-2", "unit-3"];
  const html = render(results);
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-label="Shop details for Test shop"');
  expect(html.replace(/<[^>]*>/g, "")).toContain("2 vehicle options");
  expect(html).toContain("From");
  expect(html).toContain("/ day");
  expect(html).toContain("₹500");
  expect(html).not.toContain("₹900");
  expect(html).not.toContain("/vehicles/");
  expect(results[0]?.primaryOffer.vehicleId).toBe("expensive");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<ul");
  expect(html).not.toContain("shop-preview-row");
});

test("larger fleets remain a summary with one understated shop action", () => {
  const html = render([
    vehicle("expensive", 90000), vehicle("lowest", 40000), vehicle("middle", 60000),
    vehicle("second", 50000), vehicle("fourth", 80000),
  ]);
  expect(html.replace(/<[^>]*>/g, "")).toContain("5 vehicle options");
  expect(html).toContain("₹400");
  expect(html).toContain("View shop");
  expect(html.match(/<a /g)).toHaveLength(1);
  expect(html).not.toContain("glass-yellow");
  expect(html).not.toContain("/vehicles/");
});

test("shop preview includes its rating, close control and shop link preserving search", () => {
  const html = render([vehicle("only", 60000)]);
  expect(html).toContain("4.3");
  expect(html.replace(/<[^>]*>/g, "")).toContain("1 vehicle option");
  expect(html).toContain('aria-label="Close shop preview"');
  expect(html).toContain("₹600");
  expect(html).toContain('href="/shops/shop?city=Dehradun&amp;pickupAt=selected"');
});

test("empty shops and missing reviews have appropriate states", () => {
  const result = vehicle("only", 70000);
  result.primaryOffer.rating = null;
  result.primaryOffer.reviewCount = 0;
  expect(render([result])).toContain("No reviews yet");
  expect(render([result])).not.toContain("NaN");
  expect(render([])).toBe("");
});
