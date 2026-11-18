import { afterEach, expect, test } from "bun:test";
import { hashOtp, verifyOtpHash } from "./authCrypto.ts";

const saved = { code: process.env.DEV_OTP_CODE, env: process.env.NODE_ENV };
afterEach(() => {
  process.env.DEV_OTP_CODE = saved.code;
  process.env.NODE_ENV = saved.env;
});

test("DEV_OTP_CODE is accepted alongside the real code, never in production", async () => {
  const stored = await hashOtp("111111");
  process.env.DEV_OTP_CODE = "123456";
  process.env.NODE_ENV = "development";
  expect(await verifyOtpHash("111111", stored)).toBe(true);
  expect(await verifyOtpHash("123456", stored)).toBe(true);
  expect(await verifyOtpHash("222222", stored)).toBe(false);
  process.env.NODE_ENV = "production";
  expect(await verifyOtpHash("123456", stored)).toBe(false);
  process.env.DEV_OTP_CODE = "";
  process.env.NODE_ENV = "development";
  expect(await verifyOtpHash("123456", stored)).toBe(false);
});
