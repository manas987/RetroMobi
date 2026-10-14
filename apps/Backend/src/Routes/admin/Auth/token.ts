import jwt from "jsonwebtoken";
import { getAccessTokenSecret } from "../../../lib/authCrypto.ts";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "SUPPORT";

export interface AdminAccessTokenPayload {
  aid: string;
  sid: string;
  role: AdminRole;
}

export function signAdminAccessToken(payload: AdminAccessTokenPayload): string {
  return jwt.sign(payload, getAccessTokenSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    audience: "admin",
  });
}

export function verifyAdminAccessToken(token: string): AdminAccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getAccessTokenSecret(), { audience: "admin" });
    if (typeof decoded === "string") return null;
    const { aid, sid, role } = decoded as Record<string, unknown>;
    if (typeof aid !== "string" || typeof sid !== "string") return null;
    if (role !== "SUPER_ADMIN" && role !== "ADMIN" && role !== "SUPPORT") return null;
    return { aid, sid, role };
  } catch {
    return null;
  }
}

export const ADMIN_ACCESS_TOKEN_EXPIRES_IN = ACCESS_TOKEN_TTL_SECONDS;
