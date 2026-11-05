/** Reject secret-token types before bundling browser configuration. */
export function requirePublicMapboxToken(value: string | undefined): string {
  if (!value?.startsWith("pk.")) {
    throw new Error("Set BUN_PUBLIC_MAPBOX_TOKEN to a public Mapbox (pk.) token. Secret tokens must never be bundled for browsers.");
  }
  return value;
}
