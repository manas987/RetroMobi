/**
 * Which backend tree this app talks to and where it lives. Each app calls
 * `configureApi` once, at the top of its root layout, before anything renders.
 */
export type Portal = "user" | "merchant";

let portal: Portal | null = null;
let baseUrl = "";

export function configureApi(config: { portal: Portal; baseUrl: string | undefined }) {
  portal = config.portal;
  // No trailing slash, so `${baseUrl}/api/...` never doubles one.
  baseUrl = (config.baseUrl ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    // Loud in development, never a crash: screens show their own "couldn't load" state.
    console.warn("EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and set it.");
  }
}

export function apiPortal(): Portal {
  if (!portal) throw new Error("configureApi() was not called before the first request.");
  return portal;
}

export function apiUrl(path: string): string {
  return `${baseUrl}/api/${apiPortal()}${path}`;
}
