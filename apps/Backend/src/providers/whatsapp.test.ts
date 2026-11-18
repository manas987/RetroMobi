import { afterEach, describe, expect, mock, test } from "bun:test";
import { notificationMessage, otpMessage, sendOtpWhatsApp, WhatsAppDeliveryError } from "./whatsapp.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_OTP_TEMPLATE;
  delete process.env.WHATSAPP_OTP_LANGUAGE;
  delete process.env.WHATSAPP_ONLY_TO;
  delete process.env.WHATSAPP_OTP_TEXT;
});

test("WHATSAPP_OTP_TEXT fills a second body slot, the button still gets the code", () => {
  process.env.WHATSAPP_OTP_TEMPLATE = "general_usecases_code";
  process.env.WHATSAPP_OTP_TEXT = "login";
  expect(otpMessage("+919999999999", "123456").template.components).toEqual([
    { type: "body", parameters: [{ type: "text", text: "123456" }, { type: "text", text: "login" }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
  ]);
});

test("WHATSAPP_ONLY_TO keeps real sends to the listed numbers", async () => {
  process.env.WHATSAPP_TOKEN = "t";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "p";
  process.env.WHATSAPP_OTP_TEMPLATE = "retromobi_otp";
  process.env.WHATSAPP_ONLY_TO = "+919000000001";
  const fetchMock = mock(async () => new Response("{}"));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  await sendOtpWhatsApp("+919812340000", "111111");
  expect(fetchMock).not.toHaveBeenCalled();
  await sendOtpWhatsApp("+919000000001", "111111");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

describe("WhatsApp payloads", () => {
  // Meta's documented shape for a copy-code Authentication template: the code
  // fills the body's {{1}} AND the url button at index 0.
  test("an OTP fills the body and the copy-code button with the same code", () => {
    process.env.WHATSAPP_OTP_TEMPLATE = "retromobi_otp";
    expect(otpMessage("+919999999999", "123456")).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "919999999999",
      type: "template",
      template: {
        name: "retromobi_otp",
        language: { code: "en_US" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "123456" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
        ],
      },
    });
  });

  test("a notification sends its params as body text, in order, in the configured language", () => {
    process.env.WHATSAPP_OTP_LANGUAGE = "en";
    const message = notificationMessage("+919999999999", "refund_processed", ["1,500", "b1"]);
    expect(message.template).toEqual({
      name: "refund_processed",
      language: { code: "en" },
      components: [{ type: "body", parameters: [{ type: "text", text: "1,500" }, { type: "text", text: "b1" }] }],
    });
  });
});

describe("sendOtpWhatsApp", () => {
  test("unconfigured logs and resolves -- the dev-fallback -- and never calls Meta", async () => {
    const fetchMock = mock(async () => new Response("{}"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const originalLog = console.log;
    console.log = mock(() => {});
    try {
      await expect(sendOtpWhatsApp("+919999999999", "123456")).resolves.toBeUndefined();
    } finally {
      console.log = originalLog;
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("posts to the phone number's messages endpoint with the bearer token", async () => {
    process.env.WHATSAPP_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "555";
    process.env.WHATSAPP_OTP_TEMPLATE = "retromobi_otp";
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://graph.facebook.com/v21.0/555/messages");
      expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
      return new Response("{}");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await sendOtpWhatsApp("+919999999999", "123456");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The OTP route turns this into a 502 otp_delivery_failed, which is the
  // client's cue to fall back to Firebase SMS.
  test("a non-ok response throws WhatsAppDeliveryError", async () => {
    process.env.WHATSAPP_TOKEN = "tok";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "555";
    globalThis.fetch = mock(async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    await expect(sendOtpWhatsApp("+919999999999", "123456")).rejects.toBeInstanceOf(WhatsAppDeliveryError);
  });
});
