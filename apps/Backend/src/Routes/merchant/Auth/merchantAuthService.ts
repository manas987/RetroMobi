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
  MERCHANT_ACCESS_TOKEN_EXPIRES_IN,
  signMerchantAccessToken,
  signMerchantTicket,
  verifyMerchantTicket,
} from "./token.ts";

export class MerchantRateLimitedError extends Error {}
export class MerchantInvalidOtpError extends Error {}
export class MerchantInvalidSessionError extends Error {}
export class MerchantInvalidTicketError extends Error {}
export class MerchantPhoneTakenError extends Error {}
export class MerchantSuspendedError extends Error {}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const REFRESH_TOKEN_TTL_MS = 15 * 24 * 60 * 60 * 1000;
const SIGNUP_TICKET_TTL_SECONDS = 10 * 60;

const SEND_LIMIT_SHORT = { count: 3, windowMinutes: 10 };
const SEND_LIMIT_LONG = { count: 10, windowMinutes: 24 * 60 };
const VERIFY_BACKSTOP = { count: 10, windowMinutes: 10 };

interface OtpChallengeResult {
  expiresInSeconds: number;
  /** Plaintext code — for tests only. Never forward this to an API response. */
  code: string;
}

async function createOtpChallenge(
  pool: Pool,
  phone: string,
  deliver: (phone: string, code: string) => Promise<void>,
): Promise<OtpChallengeResult> {
  const { rows: shortRows } = await pool.query(
    `select count(*)::int as n from merchant_otp_challenges
     where target = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [phone, SEND_LIMIT_SHORT.windowMinutes],
  );
  if (shortRows[0].n >= SEND_LIMIT_SHORT.count) {
    throw new MerchantRateLimitedError("too many OTP requests, try again shortly");
  }

  const { rows: longRows } = await pool.query(
    `select count(*)::int as n from merchant_otp_challenges
     where target = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [phone, SEND_LIMIT_LONG.windowMinutes],
  );
  if (longRows[0].n >= SEND_LIMIT_LONG.count) {
    throw new MerchantRateLimitedError("too many OTP requests today");
  }

  const code = generateOtpCode();
  const otpHash = await hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await pool.query(
    `insert into merchant_otp_challenges (target, channel, purpose, otp_hash, expires_at)
     values ($1, 'SMS', 'LOGIN_OR_SIGNUP', $2, $3)`,
    [phone, otpHash, expiresAt],
  );

  await deliver(phone, code);

  return { expiresInSeconds: OTP_TTL_MS / 1000, code };
}

