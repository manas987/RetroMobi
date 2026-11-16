import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api, decodeJwtSubject, errorMessage, queryClient, useSession } from "@retromobi/mobile-shared";

export function usePrivate<T>(path: string | null, refetchInterval?: number) {
  const session = useSession();
  return useQuery<T, Error>({
    queryKey: ["rider", path, session && decodeJwtSubject(session.accessToken)],
    enabled: !!session && !!path,
    refetchInterval: ({ state }) => {
      if (!refetchInterval) return false;
      if (state.error instanceof ApiError && state.error.status === 429) {
        const until = state.errorUpdatedAt + (state.error.retryAfterSeconds ?? 60) * 1000;
        return Math.max(refetchInterval, until - Date.now());
      }
      return refetchInterval;
    },
    queryFn: ({ signal }) => api<T>(path!, { signal }),
  });
}

export function useWrite() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>, onError?: (err: unknown) => string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await fn(); }
    catch (err) { setError(onError?.(err) ?? errorMessage(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  return { busy, error, run };
}

export function refreshRiderData(path?: string) {
  return queryClient.invalidateQueries({ queryKey: path ? ["rider", path] : ["rider"] });
}
