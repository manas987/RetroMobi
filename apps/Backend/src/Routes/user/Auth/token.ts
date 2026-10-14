import jwt from "jsonwebtoken";
import { getAccessTokenSecret } from "../../../lib/authCrypto.ts";

export { generateRefreshToken, hashRefreshToken, hashOtp, verifyOtpHash } from "../../../lib/authCrypto.ts";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenPayload {
  uid: string;
  sid: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getAccessTokenSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getAccessTokenSecret());
    if (typeof decoded === "string") return null;
    const { uid, sid } = decoded as Record<string, unknown>;
    if (typeof uid !== "string" || typeof sid !== "string") return null;
    return { uid, sid };
  } catch {
    return null;
  }
}

export const ACCESS_TOKEN_EXPIRES_IN = ACCESS_TOKEN_TTL_SECONDS;


// Generic short-lived, purpose-scoped ticket — same HS256 mechanism as the
// access token, but the `purpose` claim is checked on verify so a signup
// ticket can't be replayed as a Google-prefill ticket or vice versa.
export function signTicket<T extends object>(
  purpose: string,
  payload: T,
  ttlSeconds: number,
): string {
  return jwt.sign({ ...payload, purpose }, getAccessTokenSecret(), {
    expiresIn: ttlSeconds,
  });
}

export function verifyTicket<T>(purpose: string, token: string): T | null {
  try {
    const decoded = jwt.verify(token, getAccessTokenSecret());
    if (typeof decoded === "string") return null;
    const { purpose: tokenPurpose, iat, exp, ...rest } = decoded as Record<string, unknown>;
    if (tokenPurpose !== purpose) return null;
    return rest as T;
  } catch {
    return null;
  }
}
