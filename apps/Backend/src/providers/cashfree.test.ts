import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { appBaseUrl, cashfreeClient, cashfreeMode, PaymentsUnavailableError } from "./cashfree.ts";

// No DB and no network: every call below either reads env or goes through a
// stubbed global fetch. The point of this file is the two things that cannot be
// caught downstream -- a fake success that looks real, and a signature check
// that says yes to everything.

const ENV_KEYS = [
  "CASHFREE_CLIENT_ID",
  "CASHFREE_CLIENT_SECRET",
  "CASHFREE_BASE_URL",
  "PUBLIC_APP_BASE_URL",
  "PAYMENTS_DEV_AUTO_SUCCEED",
] as const;

let saved: Record<string, string | undefined>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  globalThis.fetch = realFetch;
});

/** Captures the one outbound request and answers it with `response`. */
function stubFetch(response: { status: number; body: unknown }) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return calls;
}

function configure() {
  process.env.CASHFREE_CLIENT_ID = "test-id";
  process.env.CASHFREE_CLIENT_SECRET = "test-secret";
  process.env.CASHFREE_BASE_URL = "https://sandbox.cashfree.com";
}

const order = {
  orderId: "order_abc",
  amount: 123400,
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  customerId: "cust_1234567890",
  customerPhone: "9876543210",
};

describe("failing closed with no credentials", () => {
  // The whole reason this file exists. kyc.ts had exactly this bug and it
  // approved every driving licence in production; the payments twin confirms
  // bookings nobody paid for.
  test("createOrder throws rather than faking a payment session", async () => {
    await expect(cashfreeClient.createOrder(order)).rejects.toBeInstanceOf(PaymentsUnavailableError);
  });

  test("getOrder throws rather than claiming PAID", async () => {
    await expect(cashfreeClient.getOrder("order_abc")).rejects.toBeInstanceOf(PaymentsUnavailableError);
  });

  test("refund throws rather than claiming the money went back", async () => {
    await expect(
      cashfreeClient.refund({ orderId: "order_abc", refundId: "rf_1", amount: 100 }),
    ).rejects.toBeInstanceOf(PaymentsUnavailableError);
  });

  test("the escape hatch brings the fakes back, and only when explicitly set", async () => {
    process.env.PAYMENTS_DEV_AUTO_SUCCEED = "true";
    const created = await cashfreeClient.createOrder(order);
    expect(created.paymentSessionId).toBe("fake_session_order_abc");
    expect((await cashfreeClient.getOrder("order_abc"))?.orderStatus).toBe("PAID");
  });

  test("a value other than the exact string 'true' is off", async () => {
    process.env.PAYMENTS_DEV_AUTO_SUCCEED = "1";
    await expect(cashfreeClient.createOrder(order)).rejects.toBeInstanceOf(PaymentsUnavailableError);
  });

  // NOT covered by the escape hatch, deliberately. This used to return true for
  // every request with no secret set, so any non-production deploy with a public
  // URL confirmed a booking for whoever POSTed a JSON body.
  test("webhook signature verification is false with no secret, even with the hatch on", () => {
    process.env.PAYMENTS_DEV_AUTO_SUCCEED = "true";
    expect(cashfreeClient.verifyWebhookSignature("{}", "anything", "123")).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  // signedPayload = x-webhook-timestamp + rawBody, HMAC-SHA256 with the client
  // secret, base64. Verbatim from the docs; see docs/payments.md.
  test("accepts a signature over timestamp + rawBody", () => {
    configure();
    const rawBody = '{"type":"PAYMENT_SUCCESS"}';
    const timestamp = "1762000000";
    const signature = createHmac("sha256", "test-secret").update(timestamp + rawBody).digest("base64");
    expect(cashfreeClient.verifyWebhookSignature(rawBody, signature, timestamp)).toBe(true);
  });

  test("rejects the body signed without the timestamp", () => {
    configure();
    const rawBody = '{"type":"PAYMENT_SUCCESS"}';
    const signature = createHmac("sha256", "test-secret").update(rawBody).digest("base64");
    expect(cashfreeClient.verifyWebhookSignature(rawBody, signature, "1762000000")).toBe(false);
  });

  test("rejects a tampered body", () => {
    configure();
    const timestamp = "1762000000";
    const signature = createHmac("sha256", "test-secret")
      .update(timestamp + '{"amount":1}')
      .digest("base64");
    expect(cashfreeClient.verifyWebhookSignature('{"amount":100000}', signature, timestamp)).toBe(false);
  });

  test("rejects a missing signature or timestamp outright", () => {
    configure();
    expect(cashfreeClient.verifyWebhookSignature("{}", "", "1762000000")).toBe(false);
    expect(cashfreeClient.verifyWebhookSignature("{}", "sig", "")).toBe(false);
  });
});

describe("createOrder request body", () => {
  test("sends the documented field names, and a customer id that is not the order id", async () => {
    configure();
    process.env.PUBLIC_APP_BASE_URL = "https://retromobi.example";
    const calls = stubFetch({ status: 200, body: { payment_session_id: "sess_1" } });

    await cashfreeClient.createOrder({ ...order, returnUrl: "https://retromobi.example/checkout/return?group=g1" });

    expect(calls[0]!.url).toBe("https://sandbox.cashfree.com/pg/orders");
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers["x-api-version"]).toBe("2026-01-01");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.order_id).toBe("order_abc");
    // paise -> rupees
    expect(body.order_amount).toBe(1234);
    expect(body.customer_details.customer_id).toBe("cust_1234567890");
    expect(body.customer_details.customer_id).not.toBe(body.order_id);
    expect(body.customer_details.customer_phone).toBe("9876543210");
    expect(body.order_meta.return_url).toBe("https://retromobi.example/checkout/return?group=g1");
    expect(body.order_meta.notify_url).toBe("https://retromobi.example/api/user/payments/webhook");
  });

  test("omits notify_url when the app base URL is not https -- Cashfree rejects it", async () => {
    configure();
    process.env.PUBLIC_APP_BASE_URL = "http://localhost:5173";
    const calls = stubFetch({ status: 200, body: { payment_session_id: "sess_1" } });

    await cashfreeClient.createOrder({ ...order, returnUrl: "http://localhost:5173/checkout/return" });

    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.order_meta.notify_url).toBeUndefined();
    expect(body.order_meta.return_url).toBe("http://localhost:5173/checkout/return");
  });

  test("clamps an expiry below the documented 5-minute minimum", async () => {
    configure();
    const calls = stubFetch({ status: 200, body: { payment_session_id: "sess_1" } });

    // 90 seconds left on the hold: a real state, since the customer can press
    // Pay at any point in the ten minutes.
    const result = await cashfreeClient.createOrder({
      ...order,
      expiresAt: new Date(Date.now() + 90 * 1000),
    });

    const body = JSON.parse(String(calls[0]!.init!.body));
    const sent = new Date(body.order_expiry_time).getTime();
    expect(sent).toBeGreaterThanOrEqual(Date.now() + 4.5 * 60 * 1000);
    expect(new Date(result.expiresAt).getTime()).toBe(sent);
  });

  test("a 409 reuses the existing order instead of failing the retry", async () => {
    configure();
    // Our order id is derived from the booking group, so the second attempt at
    // the payment screen ALWAYS collides. This used to throw.
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ code: "order_already_exists" }), { status: 409 });
      }
      return new Response(
        JSON.stringify({ order_status: "ACTIVE", payment_session_id: "sess_existing" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const created = await cashfreeClient.createOrder(order);
    expect(created.paymentSessionId).toBe("sess_existing");
  });
});

