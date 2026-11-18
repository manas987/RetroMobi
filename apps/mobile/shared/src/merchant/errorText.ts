import { ApiError, NetworkError } from "../api/client";
import { hasKey, translate } from "../i18n";
import type { Lang } from "../lib/format";

/**
 * A server error in the merchant's language (the website's `errorText` in
 * pages/merchant/query.ts): known codes are translated, anything else falls
 * back to the generic line rather than raw English.
 */
export function errorText(lang: Lang, err: unknown): string {
  if (err instanceof NetworkError) return translate(lang, "common.couldntLoad");
  if (err instanceof ApiError && err.code && hasKey(`errors.${err.code}`)) return translate(lang, `errors.${err.code}`);
  return translate(lang, "errors.generic");
}
