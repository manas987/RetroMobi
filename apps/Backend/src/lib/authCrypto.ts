import crypto from "node:crypto";

// Shared crypto primitives for all three auth stacks (customer, merchant, admin).
// Moved out of Routes/user/Auth/token.ts so there is exactly one scrypt
// implementation instead of three hand-copied ones drifting apart.

export function getAccessTokenSecret(): string {
  const secret = process.env.AUTH_ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error("AUTH_ACCESS_TOKEN_SECRET is not set");
  return secret;
}

// Refresh tokens are opaque random values. Only their sha256 hash is ever
// stored, so a DB leak doesn't hand out usable credentials.
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
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
