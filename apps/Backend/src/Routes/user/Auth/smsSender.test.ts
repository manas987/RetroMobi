import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { SmsDeliveryError, sendOtpSms } from "./smsSender.ts";

const ENV_KEYS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"] as const;
const originalEnv: Record<string, string | undefined> = {};
const originalFetch = globalThis.fetch;

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  globalThis.fetch = originalFetch;
});

describe("sendOtpSms", () => {
  test("throws if Twilio config is missing", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;

    await expect(sendOtpSms("+919999999999", "123456")).rejects.toThrow();
  });

  test("posts to Twilio's Messages API with basic auth and the code in the body", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxx";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_NUMBER = "+15005550006";

    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages.json");
      expect(init.headers).toMatchObject({
        Authorization: `Basic ${Buffer.from("ACxxx:secret").toString("base64")}`,
      });
      expect(String(init.body)).toContain("123456");
      return new Response("{}", { status: 201 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendOtpSms("+919999999999", "123456");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("throws SmsDeliveryError on a non-ok response", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxx";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_NUMBER = "+15005550006";

    globalThis.fetch = mock(async () => new Response("bad request", { status: 400 })) as unknown as typeof fetch;

    await expect(sendOtpSms("+919999999999", "123456")).rejects.toBeInstanceOf(SmsDeliveryError);
  });
});
