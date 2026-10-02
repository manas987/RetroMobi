import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
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

const PHONE = "+919999999999";
const DEVICE = "test-device";
const EMAIL = "rider@example.com";

// Real sendOtpSms/sendOtpEmail hit Twilio and need live credentials;
// authService takes the delivery function as a parameter precisely so tests
// can pass a no-op here instead of mocking a whole module.
const noopDeliver = async () => {};

async function fakeVerifyGoogle(idToken: string) {
  if (idToken !== "valid-google-token") return null;
  return { email: "googleuser@example.com", name: "Google User", googleSub: "google-sub-1" };
}

beforeAll(async () => {
  await applyMigrations(pool);
});

beforeEach(async () => {
  await pool.query("truncate users, sessions, otp_challenges cascade");
});

afterAll(async () => {
  await pool.end();
});

async function verifyPhoneForSignup(phone = PHONE) {
  const { code } = await requestOtp(pool, phone, noopDeliver);
  const result = await verifyOtp(pool, { phone, code, deviceId: DEVICE });
  if (result.status !== "SIGNUP_REQUIRED") throw new Error("expected SIGNUP_REQUIRED");
  return result.signupTicket;
}

async function verifyEmailForSignup(signupTicket: string, email = EMAIL) {
  const { code } = await requestEmailOtp(pool, { signupTicket, email }, noopDeliver);
  return verifyEmailOtp(pool, { signupTicket, email, code });
}

describe("phone otp -> login/signup branch", () => {
  test("new phone returns SIGNUP_REQUIRED and creates nothing yet", async () => {
    const { code } = await requestOtp(pool, PHONE, noopDeliver);
    const result = await verifyOtp(pool, { phone: PHONE, code, deviceId: DEVICE });

    expect(result.status).toBe("SIGNUP_REQUIRED");
    const { rows } = await pool.query("select * from users where phone = $1", [PHONE]);
    expect(rows).toHaveLength(0);
  });

  test("existing phone logs in directly", async () => {
    const signupTicket = await verifyPhoneForSignup();
    const emailTicket = await verifyEmailForSignup(signupTicket);
    await completeSignup(pool, {
      signupTicket,
      deviceId: DEVICE,
      name: "Rider One",
      email: EMAIL,
      emailVerificationTicket: emailTicket.emailVerificationTicket,
    });

    const { code } = await requestOtp(pool, PHONE, noopDeliver);
    const result = await verifyOtp(pool, { phone: PHONE, code, deviceId: "other-device" });

    expect(result.status).toBe("LOGIN");
    if (result.status === "LOGIN") {
      expect(result.user.email).toBe(EMAIL);
    }
  });

  test("wrong code is rejected and increments attempt_count", async () => {
    await requestOtp(pool, PHONE, noopDeliver);

    await expect(
      verifyOtp(pool, { phone: PHONE, code: "000000", deviceId: DEVICE }),
    ).rejects.toBeInstanceOf(InvalidOtpError);

    const { rows } = await pool.query(
      "select attempt_count from otp_challenges where target = $1",
      [PHONE],
    );
    expect(rows[0].attempt_count).toBe(1);
  });

  test("4th OTP send within the window is rate limited", async () => {
    await requestOtp(pool, PHONE, noopDeliver);
    await requestOtp(pool, PHONE, noopDeliver);
    await requestOtp(pool, PHONE, noopDeliver);

    await expect(requestOtp(pool, PHONE, noopDeliver)).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("signup completion", () => {
  test("email OTP path creates the user and logs in", async () => {
    const signupTicket = await verifyPhoneForSignup();
    const { emailVerificationTicket } = await verifyEmailForSignup(signupTicket);

    const result = await completeSignup(pool, {
      signupTicket,
      deviceId: DEVICE,
      name: "Rider One",
      email: EMAIL,
      emailVerificationTicket,
    });

    expect(result.status).toBe("LOGIN");
    expect(result.user.email).toBe(EMAIL);
    expect(result.user.name).toBe("Rider One");

    const { rows } = await pool.query(
      "select email_verified_at from users where phone = $1",
      [PHONE],
    );
    expect(rows[0].email_verified_at).not.toBeNull();
  });

  test("google prefill path creates the user with a verified email, no form-entered email trusted", async () => {
    const signupTicket = await verifyPhoneForSignup();
    const { googlePrefillTicket } = await googlePrefill("valid-google-token", fakeVerifyGoogle);

    const result = await completeSignup(pool, {
      signupTicket,
      deviceId: DEVICE,
      googlePrefillTicket,
    });

    expect(result.user.email).toBe("googleuser@example.com");
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
    const signupTicket = await verifyPhoneForSignup();
    await expect(
      completeSignup(pool, { signupTicket, deviceId: DEVICE, name: "No Email Proof" }),
    ).rejects.toThrow();
  });

  test("duplicate email on signup is rejected", async () => {
    const ticketA = await verifyPhoneForSignup("+919888800001");
    const emailA = await verifyEmailForSignup(ticketA, EMAIL);
    await completeSignup(pool, {
      signupTicket: ticketA,
      deviceId: DEVICE,
      name: "First",
      email: EMAIL,
      emailVerificationTicket: emailA.emailVerificationTicket,
    });

    const ticketB = await verifyPhoneForSignup("+919888800002");
    const emailB = await verifyEmailForSignup(ticketB, EMAIL);
    await expect(
      completeSignup(pool, {
        signupTicket: ticketB,
        deviceId: DEVICE,
        name: "Second",
        email: EMAIL,
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
        email: EMAIL,
        emailVerificationTicket: "also-fake",
      }),
    ).rejects.toBeInstanceOf(InvalidTicketError);
  });
});

describe("sessions", () => {
  async function signUpAndLogin() {
    const signupTicket = await verifyPhoneForSignup();
    const { emailVerificationTicket } = await verifyEmailForSignup(signupTicket);
    return completeSignup(pool, {
      signupTicket,
      deviceId: DEVICE,
      name: "Rider One",
      email: EMAIL,
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
