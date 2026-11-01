import { useEffect, useState } from "react";

// Module-level, not per-component -- many cards on one page share a model,
// and the signed URL is good for an hour, so one fetch per model per session
// is enough. Caches the miss too (null) so a model with no photo isn't refetched.
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function resolve(modelId: string): Promise<string | null> {
  if (cache.has(modelId)) return cache.get(modelId)!;
  if (inflight.has(modelId)) return inflight.get(modelId)!;

  const promise = fetch(`/api/user/search/models/${modelId}/image`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { url: string } | null) => data?.url ?? null)
    .catch(() => null)
    .finally(() => inflight.delete(modelId));
  inflight.set(modelId, promise);

  const url = await promise;
  cache.set(modelId, url);
  return url;
}

/** Resolves a model's stock photo to a signed URL, or null if it has none
 *  (or a fetch fails, e.g. the dev-fallback storage that doesn't resolve). */
export function useModelImage(modelId: string | null, hasImageKey: boolean): string | null {
  const [url, setUrl] = useState<string | null>(() => (modelId ? (cache.get(modelId) ?? null) : null));

  useEffect(() => {
    if (!modelId || !hasImageKey) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    resolve(modelId).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [modelId, hasImageKey]);

  return url;
}
