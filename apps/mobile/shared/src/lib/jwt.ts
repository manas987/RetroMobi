const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Reads the ASCII user id from a JWT payload for display/cache scope only. The API verifies the token. */
export function decodeJwtSubject(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload || payload.length % 4 === 1) return null;
  let buffer = 0;
  let bits = 0;
  let json = "";
  for (const char of payload) {
    const value = alphabet.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      json += String.fromCharCode((buffer >>> bits) & 255);
    }
  }
  try {
    const parsed = JSON.parse(json) as { uid?: unknown; mid?: unknown } | null;
    const id = parsed?.uid ?? parsed?.mid;
    return typeof id === "string" && id ? id : null;
  } catch { return null; }
}
