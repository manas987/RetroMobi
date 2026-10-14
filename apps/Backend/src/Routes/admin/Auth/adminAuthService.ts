import type { Pool } from "pg";
import {
  generateOtpCode,
  generateRefreshToken,
  hashOtp,
  hashRefreshToken,
  verifyOtpHash,
} from "../../../lib/authCrypto.ts";
import { writeAudit } from "../../../lib/audit.ts";
import {
  ADMIN_ACCESS_TOKEN_EXPIRES_IN,
  signAdminAccessToken,
  type AdminRole,
} from "./token.ts";

export class AdminRateLimitedError extends Error {}
export class AdminInvalidOtpError extends Error {}
export class AdminInvalidSessionError extends Error {}
export class AdminNotRecognizedError extends Error {}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
// An admin refresh token is the most valuable credential in the system --
// 12 hours, not the 15-day TTL the customer/merchant stacks use.
const REFRESH_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const SEND_LIMIT_SHORT = { count: 3, windowMinutes: 10 };
const SEND_LIMIT_LONG = { count: 10, windowMinutes: 24 * 60 };
const VERIFY_BACKSTOP = { count: 10, windowMinutes: 10 };

interface OtpChallengeResult {
  expiresInSeconds: number;
  /** Plaintext code — for tests only. Never forward this to an API response. */
  code: string;
}

async function requireActiveAdmin(pool: Pool, phone: string) {
  const { rows } = await pool.query(
    `select id, name, email, role, status from admins where phone = $1 and deleted_at is null`,
    [phone],
  );
  const admin = rows[0];
  if (!admin || admin.status !== "ACTIVE") {
    throw new AdminNotRecognizedError("this phone is not an active admin account");
  }
  return admin;
}

// Checked BEFORE sending, so an unprovisioned phone never costs an SMS.
export async function requestAdminOtp(
  pool: Pool,
  phone: string,
  deliver: (phone: string, code: string) => Promise<void>,
): Promise<OtpChallengeResult> {
  await requireActiveAdmin(pool, phone);

  const { rows: shortRows } = await pool.query(
    `select count(*)::int as n from admin_otp_challenges
     where target = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [phone, SEND_LIMIT_SHORT.windowMinutes],
  );
  if (shortRows[0].n >= SEND_LIMIT_SHORT.count) {
    throw new AdminRateLimitedError("too many OTP requests, try again shortly");
  }

  const { rows: longRows } = await pool.query(
    `select count(*)::int as n from admin_otp_challenges
     where target = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [phone, SEND_LIMIT_LONG.windowMinutes],
  );
  if (longRows[0].n >= SEND_LIMIT_LONG.count) {
    throw new AdminRateLimitedError("too many OTP requests today");
  }

  const code = generateOtpCode();
  const otpHash = await hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await pool.query(
    `insert into admin_otp_challenges (target, channel, purpose, otp_hash, expires_at)
     values ($1, 'SMS', 'LOGIN_OR_SIGNUP', $2, $3)`,
    [phone, otpHash, expiresAt],
  );

  await deliver(phone, code);

  return { expiresInSeconds: OTP_TTL_MS / 1000, code };
}

