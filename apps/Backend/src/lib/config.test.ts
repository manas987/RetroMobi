import { describe, expect, test } from "bun:test";
import { assertConfig } from "./config.ts";

const valid = {
  DATABASE_URL: "postgres://x",
  AUTH_ACCESS_TOKEN_SECRET: "s",
  GST_RATE: "18",
  PLATFORM_FEE_PCT: "10",
  PAYOUT_UPFRONT_PCT: "10",
  PLATFORM_GSTIN: "05ABCDE1234F1Z5",
};

const productionValid = {
  ...valid,
  NODE_ENV: "production",
  WHATSAPP_TOKEN: "token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_OTP_TEMPLATE: "retromobi_otp",
  CASHFREE_CLIENT_ID: "cf-id",
  CASHFREE_CLIENT_SECRET: "cf-secret",
  DL_HASH_PEPPER: "pepper",
  PUBLIC_APP_BASE_URL: "https://retromobi.example",
};

describe("assertConfig", () => {
  test("a complete config passes", () => {
    expect(() => assertConfig(valid)).not.toThrow();
  });

  // RetroMobi may not be GST-registered yet, so a missing GSTIN warns rather than
  // blocking anyone from running the app. The consequence is that no PLATFORM tax
  // invoice is issued -- see paymentsService.
  test("a missing GSTIN warns but does not stop the boot", () => {
    const warnings = assertConfig({ ...valid, PLATFORM_GSTIN: undefined });
    expect(warnings.join(" ")).toMatch(/PLATFORM_GSTIN/);
  });

  test("an empty or whitespace value counts as missing", () => {
    expect(assertConfig({ ...valid, PLATFORM_GSTIN: "   " }).join(" ")).toMatch(/PLATFORM_GSTIN/);
  });

  test("a complete config produces no warnings", () => {
    expect(assertConfig(valid)).toEqual([]);
  });

  test("a placeholder that is not GSTIN-shaped is rejected", () => {
    expect(() => assertConfig({ ...valid, PLATFORM_GSTIN: "CHANGEME" })).toThrow(/15-character/);
  });

  test("a non-numeric rate is rejected rather than silently becoming NaN", () => {
    expect(() => assertConfig({ ...valid, GST_RATE: "eighteen" })).toThrow(/GST_RATE/);
  });

  test("every problem is reported at once, not one per run", () => {
    try {
      assertConfig({ DATABASE_URL: "postgres://x" });
      throw new Error("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      for (const key of ["AUTH_ACCESS_TOKEN_SECRET", "GST_RATE", "PLATFORM_FEE_PCT"]) {
        expect(message).toContain(key);
      }
    }
  });

  test("in production, a missing WhatsApp credential refuses to boot", () => {
    for (const key of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_OTP_TEMPLATE"]) {
      expect(() => assertConfig({ ...productionValid, [key]: undefined })).toThrow(new RegExp(key));
    }
  });

  // Firebase is only the SMS fallback -- WhatsApp alone delivers every code.
  test("in production, Firebase is optional", () => {
    expect(() => assertConfig({ ...productionValid, FIREBASE_PROJECT_ID: undefined })).not.toThrow();
  });

  test("in production, a complete config including every vendor passes", () => {
    expect(() => assertConfig(productionValid)).not.toThrow();
  });

  test("outside production, a missing WhatsApp credential is fine -- that's the dev fallback", () => {
    expect(() => assertConfig(valid)).not.toThrow();
  });

  // kyc.ts used to return a faked VERIFIED licence when these were unset, and
  // nothing required them in production -- so every rider was approved without
  // a check. See the header comment in config.ts.
  test("in production, a missing Cashfree credential refuses to boot", () => {
    expect(() =>
      assertConfig({ ...productionValid, CASHFREE_CLIENT_ID: undefined }),
    ).toThrow(/CASHFREE_CLIENT_ID/);
  });

  test("outside production, a missing Cashfree credential is fine", () => {
    expect(() => assertConfig(valid)).not.toThrow();
  });

  // The hash is the only thing kept of a licence number, so a guessable hash
  // is the number. See lib/verificationHash.ts.
  test("in production, a missing licence-hash pepper refuses to boot", () => {
    expect(() => assertConfig({ ...productionValid, ONLINE_LICENCE_CHECK: "true", DL_HASH_PEPPER: undefined })).toThrow(
      /DL_HASH_PEPPER/,
    );
  });

  // Beta: no licence numbers are stored, so there is nothing to pepper.
  test("in production without the online licence check, the pepper is optional", () => {
    expect(() => assertConfig({ ...productionValid, ONLINE_LICENCE_CHECK: undefined, DL_HASH_PEPPER: undefined })).not.toThrow();
  });

  test("in production, the fake-licence escape hatch refuses to boot", () => {
    expect(() =>
      assertConfig({ ...productionValid, KYC_DEV_AUTO_VERIFY: "true" }),
    ).toThrow(/KYC_DEV_AUTO_VERIFY/);
  });

  test("an explicitly false escape hatch is not a problem in production", () => {
    expect(() =>
      assertConfig({ ...productionValid, KYC_DEV_AUTO_VERIFY: "false" }),
    ).not.toThrow();
  });

  test("outside production, the escape hatch is allowed -- that is its whole purpose", () => {
    expect(() => assertConfig({ ...valid, KYC_DEV_AUTO_VERIFY: "true" })).not.toThrow();
  });

  // Same shape as the licence hatch, with money instead of a licence: it fakes
  // a PAID Cashfree order, so a booking confirms without a payment.
  test("in production, the fake-payment escape hatch refuses to boot", () => {
    expect(() =>
      assertConfig({ ...productionValid, PAYMENTS_DEV_AUTO_SUCCEED: "true" }),
    ).toThrow(/PAYMENTS_DEV_AUTO_SUCCEED/);
  });

  test("in production, a master OTP code refuses to boot", () => {
    expect(() => assertConfig({ ...productionValid, DEV_OTP_CODE: "123456" })).toThrow(/DEV_OTP_CODE/);
  });

  test("outside production, the fake-payment hatch is allowed", () => {
    expect(() => assertConfig({ ...valid, PAYMENTS_DEV_AUTO_SUCCEED: "true" })).not.toThrow();
  });

  // Without it, Cashfree has no return_url: the customer pays and is stranded
  // on the gateway's page.
  test("in production, a missing app base URL refuses to boot", () => {
    expect(() =>
      assertConfig({ ...productionValid, PUBLIC_APP_BASE_URL: undefined }),
    ).toThrow(/PUBLIC_APP_BASE_URL/);
  });

  test("in production, an http app base URL refuses to boot", () => {
    expect(() =>
      assertConfig({ ...productionValid, PUBLIC_APP_BASE_URL: "http://retromobi.example" }),
    ).toThrow(/PUBLIC_APP_BASE_URL/);
  });
});
