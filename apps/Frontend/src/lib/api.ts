import { useQuery } from "@tanstack/react-query";
import { toSearchParams } from "./searchParams";
import type { SearchCriteria, SearchResult, VehicleDetail } from "./types";

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

export function useSearch(criteria: SearchCriteria) {
  return useQuery({
    queryKey: ["search", criteria],
    queryFn: () => getJson<{ results: SearchResult[]; total: number }>(`/api/user/search?${toSearchParams(criteria)}`),
    enabled: criteria.city.length > 0,
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