async function consumeOtpChallenge(pool: Pool, phone: string, code: string): Promise<void> {
  const { rows: backstopRows } = await pool.query(
    `select coalesce(sum(attempt_count), 0)::int as n from admin_otp_challenges
     where target = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [phone, VERIFY_BACKSTOP.windowMinutes],
  );
  if (backstopRows[0].n >= VERIFY_BACKSTOP.count) {
    throw new AdminRateLimitedError("too many attempts, try again shortly");
  }

  const { rows } = await pool.query(
    `select id, otp_hash, expires_at, attempt_count from admin_otp_challenges
     where target = $1 and consumed_at is null
     order by created_at desc limit 1`,
    [phone],
  );
  const challenge = rows[0];
  if (!challenge) throw new AdminInvalidOtpError("no active code for this target");
  if (challenge.attempt_count >= OTP_MAX_ATTEMPTS) {
    throw new AdminInvalidOtpError("code is no longer valid, request a new one");
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    throw new AdminInvalidOtpError("code has expired");
  }

  const matches = await verifyOtpHash(code, challenge.otp_hash);
  if (!matches) {
    await pool.query(
      `update admin_otp_challenges set attempt_count = attempt_count + 1 where id = $1`,
      [challenge.id],
    );
    throw new AdminInvalidOtpError("incorrect code");
  }

  await pool.query(`update admin_otp_challenges set consumed_at = now() where id = $1`, [
    challenge.id,
  ]);
}

export interface AdminSessionTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface AdminLoginResult extends AdminSessionTokens {
  status: "LOGIN";
  admin: { id: string; phone: string; name: string | null; role: AdminRole };
}

async function createAdminSession(
  pool: Pool,
  adminId: string,
  role: AdminRole,
  deviceId: string,
): Promise<AdminSessionTokens> {
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const { rows } = await pool.query(
    `insert into admin_sessions (admin_id, token_hash, device_id, expires_at)
     values ($1, $2, $3, $4) returning id`,
    [adminId, tokenHash, deviceId, expiresAt],
  );
  const sessionId = rows[0].id;

  return {
    accessToken: signAdminAccessToken({ aid: adminId, sid: sessionId, role }),
    accessTokenExpiresIn: ADMIN_ACCESS_TOKEN_EXPIRES_IN,
    refreshToken,
  };
}

// Checked again after consuming the OTP -- re-reads the row rather than
// trusting the pre-send check, in case status changed in the 5-minute window.
export async function verifyAdminOtp(
  pool: Pool,
  input: { phone: string; code: string; deviceId: string },
): Promise<AdminLoginResult> {
  await consumeOtpChallenge(pool, input.phone, input.code);
  const admin = await requireActiveAdmin(pool, input.phone);

  const tokens = await createAdminSession(pool, admin.id, admin.role as AdminRole, input.deviceId);
  await writeAudit(pool, {
    actorType: "ADMIN",
    actorId: admin.id,
    action: "admin.logged_in",
    entityType: "admin",
    entityId: admin.id,
  });
  return {
    status: "LOGIN",
    ...tokens,
    admin: { id: admin.id, phone: input.phone, name: admin.name, role: admin.role as AdminRole },
  };
}

export async function refreshAdminSession(
  pool: Pool,
  input: { refreshToken: string; deviceId: string },
): Promise<AdminSessionTokens> {
  const tokenHash = hashRefreshToken(input.refreshToken);

  const { rows } = await pool.query(
    `select s.id, s.admin_id, s.device_id, s.revoked_at, s.expires_at, a.role, a.status
       from admin_sessions s
       join admins a on a.id = s.admin_id
      where s.token_hash = $1`,
    [tokenHash],
  );
  const session = rows[0];
  if (!session) throw new AdminInvalidSessionError("refresh token not recognized");
  if (session.revoked_at) throw new AdminInvalidSessionError("session revoked");
  if (new Date(session.expires_at).getTime() < Date.now()) {
    throw new AdminInvalidSessionError("session expired");
  }
  if (session.device_id !== input.deviceId) {
    throw new AdminInvalidSessionError("device mismatch");
  }
  // Suspending an admin must kill their live sessions, not just block new logins.
  if (session.status !== "ACTIVE") {
    throw new AdminInvalidSessionError("admin is no longer active");
  }

  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await pool.query(
    `update admin_sessions
     set token_hash = $1, expires_at = $2, last_used_at = now()
     where id = $3`,
    [newTokenHash, newExpiresAt, session.id],
  );

  return {
    accessToken: signAdminAccessToken({ aid: session.admin_id, sid: session.id, role: session.role }),
    accessTokenExpiresIn: ADMIN_ACCESS_TOKEN_EXPIRES_IN,
    refreshToken: newRefreshToken,
  };
}

export async function adminLogout(
  pool: Pool,
  input: { adminId: string; refreshToken: string },
): Promise<void> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  await pool.query(
    `update admin_sessions set revoked_at = now()
     where token_hash = $1 and admin_id = $2 and revoked_at is null`,
    [tokenHash, input.adminId],
  );
  await writeAudit(pool, {
    actorType: "ADMIN",
    actorId: input.adminId,
    action: "admin.logged_out",
    entityType: "admin_session",
    entityId: null,
  });
}
