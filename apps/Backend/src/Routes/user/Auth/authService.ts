import type { Pool } from "pg";
import type { GoogleIdentity } from "../../../providers/google.ts";
import { generateOtpCode, hashOtp, verifyOtpHash } from "../../../lib/authCrypto.ts";
import { writeAudit } from "../../../lib/audit.ts";
import {
  ACCESS_TOKEN_EXPIRES_IN,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  signTicket,
  verifyTicket,
} from "./token.ts";

export class RateLimitedError extends Error {}
export class InvalidOtpError extends Error {}
export class InvalidSessionError extends Error {}
export class InvalidTicketError extends Error {}
export class PhoneTakenError extends Error {}
export class EmailTakenError extends Error {}
export class EmailNotVerifiedError extends Error {}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const REFRESH_TOKEN_TTL_MS = 15 * 24 * 60 * 60 * 1000;
const SIGNUP_TICKET_TTL_SECONDS = 10 * 60;
const EMAIL_VERIFIED_TICKET_TTL_SECONDS = 10 * 60;

// ponytail: hardcoded constants, not env vars — promote only if ops needs
// per-environment tuning. Same thresholds reused for email OTP, since target
// (phone vs email) already separates the two in the rate-limit queries.
const SEND_LIMIT_SHORT = { count: 3, windowMinutes: 10 };
const SEND_LIMIT_LONG = { count: 10, windowMinutes: 24 * 60 };
const VERIFY_BACKSTOP = { count: 10, windowMinutes: 10 };

export interface OtpChallengeResult {
  expiresInSeconds: number;
  /** Plaintext code — for tests only. Never forward this to an API response. */
  code: string;
}

