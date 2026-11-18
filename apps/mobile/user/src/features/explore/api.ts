import { useQuery } from "@tanstack/react-query";
import { api, toSearchParams, type SearchCriteria, type SearchResult } from "@retromobi/mobile-shared";

export type Coords = { lat: number; lng: number };
export function usePublic<T>(path: string | null, staleTime?: number) {
  return useQuery({
    queryKey: ["public", path], enabled: path !== null, staleTime,
    queryFn: ({ signal }) => api<T>(path!, { auth: false, signal }),
  });
}

export function useSearch(criteria: SearchCriteria, coords?: Coords | null) {
  const params = new URLSearchParams(toSearchParams(criteria));
  if (coords) {
    params.set("lat", String(coords.lat)); params.set("lng", String(coords.lng));
  } else {
    params.delete("maxDistanceKm");
    if (params.get("sort") === "distance") params.delete("sort");
  }
  return usePublic<{ results: SearchResult[]; total: number; priceHistogram: number[] }>(criteria.city || criteria.shopId ? `/search?${params}` : null);
}

export function directions(lat: number | null, lng: number | null, address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat != null && lng != null ? `${lat},${lng}` : address)}`;
}

export const validPhoto = (value: string) => value.startsWith("https://") && !value.startsWith("https://dev-fallback.local/");
