import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import { handleSessionExpiry, portalFetch, PortalApiError } from "../../lib/portal";
import { translate, hasKey, type Lang } from "../../i18n";

/**
 * Merchant reads through TanStack Query: cached per path, deduplicated,
 * refetched when the tab regains focus. Replaces usePortalQuery's
 * `?r=${reloadKey}` cache-busting -- after a mutation, call `invalidate()`.
 */
export function useMerchantQuery<T>(
  path: string | null,
  token: string,
  opts: {
    refetchInterval?: number;
    /** Keep showing the last result while a new path loads (a range switch), instead of a skeleton. */
    keepPrevious?: boolean;
  } = {},
) {
  return useQuery<T, Error>({
    ...merchantQuery<T>(path ?? "", token, opts.keepPrevious),
    enabled: path != null,
    refetchInterval: opts.refetchInterval,
  });
}

/** The same query as `useMerchantQuery`, for `useQueries` (one request per shop). */
export function merchantQuery<T>(path: string, token: string, keepPrevious = false) {
  return {
    queryKey: ["merchant", path] as const,
    queryFn: async () => {
      try {
        return await portalFetch<T>("merchant", path, { token });
      } catch (err) {
        handleSessionExpiry("merchant", err);
        throw err;
      }
    },
    placeholderData: keepPrevious ? keepPreviousData : undefined,
    // A 4xx won't fix itself by retrying; a dropped connection on hill data might.
    retry: (count: number, err: Error) => !(err instanceof PortalApiError && err.status < 500) && count < 2,
  };
}

/** Refetch every merchant query -- small shops, so blunt is fine. */
export function useInvalidateMerchant() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["merchant"] });
}

/** A server error in the merchant's language: known codes are translated,
 *  anything else falls back to the generic line rather than raw English. */
export function errorText(lang: Lang, err: unknown): string {
  if (err instanceof PortalApiError && err.code && hasKey(`errors.${err.code}`)) {
    return translate(lang, `errors.${err.code}`);
  }
  return translate(lang, "errors.generic");
}

/**
 * One URL query param as page state (tab, view, open sheet), so links from
 * other pages land exactly and a refresh keeps the place. Writes replace the
 * history entry; `null` removes the key.
 */
export function useUrlParam<K extends string>(key: string, allowed: readonly K[], fallback: K): [K, (v: K | null) => void] {
  const [raw, set] = useUrlString(key);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as K) : fallback;
  return [value, set];
}

/** Free-form variant for ids (`?booking=<id>`). */
export function useUrlString(key: string): [string | null, (v: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const set = (v: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v == null || v === "") next.delete(key);
        else next.set(key, v);
        return next;
      },
      { replace: true },
    );
  return [params.get(key), set];
}
