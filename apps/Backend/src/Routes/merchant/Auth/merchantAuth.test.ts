import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { uniquePhone } from "../../../test/fixtures.ts";
import {
  MerchantInvalidOtpError,
  MerchantInvalidSessionError,
  MerchantPhoneTakenError,
  completeMerchantSignup,
  merchantLogout,
  refreshMerchantSession,
  requestMerchantOtp,
  verifyMerchantOtp,
} from "./merchantAuthService.ts";
import { verifyAccessToken } from "../../user/Auth/token.ts";
import { verifyMerchantAccessToken } from "./token.ts";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

const DEVICE = "merchant-test-device";
const noopDeliver = async () => {};

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("merchant auth", () => {
  test("new phone requires signup, then login issues a merchant-audience token", async () => {
    const phone = uniquePhone();
    const challenge = await requestMerchantOtp(pool, phone, noopDeliver);
    const result = await verifyMerchantOtp(pool, { phone, code: challenge.code, deviceId: DEVICE });
    expect(result.status).toBe("SIGNUP_REQUIRED");

    const login = await completeMerchantSignup(pool, {
      signupTicket: (result as any).signupTicket,
      deviceId: DEVICE,
      name: "Test Merchant",
    });
    expect(login.status).toBe("LOGIN");
    expect(login.merchant.phone).toBe(phone);

    const payload = verifyMerchantAccessToken(login.accessToken);
    expect(payload?.mid).toBe(login.merchant.id);

    // A merchant token must never verify on the customer stack -- that's the
    // entire reason the `aud` claim exists.
    expect(verifyAccessToken(login.accessToken)).toBeNull();
  });

  test("a second signup for the same phone is rejected once the account exists", async () => {
    const phone = uniquePhone();
    const challenge = await requestMerchantOtp(pool, phone, noopDeliver);
    const otp = await verifyMerchantOtp(pool, { phone, code: challenge.code, deviceId: DEVICE });
    await completeMerchantSignup(pool, {
      signupTicket: (otp as any).signupTicket,
      deviceId: DEVICE,
      name: "First",
    });

    // Re-use the same (still-valid) signup ticket to force the race.
    await expect(
      completeMerchantSignup(pool, {
        signupTicket: (otp as any).signupTicket,
        deviceId: DEVICE,
        name: "Second",
      }),
    ).rejects.toBeInstanceOf(MerchantPhoneTakenError);
  });

  test("refresh rotates the token and logout revokes it", async () => {
    const phone = uniquePhone();
    const challenge = await requestMerchantOtp(pool, phone, noopDeliver);
    const otp = await verifyMerchantOtp(pool, { phone, code: challenge.code, deviceId: DEVICE });
    const login = await completeMerchantSignup(pool, {
      signupTicket: (otp as any).signupTicket,
      deviceId: DEVICE,
      name: "Refresher",
    });

    const refreshed = await refreshMerchantSession(pool, {
      refreshToken: login.refreshToken,
      deviceId: DEVICE,
    });
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);

    await merchantLogout(pool, {
      merchantUserId: verifyMerchantAccessToken(refreshed.accessToken)!.mid,
      refreshToken: refreshed.refreshToken,
    });

    await expect(
      refreshMerchantSession(pool, { refreshToken: refreshed.refreshToken, deviceId: DEVICE }),
    ).rejects.toBeInstanceOf(MerchantInvalidSessionError);
  });

  test("wrong OTP code is rejected", async () => {
    const phone = uniquePhone();
    await requestMerchantOtp(pool, phone, noopDeliver);
    await expect(
      verifyMerchantOtp(pool, { phone, code: "999999", deviceId: DEVICE }),
    ).rejects.toBeInstanceOf(MerchantInvalidOtpError);
  });
});