describe("getOrder", () => {
  test("reads order_status", async () => {
    configure();
    stubFetch({ status: 200, body: { order_status: "PAID", payment_session_id: "s" } });
    expect((await cashfreeClient.getOrder("order_abc"))?.orderStatus).toBe("PAID");
  });

  test("a 404 is null -- no evidence of payment, not an exception", async () => {
    configure();
    stubFetch({ status: 404, body: { message: "order not found" } });
    expect(await cashfreeClient.getOrder("order_abc")).toBeNull();
  });
});

describe("refund status mapping", () => {
  // Cashfree's documented values are SUCCESS, PENDING, PENDING_APPROVAL,
  // CANCELLED, ONHOLD, REJECTED. The old code mapped on "FAILED", which is not
  // one of them, so a REJECTED refund stayed PENDING forever and nobody ever
  // learned the customer had not been paid back.
  const cases: Array<[string, "PENDING" | "SUCCEEDED" | "FAILED"]> = [
    ["SUCCESS", "SUCCEEDED"],
    ["PENDING", "PENDING"],
    ["PENDING_APPROVAL", "PENDING"],
    ["ONHOLD", "PENDING"],
    ["CANCELLED", "FAILED"],
    ["REJECTED", "FAILED"],
    ["SOMETHING_NEW", "PENDING"],
  ];

  for (const [vendor, expected] of cases) {
    test(`${vendor} -> ${expected}`, async () => {
      configure();
      stubFetch({ status: 200, body: { refund_status: vendor } });
      const result = await cashfreeClient.refund({ orderId: "order_abc", refundId: "rf_1", amount: 100 });
      expect(result.status).toBe(expected);
    });
  }
});

describe("derived settings", () => {
  test("the SDK mode comes from the base URL, so the two cannot disagree", () => {
    process.env.CASHFREE_BASE_URL = "https://sandbox.cashfree.com";
    expect(cashfreeMode()).toBe("sandbox");
    process.env.CASHFREE_BASE_URL = "https://api.cashfree.com";
    expect(cashfreeMode()).toBe("production");
    delete process.env.CASHFREE_BASE_URL;
    expect(cashfreeMode()).toBe("production");
  });

  test("the app base URL loses its trailing slash, so built URLs have no double slash", () => {
    process.env.PUBLIC_APP_BASE_URL = "https://retromobi.example/";
    expect(appBaseUrl()).toBe("https://retromobi.example");
    delete process.env.PUBLIC_APP_BASE_URL;
    expect(appBaseUrl()).toBeNull();
  });
});
