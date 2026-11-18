import { publicEnv } from "./publicEnv";
/**
 * Google Identity Services, loaded only when it is actually needed.
 *
 * The client id is public by design — it identifies the app, it is not a
 * secret — so `BUN_PUBLIC_` is the right prefix. When it is absent the
 * caller renders no Google button at all, which is why nothing here throws
 * on a missing value: a deployment without Google configured should simply
 * not offer it, the same way the backend's providers fall back rather than
 * breaking the funnel.
 */
// Bun's bundler inlines `process.env.BUN_PUBLIC_*` as a string literal at
// build time, in both dev (HMR) and the production static build — confirmed
// by inspecting the served bundle. The old `typeof process !== "undefined"`
// guard around it was wrong: browsers never define `process`, so that check
// always evaluated false and silently zeroed this out regardless of env.
export const GOOGLE_CLIENT_ID = publicEnv(() => process.env.BUN_PUBLIC_GOOGLE_CLIENT_ID);

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleIdApi {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdApi;
  }
}

let loader: Promise<GoogleIdApi> | undefined;

/**
 * Loads the GSI script once per page. Deliberately not in index.html: this is
 * a third-party script on the critical path for every visitor, and PRODUCT.md
 * describes riders on patchy, metered mobile data — most of whom never reach
 * signup. It is fetched at the moment someone chooses Google.
 */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  if (loader) return loader;

  loader = new Promise<GoogleIdApi>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");

    const onLoad = () => {
      if (window.google?.accounts?.id) resolve(window.google);
      else reject(new Error("Google sign-in loaded but is unavailable."));
    };
    const onError = () => {
      // Let a later attempt retry rather than caching the failure forever —
      // this is the case where the network dropped, not where Google is
      // genuinely unreachable.
      loader = undefined;
      reject(new Error("Couldn't reach Google sign-in."));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return loader;
}

/**
 * Renders Google's own button into `parent` and calls back with the ID token
 * it returns. Google requires its rendered button rather than an arbitrary
 * element of ours, so the styling here is theirs, not the project's.
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  onCredential: (idToken: string) => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const api = await loadGoogleIdentity();
    api.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        if (response.credential) onCredential(response.credential);
        else onError("Google didn't return a sign-in token.");
      },
    });
    api.accounts.id.renderButton(parent, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      width: 320,
    });
  } catch (err) {
    onError(err instanceof Error ? err.message : "Couldn't load Google sign-in.");
  }
}
