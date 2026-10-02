import crypto from "node:crypto";
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenPayload {
  uid: string;
  sid: string;
}

function getAccessTokenSecret(): string {
  const secret = process.env.AUTH_ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error("AUTH_ACCESS_TOKEN_SECRET is not set");
  return secret;
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

// Refresh tokens are opaque random values. Only their sha256 hash is ever
// stored, so a DB leak doesn't hand out usable credentials.
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// OTP hashing uses a salted, slow KDF (scrypt) because a 6-digit code is
// low-entropy and must resist offline guessing — unlike the refresh token
// above, which is high-entropy and hashed with plain sha256 for fast exact-match lookup.
export function hashOtp(code: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(code, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export function verifyOtpHash(code: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(code, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      const expected = Buffer.from(hashHex, "hex");
      resolve(
        expected.length === derivedKey.length &&
          crypto.timingSafeEqual(expected, derivedKey),
      );
    });
  });
}
