import { useQuery } from "@tanstack/react-query";
import { api, ApiError, decodeJwtSubject, useSession } from "@retromobi/mobile-shared";

export function useMerchantQuery<T>(path: string | null, options?: { refetchInterval?: number; gcTime?: number }) {
  const session = useSession();
  const interval = options?.refetchInterval;
  return useQuery({
    queryKey: ["merchant", path, session && decodeJwtSubject(session.accessToken)],
    enabled: path !== null && session !== null,
    queryFn: ({ signal }) => api<T>(path!, { signal }),
    gcTime: options?.gcTime,
    refetchInterval: interval === undefined ? false : ({ state }) => {
      const error = state.error;
      if (error instanceof ApiError && error.status === 429) {
        return Math.max(interval, state.errorUpdatedAt + 1000 * (error.retryAfterSeconds ?? 30) - Date.now());
      }
      return interval;
    },
  });
}
