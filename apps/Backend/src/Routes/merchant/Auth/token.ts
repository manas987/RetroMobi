import jwt from "jsonwebtoken";
import { getAccessTokenSecret } from "../../../lib/authCrypto.ts";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface MerchantAccessTokenPayload {
  mid: string;
  sid: string;
}

// All three auth stacks share one AUTH_ACCESS_TOKEN_SECRET, so the `aud` claim
// is the only thing stopping a customer access token from verifying as a
// merchant one. Every sign/verify pair here is scoped to "merchant".
export function signMerchantAccessToken(payload: MerchantAccessTokenPayload): string {
  return jwt.sign(payload, getAccessTokenSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    audience: "merchant",
  });
}

export function verifyMerchantAccessToken(token: string): MerchantAccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getAccessTokenSecret(), { audience: "merchant" });
    if (typeof decoded === "string") return null;
    const { mid, sid } = decoded as Record<string, unknown>;
    if (typeof mid !== "string" || typeof sid !== "string") return null;
    return { mid, sid };
  } catch {
    return null;
  }
}

export const MERCHANT_ACCESS_TOKEN_EXPIRES_IN = ACCESS_TOKEN_TTL_SECONDS;

export function signMerchantTicket<T extends object>(
  purpose: string,
  payload: T,
  ttlSeconds: number,
): string {
  return jwt.sign({ ...payload, purpose }, getAccessTokenSecret(), {
    expiresIn: ttlSeconds,
    audience: "merchant",
  });
}

export function verifyMerchantTicket<T>(purpose: string, token: string): T | null {
  try {
    const decoded = jwt.verify(token, getAccessTokenSecret(), { audience: "merchant" });
    if (typeof decoded === "string") return null;
    const { purpose: tokenPurpose, iat, exp, aud, ...rest } = decoded as Record<string, unknown>;
    if (tokenPurpose !== purpose) return null;
    return rest as T;
  } catch {
    return null;
  }
}
