import { OAuth2Client } from "google-auth-library";

// Firebase ID tokens are ordinary Google-signed JWTs, so google-auth-library
// (already here for Google sign-in) verifies them without pulling in
// firebase-admin and its service-account credential. The checks below are the
// ones Firebase documents for verifying ID tokens with a third-party library.
const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let certs: { value: Record<string, string>; expiresAt: number } | null = null;

// Google rotates these keys and says how long each copy is good for in
// Cache-Control max-age; refetching per sign-in would be a Google round trip
// on every login.
async function getCerts(): Promise<Record<string, string>> {
  if (certs && certs.expiresAt > Date.now()) return certs.value;
  const response = await fetch(CERTS_URL);
  if (!response.ok) throw new Error(`could not fetch Firebase signing certs (${response.status})`);
  const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 0);
  certs = { value: (await response.json()) as Record<string, string>, expiresAt: Date.now() + maxAge * 1000 };
  return certs.value;
}

/**
 * True only when `idToken` is a valid Firebase ID token for this project that
 * proves ownership of exactly `phone` (E.164). Any failure is just false --
 * the caller answers with its portal's invalid-code error.
 */
export async function verifyFirebasePhoneToken(idToken: string, phone: string): Promise<boolean> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  // A deploy bug, not a bad code -- so a loud 500, not a quiet "incorrect code".
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is not set");
  // Outside the try for the same reason: Google being unreachable is not a bad code.
  const keys = await getCerts();

  try {
    const ticket = await new OAuth2Client().verifySignedJwtWithCertsAsync(
      idToken,
      keys,
      projectId,
      [`https://securetoken.google.com/${projectId}`],
    );
    const payload = ticket.getPayload() as { sub?: string; auth_time?: number; phone_number?: string } | undefined;
    if (!payload?.sub) return false;
    if (!payload.auth_time || payload.auth_time > Date.now() / 1000) return false;
    // The token proves a phone, but not necessarily the one being signed in --
    // without this, a code for my number signs me into yours.
    return payload.phone_number === phone;
  } catch {
    return false;
  }
}
