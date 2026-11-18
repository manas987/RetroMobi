import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  EmailTakenError,
  InvalidOtpError,
  InvalidSessionError,
  InvalidTicketError,
  completeSignup,
  requestAccountEmailOtp,
  verifyAccountEmail,
  listSessions,
  logout,
  refreshSession,
  requestEmailOtp,
  requestOtp,
  revokeSession,
  verifyEmailOtp,
  verifyOtp,
  RateLimitedError,
} from "./authService.ts";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

const DEVICE = "test-device";

// No truncate-between-tests: every test generates its own unique phone/email
// instead, so tests don't need to be isolated by wiping shared state — and
// re-running `bun test` repeatedly against the same (non-ephemeral) Postgres
// never collides with leftover rows from a previous run either.
let seq = 0;
function uniquePhone(): string {
  seq += 1;
  const suffix = (Date.now() + seq) % 1_000_000_000;
  return `+917${suffix.toString().padStart(9, "0")}`;
}
function uniqueEmail(): string {
  seq += 1;
  return `rider${Date.now()}${seq}@example.com`;
}

// Real sendOtpWhatsApp/sendOtpEmail hit Meta/Resend and need live credentials;
// authService takes the delivery function as a parameter precisely so tests
// can pass a no-op here instead of mocking a whole module.
const noopDeliver = async () => {};

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

async function verifyPhoneForSignup(phone: string) {
  const { code } = await requestOtp(pool, phone, noopDeliver);
  const result = await verifyOtp(pool, { phone, code, deviceId: DEVICE });
  if (result.status !== "SIGNUP_REQUIRED") throw new Error("expected SIGNUP_REQUIRED");
  return result.signupTicket;
}

async function verifyEmailForSignup(signupTicket: string, email: string) {
  const { code } = await requestEmailOtp(pool, { signupTicket, email }, noopDeliver);
  return verifyEmailOtp(pool, { signupTicket, email, code });
}

