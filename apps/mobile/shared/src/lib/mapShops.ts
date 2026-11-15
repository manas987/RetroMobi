import type { SearchResult } from "./types";

/** A shop gets one marker, priced from the results currently on screen. */
export function mapShops(results: SearchResult[]) {
  const shops = new Map<string, {
    shopId: string;
    name: string;
    latitude: number;
    longitude: number;
    pricePerDay: number;
    results: SearchResult[];
  }>();
  for (const result of results) {
    const offer = result.primaryOffer;
    if (offer.shopLatitude == null || offer.shopLongitude == null) continue;
    const shop = shops.get(offer.shopId);
    if (shop) {
      shop.pricePerDay = Math.min(shop.pricePerDay, offer.pricePerDay);
      shop.results.push(result);
    } else {
      shops.set(offer.shopId, {
        shopId: offer.shopId, name: offer.shopName,
        latitude: offer.shopLatitude, longitude: offer.shopLongitude,
        pricePerDay: offer.pricePerDay, results: [result],
      });
    }
  }
  return [...shops.values()];
}
