import { publicEnv } from "./publicEnv";
import { useRef, useState } from "react";
import type { ConfirmationResult } from "firebase/auth";
import { portalFetch, PortalApiError, type Portal } from "./portal";

/**
 * Phone sign-in for all three portals: WhatsApp first (the backend sends the
 * code), Firebase Phone Auth SMS as the fallback.
 *
 * The Firebase web config is public by design (it identifies the project; the
 * authorized-domains list and SMS region policy are what protect it), hence
 * `BUN_PUBLIC_`. Bun inlines these at build time, see lib/publicEnv.ts. Leave them
 * blank and SMS is never offered: no link, no automatic fallback.
 */
const FIREBASE_CONFIG = {
  apiKey: publicEnv(() => process.env.BUN_PUBLIC_FIREBASE_API_KEY),
  authDomain: publicEnv(() => process.env.BUN_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: publicEnv(() => process.env.BUN_PUBLIC_FIREBASE_PROJECT_ID),
  appId: publicEnv(() => process.env.BUN_PUBLIC_FIREBASE_APP_ID),
};

export const SMS_FALLBACK_ENABLED = Object.values(FIREBASE_CONFIG).every(Boolean);

let authPromise: Promise<import("firebase/auth").Auth> | undefined;

// Loaded the moment someone picks SMS, not with the page: most riders never
// need it, and they are on metered mobile data.
function firebaseAuth() {
  authPromise ??= Promise.all([import("firebase/app"), import("firebase/auth")]).then(([app, auth]) =>
    // In-memory: we only want the one ID token to hand to our backend, not a
    // Firebase session lingering in IndexedDB.
    auth.initializeAuth(app.initializeApp(FIREBASE_CONFIG), { persistence: auth.inMemoryPersistence }),
  );
  return authPromise;
}

// Firebase's own error codes, in words a rider can act on. Thrown as
// PortalApiError so each page's existing error display shows them.
function friendly(err: unknown): PortalApiError {
  const code = (err as { code?: string })?.code ?? "";
  const message =
    code === "auth/invalid-verification-code" ? "That code is incorrect." :
    code === "auth/code-expired" ? "That code has expired. Send a new one." :
    code === "auth/too-many-requests" ? "Too many attempts. Try again later." :
    code === "auth/invalid-phone-number" ? "That phone number doesn't look right." :
    "Couldn't send or check the SMS code. Try again.";
  return new PortalApiError(0, message, code);
}

let recaptcha: { clear(): void } | undefined;

async function sendSmsCode(phone: string): Promise<ConfirmationResult> {
  const auth = await firebaseAuth();
  const { RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
  // A used or failed invisible reCAPTCHA can't be re-run, so every send gets a
  // fresh one in a fresh container.
  recaptcha?.clear();
  document.getElementById("sms-recaptcha")?.remove();
  const container = document.createElement("div");
  container.id = "sms-recaptcha";
  document.body.appendChild(container);
  const verifier = new RecaptchaVerifier(auth, container, { size: "invisible" });
  recaptcha = verifier;
  try {
    return await signInWithPhoneNumber(auth, phone, verifier);
  } catch (err) {
    throw friendly(err);
  }
}

/**
 * `send` tries WhatsApp and drops to SMS on its own when the backend says
 * WhatsApp didn't deliver; `sendBySms` is the rider choosing SMS. `verify`
 * posts to whichever endpoint matches how the code was sent, and both return
 * the same login/signup result.
 */
export function usePhoneOtp(portal: Portal) {
  const [via, setVia] = useState<"whatsapp" | "sms">("whatsapp");
  const confirmation = useRef<ConfirmationResult | null>(null);

  async function sendBySms(phone: string) {
    confirmation.current = await sendSmsCode(phone);
    setVia("sms");
  }

  async function send(phone: string) {
    let fallback = false;
    try {
      const result = await portalFetch<{ fallback?: string }>(portal, "/auth/otp/send", { method: "POST", body: { phone } });
      // WhatsApp isn't configured on this backend (local dev): the code is in
      // the server log, which is still usable when there's no SMS to fall back to.
      fallback = result.fallback === "firebase" && SMS_FALLBACK_ENABLED;
    } catch (err) {
      if (!(SMS_FALLBACK_ENABLED && err instanceof PortalApiError && err.code === "otp_delivery_failed")) throw err;
      fallback = true;
    }
    if (fallback) await sendBySms(phone);
    else setVia("whatsapp");
  }

  async function verify<T>(phone: string, code: string, deviceId: string): Promise<T> {
    if (via === "whatsapp" || !confirmation.current) {
      return portalFetch<T>(portal, "/auth/otp/verify", { method: "POST", body: { phone, code, deviceId } });
    }
    let idToken: string;
    try {
      idToken = await (await confirmation.current.confirm(code)).user.getIdToken();
    } catch (err) {
      throw friendly(err);
    }
    return portalFetch<T>(portal, "/auth/otp/verify-firebase", { method: "POST", body: { phone, idToken, deviceId } });
  }

  return { via, send, sendBySms, verify };
}
