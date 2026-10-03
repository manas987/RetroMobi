import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  EmailTakenError,
  InvalidOtpError,
  InvalidSessionError,
  InvalidTicketError,
  completeSignup,
  googlePrefill,
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

// Real sendOtpSms/sendOtpEmail hit Twilio and need live credentials;
// authService takes the delivery function as a parameter precisely so tests
// can pass a no-op here instead of mocking a whole module.
const noopDeliver = async () => {};

async function fakeVerifyGoogle(idToken: string) {
  if (idToken !== "valid-google-token") return null;
  // A fresh identity per call (not a fixed fixture email) so repeated test
  // runs against the same persistent Postgres never collide on uniqueness.
  return { email: uniqueEmail(), name: "Google User", googleSub: `google-sub-${seq}` };
}

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

  test("google prefill path creates the user with a verified email, no form-entered email trusted", async () => {
    const phone = uniquePhone();
    const signupTicket = await verifyPhoneForSignup(phone);
    const { googlePrefillTicket, email } = await googlePrefill(
      "valid-google-token",
      fakeVerifyGoogle,
    );

    const result = await completeSignup(pool, {
      signupTicket,
      deviceId: DEVICE,
      googlePrefillTicket,
    });

    expect(result.user.email).toBe(email);
    expect(result.user.name).toBe("Google User");
  });

  test("invalid google token is rejected", async () => {
    await expect(googlePrefill("garbage-token", fakeVerifyGoogle)).rejects.toBeInstanceOf(
      InvalidOtpError,
    );
  });

  test("completing signup without any verification ticket fails validation upstream of the service", async () => {
    // schema.ts's refine() is what actually blocks this at the HTTP boundary;
    // the service itself still defends in depth.
    const phone = uniquePhone();
    const signupTicket = await verifyPhoneForSignup(phone);
    await expect(
      completeSignup(pool, { signupTicket, deviceId: DEVICE, name: "No Email Proof" }),
    ).rejects.toThrow();
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
});
