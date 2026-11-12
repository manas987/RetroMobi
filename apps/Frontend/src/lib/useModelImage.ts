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
    .then(async (data: { url: string } | null) => {
      if (!data?.url || data.url.startsWith("https://dev-fallback.local/")) return null;
      const image = new Image();
      image.src = data.url;
      await image.decode();
      return data.url;
    })
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
  const [loaded, setLoaded] = useState<{ modelId: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!modelId || !hasImageKey) return;
    let cancelled = false;
    resolve(modelId).then((u) => {
      if (!cancelled) setLoaded({ modelId, url: u });
    });
    return () => {
      cancelled = true;
    };
  }, [modelId, hasImageKey]);

  if (!modelId || !hasImageKey) return null;
  return loaded?.modelId === modelId ? loaded.url : cache.get(modelId) ?? null;
}
