import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  opts: { refetchInterval?: number } = {},
) {
  return useQuery<T, Error>({
    queryKey: ["merchant", path],
    queryFn: async () => {
      try {
        return await portalFetch<T>("merchant", path!, { token });
      } catch (err) {
        handleSessionExpiry("merchant", err);
        throw err;
      }
    },
    enabled: path != null,
    refetchInterval: opts.refetchInterval,
    // A 4xx won't fix itself by retrying; a dropped connection on hill data might.
    retry: (count, err) => !(err instanceof PortalApiError && err.status < 500) && count < 2,
  });
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