describe("phone otp -> login/signup branch", () => {
  test("new phone returns SIGNUP_REQUIRED and creates nothing yet", async () => {
    const phone = uniquePhone();
    const { code } = await requestOtp(pool, phone, noopDeliver);
    const result = await verifyOtp(pool, { phone, code, deviceId: DEVICE });

    expect(result.status).toBe("SIGNUP_REQUIRED");
    const { rows } = await pool.query("select * from users where phone = $1", [phone]);
    expect(rows).toHaveLength(0);
  });

  test("existing phone logs in directly", async () => {
    const phone = uniquePhone();
    const email = uniqueEmail();
    const signupTicket = await verifyPhoneForSignup(phone);
    const emailTicket = await verifyEmailForSignup(signupTicket, email);
    await completeSignup(pool, {
      signupTicket,
      deviceId: DEVICE,
      name: "Rider One",
      email,
      emailVerificationTicket: emailTicket.emailVerificationTicket,
    });

    const { code } = await requestOtp(pool, phone, noopDeliver);
    const result = await verifyOtp(pool, { phone, code, deviceId: "other-device" });

    expect(result.status).toBe("LOGIN");
    if (result.status === "LOGIN") {
      expect(result.user.email).toBe(email);
    }
  });

  test("wrong code is rejected and increments attempt_count", async () => {
    const phone = uniquePhone();
    await requestOtp(pool, phone, noopDeliver);

    await expect(
      verifyOtp(pool, { phone, code: "000000", deviceId: DEVICE }),
    ).rejects.toBeInstanceOf(InvalidOtpError);

    const { rows } = await pool.query(
      "select attempt_count from otp_challenges where target = $1",
      [phone],
    );
    expect(rows[0].attempt_count).toBe(1);
  });

  test("4th OTP send within the window is rate limited", async () => {
    const phone = uniquePhone();
    await requestOtp(pool, phone, noopDeliver);
    await requestOtp(pool, phone, noopDeliver);
    await requestOtp(pool, phone, noopDeliver);

    await expect(requestOtp(pool, phone, noopDeliver)).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("signup completion", () => {
  test("email OTP path creates the user and logs in", async () => {
    const phone = uniquePhone();
    const email = uniqueEmail();
    const signupTicket = await verifyPhoneForSignup(phone);
    const { emailVerificationTicket } = await verifyEmailForSignup(signupTicket, email);

    const result = await completeSignup(pool, {
      signupTicket,
      deviceId: DEVICE,
      name: "Rider One",
      email,
      emailVerificationTicket,
    });

    expect(result.status).toBe("LOGIN");
    expect(result.user.email).toBe(email);
    expect(result.user.name).toBe("Rider One");

    const { rows } = await pool.query(
      "select email_verified_at from users where phone = $1",
      [phone],
    );
    expect(rows[0].email_verified_at).not.toBeNull();
  });

  test("email is optional: signup with no email creates the user with none", async () => {
    const phone = uniquePhone();
    const signupTicket = await verifyPhoneForSignup(phone);
    const result = await completeSignup(pool, { signupTicket, deviceId: DEVICE, name: "No Email" });

    expect(result.status).toBe("LOGIN");
    expect(result.user.email).toBeNull();
    const { rows } = await pool.query("select email, email_verified_at from users where phone = $1", [phone]);
    expect(rows[0]).toEqual({ email: null, email_verified_at: null });
  });

  test("a typed email without its verification ticket is not saved", async () => {
    const phone = uniquePhone();
    const signupTicket = await verifyPhoneForSignup(phone);
    await completeSignup(pool, { signupTicket, deviceId: DEVICE, name: "Unverified", email: uniqueEmail() });
    const { rows } = await pool.query("select email from users where phone = $1", [phone]);
    expect(rows[0].email).toBeNull();
  });

  test("an invalid email verification ticket is rejected", async () => {
    const signupTicket = await verifyPhoneForSignup(uniquePhone());
    await expect(
      completeSignup(pool, { signupTicket, deviceId: DEVICE, name: "Forged", emailVerificationTicket: "garbage" }),
    ).rejects.toBeInstanceOf(InvalidTicketError);
  });

  test("duplicate email on signup is rejected", async () => {
    const sharedEmail = uniqueEmail();

    const ticketA = await verifyPhoneForSignup(uniquePhone());
    const emailA = await verifyEmailForSignup(ticketA, sharedEmail);
    await completeSignup(pool, {
      signupTicket: ticketA,
      deviceId: DEVICE,
      name: "First",
      email: sharedEmail,
      emailVerificationTicket: emailA.emailVerificationTicket,
    });

    const ticketB = await verifyPhoneForSignup(uniquePhone());
    const emailB = await verifyEmailForSignup(ticketB, sharedEmail);
    await expect(
      completeSignup(pool, {
        signupTicket: ticketB,
        deviceId: DEVICE,
        name: "Second",
        email: sharedEmail,
        emailVerificationTicket: emailB.emailVerificationTicket,
      }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  test("expired/invalid signup ticket is rejected", async () => {
    await expect(
      completeSignup(pool, {
        signupTicket: "not-a-real-ticket",
        deviceId: DEVICE,
        name: "Nobody",
        email: uniqueEmail(),
        emailVerificationTicket: "also-fake",
      }),
    ).rejects.toBeInstanceOf(InvalidTicketError);
  });
});

describe("sessions", () => {
  async function signUpAndLogin() {
    const email = uniqueEmail();
    const signupTicket = await verifyPhoneForSignup(uniquePhone());
    const { emailVerificationTicket } = await verifyEmailForSignup(signupTicket, email);
    return completeSignup(pool, {
      signupTicket,
      deviceId: DEVICE,
      name: "Rider One",
      email,
      emailVerificationTicket,
    });
  }

  test("refresh rotates the token and invalidates the old one", async () => {
    const { refreshToken } = await signUpAndLogin();

    const refreshed = await refreshSession(pool, { refreshToken, deviceId: DEVICE });
    expect(refreshed.refreshToken).not.toBe(refreshToken);

    await expect(
      refreshSession(pool, { refreshToken, deviceId: DEVICE }),
    ).rejects.toBeInstanceOf(InvalidSessionError);

    const stillWorks = await refreshSession(pool, {
      refreshToken: refreshed.refreshToken,
      deviceId: DEVICE,
    });
    expect(stillWorks.accessToken).toBeTruthy();
  });

  test("logout revokes the session so refresh fails", async () => {
    const { refreshToken, user } = await signUpAndLogin();

    await logout(pool, { userId: user.id, refreshToken });

    await expect(
      refreshSession(pool, { refreshToken, deviceId: DEVICE }),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  test("revokeSession revokes a specific device's session", async () => {
    const { user } = await signUpAndLogin();

    const { rows } = await pool.query("select id from sessions where user_id = $1", [user.id]);
    const sessionId = rows[0].id;

    const found = await revokeSession(pool, { userId: user.id, sessionId });
    expect(found).toBe(true);

    const notFound = await revokeSession(pool, { userId: user.id, sessionId });
    expect(notFound).toBe(false);
  });

  test("repeated logins share one device row and signing it out revokes all of its sessions", async () => {
    const { user, refreshToken } = await signUpAndLogin();
    const { rows: [first] } = await pool.query("select id from sessions where user_id = $1", [user.id]);
    const { code } = await requestOtp(pool, user.phone, noopDeliver);
    const repeat = await verifyOtp(pool, {
      phone: user.phone, code, deviceId: DEVICE,
      sessionDetails: { deviceName: "Mac", browserName: "Safari", loginLocation: "Dehradun, India" },
    });
    if (repeat.status !== "LOGIN") throw new Error("expected LOGIN");
    await pool.query(
      `insert into sessions (user_id, token_hash, device_id, expires_at)
       values ($1, $2, 'another-browser', now() + interval '1 day')`,
      [user.id, uniqueEmail()],
    );

    const devices = await listSessions(pool, user.id, first.id);
    expect(devices).toHaveLength(2);
    expect(devices[0]).toMatchObject({
      is_current: true, device_name: "Mac", browser_name: "Safari", login_location: "Dehradun, India",
    });
    expect(devices[0]).not.toHaveProperty("device_id");
    expect(await revokeSession(pool, { userId: user.id, sessionId: devices[0].id })).toBe(true);
    await expect(refreshSession(pool, { deviceId: DEVICE, refreshToken })).rejects.toBeInstanceOf(InvalidSessionError);
    await expect(refreshSession(pool, { deviceId: DEVICE, refreshToken: repeat.refreshToken })).rejects.toBeInstanceOf(InvalidSessionError);
    expect(await listSessions(pool, user.id)).toHaveLength(1);
  });
});

describe("adding an email after signup", () => {
  async function userWithoutEmail() {
    const signupTicket = await verifyPhoneForSignup(uniquePhone());
    const result = await completeSignup(pool, { signupTicket, deviceId: DEVICE, name: "Later Email" });
    return result.user.id as string;
  }

  test("a verified code saves the email as verified", async () => {
    const userId = await userWithoutEmail();
    const email = uniqueEmail();
    const { code } = await requestAccountEmailOtp(pool, email, noopDeliver);
    const account = await verifyAccountEmail(pool, userId, email, code);
    expect(account.email).toBe(email);
    expect(account.email_verified_at).not.toBeNull();
  });

  test("a wrong code saves nothing", async () => {
    const userId = await userWithoutEmail();
    const email = uniqueEmail();
    await requestAccountEmailOtp(pool, email, noopDeliver);
    await expect(verifyAccountEmail(pool, userId, email, "000000")).rejects.toBeInstanceOf(InvalidOtpError);
    const { rows } = await pool.query("select email from users where id = $1", [userId]);
    expect(rows[0].email).toBeNull();
  });

  test("an email another account uses is refused", async () => {
    const taken = uniqueEmail();
    const first = await userWithoutEmail();
    const second = await userWithoutEmail();
    const a = await requestAccountEmailOtp(pool, taken, noopDeliver);
    await verifyAccountEmail(pool, first, taken, a.code);
    const b = await requestAccountEmailOtp(pool, taken, noopDeliver);
    await expect(verifyAccountEmail(pool, second, taken, b.code)).rejects.toBeInstanceOf(EmailTakenError);
  });
});