async function consumeOtpChallenge(pool: Pool, phone: string, code: string): Promise<void> {
  const { rows: backstopRows } = await pool.query(
    `select coalesce(sum(attempt_count), 0)::int as n from merchant_otp_challenges
     where target = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [phone, VERIFY_BACKSTOP.windowMinutes],
  );
  if (backstopRows[0].n >= VERIFY_BACKSTOP.count) {
    throw new MerchantRateLimitedError("too many attempts, try again shortly");
  }

  const { rows } = await pool.query(
    `select id, otp_hash, expires_at, attempt_count from merchant_otp_challenges
     where target = $1 and consumed_at is null
     order by created_at desc limit 1`,
    [phone],
  );
  const challenge = rows[0];
  if (!challenge) throw new MerchantInvalidOtpError("no active code for this target");
  if (challenge.attempt_count >= OTP_MAX_ATTEMPTS) {
    throw new MerchantInvalidOtpError("code is no longer valid, request a new one");
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    throw new MerchantInvalidOtpError("code has expired");
  }

  const matches = await verifyOtpHash(code, challenge.otp_hash);
  if (!matches) {
    await pool.query(
      `update merchant_otp_challenges set attempt_count = attempt_count + 1 where id = $1`,
      [challenge.id],
    );
    throw new MerchantInvalidOtpError("incorrect code");
  }

  await pool.query(`update merchant_otp_challenges set consumed_at = now() where id = $1`, [
    challenge.id,
  ]);
}

export function requestMerchantOtp(
  pool: Pool,
  phone: string,
  deliver: (phone: string, code: string) => Promise<void>,
): Promise<OtpChallengeResult> {
  return createOtpChallenge(pool, phone, deliver);
}

export interface MerchantSessionTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface MerchantLoginResult extends MerchantSessionTokens {
  status: "LOGIN";
  merchant: { id: string; phone: string; name: string | null; email: string | null };
}

export interface MerchantSignupRequiredResult {
  status: "SIGNUP_REQUIRED";
  signupTicket: string;
  ticketExpiresInSeconds: number;
}

interface MerchantSignupTicketPayload {
  phone: string;
}

async function createMerchantSession(
  pool: Pool,
  merchantUserId: string,
  deviceId: string,
): Promise<MerchantSessionTokens> {
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const { rows } = await pool.query(
    `insert into merchant_sessions (merchant_user_id, token_hash, device_id, expires_at)
     values ($1, $2, $3, $4) returning id`,
    [merchantUserId, tokenHash, deviceId, expiresAt],
  );
  const sessionId = rows[0].id;

  return {
    accessToken: signMerchantAccessToken({ mid: merchantUserId, sid: sessionId }),
    accessTokenExpiresIn: MERCHANT_ACCESS_TOKEN_EXPIRES_IN,
    refreshToken,
  };
}

export async function verifyMerchantOtp(
  pool: Pool,
  input: { phone: string; code: string; deviceId: string },
): Promise<MerchantLoginResult | MerchantSignupRequiredResult> {
  const { phone, code, deviceId } = input;

  await consumeOtpChallenge(pool, phone, code);

  const { rows: existingRows } = await pool.query(
    `select id, name, email, status from merchant_users where phone = $1`,
    [phone],
  );
  const existing = existingRows[0];

  if (existing) {
    if (existing.status !== "ACTIVE") {
      throw new MerchantSuspendedError("this merchant account is suspended");
    }
    const tokens = await createMerchantSession(pool, existing.id, deviceId);
    await writeAudit(pool, {
      actorType: "MERCHANT",
      actorId: existing.id,
      action: "merchant.logged_in",
      entityType: "merchant_user",
      entityId: existing.id,
    });
    return {
      status: "LOGIN",
      ...tokens,
      merchant: { id: existing.id, phone, name: existing.name, email: existing.email },
    };
  }

  const signupTicket = signMerchantTicket<MerchantSignupTicketPayload>(
    "MERCHANT_SIGNUP",
    { phone },
    SIGNUP_TICKET_TTL_SECONDS,
  );
  return {
    status: "SIGNUP_REQUIRED",
    signupTicket,
    ticketExpiresInSeconds: SIGNUP_TICKET_TTL_SECONDS,
  };
}

export async function completeMerchantSignup(
  pool: Pool,
  input: { signupTicket: string; deviceId: string; name: string; email?: string },
): Promise<MerchantLoginResult> {
  const payload = verifyMerchantTicket<MerchantSignupTicketPayload>(
    "MERCHANT_SIGNUP",
    input.signupTicket,
  );
  if (!payload) throw new MerchantInvalidTicketError("signup ticket is invalid or expired");

  let merchantId: string;
  try {
    const { rows } = await pool.query(
      `insert into merchant_users (phone, name, email) values ($1, $2, $3) returning id`,
      [payload.phone, input.name, input.email ?? null],
    );
    merchantId = rows[0].id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new MerchantPhoneTakenError("this phone number is already registered");
    }
    throw err;
  }

  const tokens = await createMerchantSession(pool, merchantId, input.deviceId);
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: merchantId,
    action: "merchant.signed_up",
    entityType: "merchant_user",
    entityId: merchantId,
    after: { phone: payload.phone },
  });
  return {
    status: "LOGIN",
    ...tokens,
    merchant: { id: merchantId, phone: payload.phone, name: input.name, email: input.email ?? null },
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export async function refreshMerchantSession(
  pool: Pool,
  input: { refreshToken: string; deviceId: string },
): Promise<MerchantSessionTokens> {
  const tokenHash = hashRefreshToken(input.refreshToken);

  const { rows } = await pool.query(
    `select id, merchant_user_id, device_id, revoked_at, expires_at from merchant_sessions
     where token_hash = $1`,
    [tokenHash],
  );
  const session = rows[0];
  if (!session) throw new MerchantInvalidSessionError("refresh token not recognized");
  if (session.revoked_at) throw new MerchantInvalidSessionError("session revoked");
  if (new Date(session.expires_at).getTime() < Date.now()) {
    throw new MerchantInvalidSessionError("session expired");
  }
  if (session.device_id !== input.deviceId) {
    throw new MerchantInvalidSessionError("device mismatch");
  }

  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await pool.query(
    `update merchant_sessions
     set token_hash = $1, expires_at = $2, last_used_at = now()
     where id = $3`,
    [newTokenHash, newExpiresAt, session.id],
  );

  return {
    accessToken: signMerchantAccessToken({ mid: session.merchant_user_id, sid: session.id }),
    accessTokenExpiresIn: MERCHANT_ACCESS_TOKEN_EXPIRES_IN,
    refreshToken: newRefreshToken,
  };
}

export async function merchantLogout(
  pool: Pool,
  input: { merchantUserId: string; refreshToken: string },
): Promise<void> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  await pool.query(
    `update merchant_sessions set revoked_at = now()
     where token_hash = $1 and merchant_user_id = $2 and revoked_at is null`,
    [tokenHash, input.merchantUserId],
  );
  await writeAudit(pool, {
    actorType: "MERCHANT",
    actorId: input.merchantUserId,
    action: "merchant.logged_out",
    entityType: "merchant_session",
    entityId: null,
  });
}
