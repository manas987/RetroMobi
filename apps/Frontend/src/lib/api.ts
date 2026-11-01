import { useQuery } from "@tanstack/react-query";
import { toSearchParams } from "./searchParams";
import type { SearchCriteria, SearchResult, ShopProfile, VehicleDetail } from "./types";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? body.error ?? `request failed (${res.status})`);
  }
  return res.json();
}

/** `coords`, when present, is sent as a one-off query param for this request
 *  only — never written into `criteria`/the URL, so it never ends up in
 *  browser history or a shareable link. */
export function useSearch(criteria: SearchCriteria, coords?: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: ["search", criteria, coords],
    queryFn: () => {
      const params = new URLSearchParams(toSearchParams(criteria));
      if (coords) {
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));
      } else {
        // Without coordinates the backend can't compute a distance, so a
        // leftover maxDistanceKm would filter out every result.
        params.delete("maxDistanceKm");
        if (params.get("sort") === "distance") params.delete("sort");
      }
      return getJson<{ results: SearchResult[]; total: number; priceHistogram: number[] }>(
        `/api/user/search?${params.toString()}`,
      );
    },
    enabled: criteria.city.length > 0 || !!criteria.shopId,
    placeholderData: (prev) => prev,
  });
}

export function useVehicleDetail(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => getJson<VehicleDetail>(`/api/user/search/vehicle/${vehicleId}`),
    enabled: !!vehicleId,
  });
}

export function useShopProfile(shopId: string | undefined) {
  return useQuery({
    queryKey: ["shop", shopId],
    queryFn: () => getJson<ShopProfile>(`/api/user/shops/${shopId}`),
    enabled: !!shopId,
  });
}
