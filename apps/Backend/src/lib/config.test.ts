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
  TWILIO_ACCOUNT_SID: "ACxxxx",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_FROM_NUMBER: "+15551234567",
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

  test("in production, a missing Twilio credential refuses to boot", () => {
    expect(() => assertConfig({ ...valid, NODE_ENV: "production" })).toThrow(/TWILIO_ACCOUNT_SID/);
  });

  test("in production, a complete config including every vendor passes", () => {
    expect(() => assertConfig(productionValid)).not.toThrow();
  });

  test("outside production, a missing Twilio credential is fine -- that's the dev fallback", () => {
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
    expect(() => assertConfig({ ...productionValid, DL_HASH_PEPPER: undefined })).toThrow(
      /DL_HASH_PEPPER/,
    );
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
