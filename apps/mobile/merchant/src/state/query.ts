import { useQuery } from "@tanstack/react-query";
import { api, decodeJwtSubject, useSession } from "@retromobi/mobile-shared";

export function useMerchantQuery<T>(path: string | null, options?: { refetchInterval?: number; gcTime?: number }) {
  const session = useSession();
  return useQuery({
    queryKey: ["merchant", path, session && decodeJwtSubject(session.accessToken)],
    enabled: path !== null && session !== null,
    queryFn: ({ signal }) => api<T>(path!, { signal }),
    ...options,
  });
}
