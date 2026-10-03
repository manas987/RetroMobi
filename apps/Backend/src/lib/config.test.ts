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

describe("assertConfig", () => {
  test("a complete config passes", () => {
    expect(() => assertConfig(valid)).not.toThrow();
  });

  // The bug this exists for: the code read PLATFORM_GSTIN, the key was never in
  // .env, and every platform invoice was issued with a null GSTIN.
  test("a missing GSTIN stops the boot", () => {
    expect(() => assertConfig({ ...valid, PLATFORM_GSTIN: undefined })).toThrow(/PLATFORM_GSTIN/);
  });

  test("an empty or whitespace value counts as missing", () => {
    expect(() => assertConfig({ ...valid, PLATFORM_GSTIN: "   " })).toThrow(/PLATFORM_GSTIN/);
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
      for (const key of ["AUTH_ACCESS_TOKEN_SECRET", "GST_RATE", "PLATFORM_FEE_PCT", "PLATFORM_GSTIN"]) {
        expect(message).toContain(key);
      }
    }
  });
});