// ponytail: Postgres COUNT for rate limiting, move to Redis when send volume
// needs sub-ms checks across multiple app instances.
async function createOtpChallenge(
  pool: Pool,
  target: string,
  channel: "SMS" | "EMAIL",
  purpose: "LOGIN_OR_SIGNUP" | "EMAIL_VERIFICATION",
  deliver: (target: string, code: string) => Promise<void>,
): Promise<OtpChallengeResult> {
  const { rows: shortRows } = await pool.query(
    `select count(*)::int as n from otp_challenges
     where target = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [target, SEND_LIMIT_SHORT.windowMinutes],
  );
  if (shortRows[0].n >= SEND_LIMIT_SHORT.count) {
    throw new RateLimitedError("too many OTP requests, try again shortly");
  }

  const { rows: longRows } = await pool.query(
    `select count(*)::int as n from otp_challenges
     where target = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [target, SEND_LIMIT_LONG.windowMinutes],
  );
  if (longRows[0].n >= SEND_LIMIT_LONG.count) {
    throw new RateLimitedError("too many OTP requests today");
  }

  const code = generateOtpCode();
  const otpHash = await hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await pool.query(
    `insert into otp_challenges (target, channel, purpose, otp_hash, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [target, channel, purpose, otpHash, expiresAt],
  );

  await deliver(target, code);

  return { expiresInSeconds: OTP_TTL_MS / 1000, code };
}

async function consumeOtpChallenge(pool: Pool, target: string, code: string): Promise<void> {
  const { rows: backstopRows } = await pool.query(
    `select coalesce(sum(attempt_count), 0)::int as n from otp_challenges
     where target = $1 and created_at > now() - ($2 || ' minutes')::interval`,
    [target, VERIFY_BACKSTOP.windowMinutes],
  );
  if (backstopRows[0].n >= VERIFY_BACKSTOP.count) {
    throw new RateLimitedError("too many attempts, try again shortly");
  }

  const { rows } = await pool.query(
    `select id, otp_hash, expires_at, attempt_count from otp_challenges
     where target = $1 and consumed_at is null
     order by created_at desc limit 1`,
    [target],
  );
  const challenge = rows[0];
  if (!challenge) throw new InvalidOtpError("no active code for this target");
  if (challenge.attempt_count >= OTP_MAX_ATTEMPTS) {
    throw new InvalidOtpError("code is no longer valid, request a new one");
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    throw new InvalidOtpError("code has expired");
  }

  const matches = await verifyOtpHash(code, challenge.otp_hash);
  if (!matches) {
    await pool.query(
      `update otp_challenges set attempt_count = attempt_count + 1 where id = $1`,
      [challenge.id],
    );
    throw new InvalidOtpError("incorrect code");
  }

  await pool.query(`update otp_challenges set consumed_at = now() where id = $1`, [
    challenge.id,
  ]);
}

export function requestOtp(
  pool: Pool,
  phone: string,
  deliver: (phone: string, code: string) => Promise<void>,
): Promise<OtpChallengeResult> {
  return createOtpChallenge(pool, phone, "SMS", "LOGIN_OR_SIGNUP", deliver);
}

export interface VerifyOtpInput {
  phone: string;
  code: string;
  deviceId: string;
}

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export interface LoginResult extends SessionTokens {
  status: "LOGIN";
  user: { id: string; phone: string; name: string | null; email: string | null };
}

export interface SignupRequiredResult {
  status: "SIGNUP_REQUIRED";
  signupTicket: string;
  ticketExpiresInSeconds: number;
}

export type VerifyOtpResult = LoginResult | SignupRequiredResult;

interface SignupTicketPayload {
  phone: string;
}

// Phone OTP only ever proves phone ownership. An existing phone logs in
// immediately; a new phone gets a short-lived ticket and must complete the
// signup form (name + a separately-verified email) before any `users`/
// `sessions` row exists for it.
export async function verifyOtp(pool: Pool, input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const { phone, code, deviceId } = input;

  await consumeOtpChallenge(pool, phone, code);

  const { rows: existingUsers } = await pool.query(
    `select id, name, email from users where phone = $1`,
    [phone],
  );
  const existing = existingUsers[0];

  if (existing) {
    const tokens = await createSession(pool, existing.id, deviceId);
    await writeAudit(pool, {
      actorType: "CUSTOMER",
      actorId: existing.id,
      action: "user.logged_in",
      entityType: "user",
      entityId: existing.id,
    });
    return {
      status: "LOGIN",
      ...tokens,
      user: { id: existing.id, phone, name: existing.name, email: existing.email },
    };
  }

  const signupTicket = signTicket<SignupTicketPayload>(
    "SIGNUP",
    { phone },
    SIGNUP_TICKET_TTL_SECONDS,
  );
  return {
    status: "SIGNUP_REQUIRED",
    signupTicket,
    ticketExpiresInSeconds: SIGNUP_TICKET_TTL_SECONDS,
  };
}

async function createSession(pool: Pool, userId: string, deviceId: string): Promise<SessionTokens> {
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  const { rows } = await pool.query(
    `insert into sessions (user_id, token_hash, device_id, expires_at)
     values ($1, $2, $3, $4) returning id`,
    [userId, tokenHash, deviceId, expiresAt],
  );
  const sessionId = rows[0].id;

  return {
    accessToken: signAccessToken({ uid: userId, sid: sessionId }),
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
    refreshToken,
  };
}

export interface RequestEmailOtpInput {
  signupTicket: string;
  email: string;
}

function requireSignupPhone(signupTicket: string): string {
  const payload = verifyTicket<SignupTicketPayload>("SIGNUP", signupTicket);
  if (!payload) throw new InvalidTicketError("signup ticket is invalid or expired");
  return payload.phone;
}

export function requestEmailOtp(
  pool: Pool,
  input: RequestEmailOtpInput,
  deliver: (email: string, code: string) => Promise<void>,
): Promise<OtpChallengeResult> {
  requireSignupPhone(input.signupTicket); // just gates this to an active signup, phone itself unused here
  return createOtpChallenge(pool, input.email, "EMAIL", "EMAIL_VERIFICATION", deliver);
}

export interface VerifyEmailOtpInput {
  signupTicket: string;
  email: string;
  code: string;
}

export interface EmailVerifiedResult {
  emailVerificationTicket: string;
  ticketExpiresInSeconds: number;
}

interface EmailVerifiedTicketPayload {
  email: string;
}

export async function verifyEmailOtp(pool: Pool, input: VerifyEmailOtpInput): Promise<EmailVerifiedResult> {
  requireSignupPhone(input.signupTicket);
  await consumeOtpChallenge(pool, input.email, input.code);

  const emailVerificationTicket = signTicket<EmailVerifiedTicketPayload>(
    "EMAIL_VERIFIED",
    { email: input.email },
    EMAIL_VERIFIED_TICKET_TTL_SECONDS,
  );
  return { emailVerificationTicket, ticketExpiresInSeconds: EMAIL_VERIFIED_TICKET_TTL_SECONDS };
}

export interface GooglePrefillResult {
  googlePrefillTicket: string;
  ticketExpiresInSeconds: number;
  name: string;
  email: string;
}

interface GooglePrefillTicketPayload {
  email: string;
  name: string;
  googleSub: string;
}

export async function googlePrefill(
  idToken: string,
  verifyIdToken: (idToken: string) => Promise<GoogleIdentity | null>,
): Promise<GooglePrefillResult> {
  const identity = await verifyIdToken(idToken);
  if (!identity) throw new InvalidOtpError("Google could not verify that token");

  const googlePrefillTicket = signTicket<GooglePrefillTicketPayload>(
    "GOOGLE_PREFILL",
    identity,
    EMAIL_VERIFIED_TICKET_TTL_SECONDS,
  );
  return {
    googlePrefillTicket,
    ticketExpiresInSeconds: EMAIL_VERIFIED_TICKET_TTL_SECONDS,
    name: identity.name,
    email: identity.email,
  };
}

export interface CompleteSignupInput {
  signupTicket: string;
  deviceId: string;
  name?: string;
  email?: string;
  emailVerificationTicket?: string;
  googlePrefillTicket?: string;
}

export async function completeSignup(pool: Pool, input: CompleteSignupInput): Promise<LoginResult> {
  const phone = requireSignupPhone(input.signupTicket);

  let name: string;
  let email: string;

  if (input.googlePrefillTicket) {
    const identity = verifyTicket<GooglePrefillTicketPayload>(
      "GOOGLE_PREFILL",
      input.googlePrefillTicket,
    );
    if (!identity) throw new InvalidTicketError("Google prefill ticket is invalid or expired");
    name = identity.name;
    email = identity.email;
  } else if (input.emailVerificationTicket) {
    const verified = verifyTicket<EmailVerifiedTicketPayload>(
      "EMAIL_VERIFIED",
      input.emailVerificationTicket,
    );
    if (!verified) throw new InvalidTicketError("email verification ticket is invalid or expired");
    if (!input.name) throw new EmailNotVerifiedError("name is required");
    if (input.email && input.email !== verified.email) {
      throw new InvalidTicketError("email does not match the verified email");
    }
    name = input.name;
    email = verified.email;
  } else {
    throw new EmailNotVerifiedError(
      "email must be verified via email OTP or Google before completing signup",
    );
  }

  let userId: string;
  try {
    const { rows } = await pool.query(
      `insert into users (phone, name, email, email_verified_at)
       values ($1, $2, $3, now()) returning id`,
      [phone, name, email],
    );
    userId = rows[0].id;
  } catch (err) {
    if (isUniqueViolation(err, "users_phone_key")) {
      throw new PhoneTakenError("this phone number is already registered");
    }
    if (isUniqueViolation(err, "users_email_key")) {
      throw new EmailTakenError("this email is already registered");
    }
    throw err;
  }

  // Rider #1 -- every account needs a rider to book, and asking for the same
  // name twice (once for the account, once for "who's riding") is friction
  // signup already collected the answer to.
  await pool.query(`insert into riders (user_id, name) values ($1, $2)`, [userId, name]);

  const tokens = await createSession(pool, userId, input.deviceId);
  await writeAudit(pool, {
    actorType: "CUSTOMER",
    actorId: userId,
    action: "user.signed_up",
    entityType: "user",
    entityId: userId,
    after: { phone },
  });
  return { status: "LOGIN", ...tokens, user: { id: userId, phone, name, email } };
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505" &&
    (err as { constraint?: string }).constraint === constraint
  );
}

export interface RefreshInput {
  refreshToken: string;
  deviceId: string;
}

// ponytail: refresh-token reuse after rotation gets a generic 401, not
// family-wide revocation. Upgrade when there's a real incident: keep the
// previous hash + a rotation counter, revoke all sessions for the user on
// detected reuse.
export async function refreshSession(pool: Pool, input: RefreshInput): Promise<SessionTokens> {
  const tokenHash = hashRefreshToken(input.refreshToken);

  const { rows } = await pool.query(
    `select id, user_id, device_id, revoked_at, expires_at from sessions
     where token_hash = $1`,
    [tokenHash],
  );
  const session = rows[0];
  if (!session) throw new InvalidSessionError("refresh token not recognized");
  if (session.revoked_at) throw new InvalidSessionError("session revoked");
  if (new Date(session.expires_at).getTime() < Date.now()) {
    throw new InvalidSessionError("session expired");
  }
  // device_id is client-supplied, so this is defense-in-depth, not the
  // security boundary — the hash match + revoked/expires checks are that.
  if (session.device_id !== input.deviceId) {
    throw new InvalidSessionError("device mismatch");
  }

  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await pool.query(
    `update sessions
     set token_hash = $1, expires_at = $2, last_used_at = now()
     where id = $3`,
    [newTokenHash, newExpiresAt, session.id],
  );

  return {
    accessToken: signAccessToken({ uid: session.user_id, sid: session.id }),
    accessTokenExpiresIn: ACCESS_TOKEN_EXPIRES_IN,
    refreshToken: newRefreshToken,
  };
}

export interface LogoutInput {
  userId: string;
  refreshToken: string;
}

export async function logout(pool: Pool, input: LogoutInput): Promise<void> {
  const tokenHash = hashRefreshToken(input.refreshToken);
  await pool.query(
    `update sessions set revoked_at = now()
     where token_hash = $1 and user_id = $2 and revoked_at is null`,
    [tokenHash, input.userId],
  );
  await writeAudit(pool, {
    actorType: "CUSTOMER",
    actorId: input.userId,
    action: "user.logged_out",
    entityType: "session",
    entityId: null,
  });
}

export interface RevokeSessionInput {
  userId: string;
  sessionId: string;
}

/** Returns false when the session doesn't exist or isn't owned by this user — caller maps that to 404 without distinguishing the two. */
export async function revokeSession(pool: Pool, input: RevokeSessionInput): Promise<boolean> {
  const { rowCount } = await pool.query(
    `update sessions set revoked_at = now()
     where id = $1 and user_id = $2 and revoked_at is null`,
    [input.sessionId, input.userId],
  );
  return (rowCount ?? 0) > 0;
}
