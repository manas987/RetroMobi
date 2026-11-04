// Cashfree Payment Gateway -- orders and refunds. Payouts are a SEPARATE
// Cashfree product with its own base path, API version and credentials; see
// providers/cashfreePayout.ts.
//
// Every path, header, field name and status value below was checked against
// the live Cashfree docs on 2026-11-02 and is recorded, with source links, in
// docs/payments.md. Do not change one from memory.
//
// What the previous version of this file got wrong, for the record:
//   - x-api-version was 2023-08-01 (a previous version; current is 2026-01-01)
//   - order_meta was never sent, so there was no return_url and no notify_url
//   - customer_details.customer_id was the order id, not the customer
//   - refund_status "FAILED" is not a documented value; CANCELLED/REJECTED are,
//     and both were being mapped to PENDING -- i.e. a refused refund looked
//     like one still in flight, forever
//   - a 409 on a repeated order_id (which is guaranteed, the id is derived from
//     the group) threw instead of reusing the existing order
//   - transfer() posted to /pg/easy-split/transfers, WHICH DOES NOT EXIST

import { createHmac } from "node:crypto";

const API_VERSION = "2026-01-01";

/** Documented minimum for order_expiry_time. A shorter one 400s the create. */
const MIN_ORDER_TTL_MS = 5 * 60 * 1000;

export type CashfreeOrderStatus =
  | "ACTIVE"
  | "PAID"
  | "EXPIRED"
  | "TERMINATED"
  | "TERMINATION_REQUESTED";

/** The vendor is not configured, so nothing happened. Never a success. */
export class PaymentsUnavailableError extends Error {}

export interface CashfreeClient {
  createOrder(args: {
    orderId: string;
    amount: number;
    expiresAt: Date;
    customerId: string;
    customerPhone: string;
    customerName?: string;
    /** Where the browser lands after checkout. Absolute; see appBaseUrl(). */
    returnUrl?: string;
  }): Promise<{ orderId: string; paymentSessionId: string; expiresAt: Date }>;
  /** The authoritative answer to "has this been paid". Nothing else is. */
  getOrder(orderId: string): Promise<{
    orderStatus: CashfreeOrderStatus;
    paymentSessionId: string | null;
  } | null>;
  refund(args: {
    orderId: string;
    refundId: string;
    amount: number;
  }): Promise<{ refundId: string; status: "PENDING" | "SUCCEEDED" | "FAILED" }>;
  verifyWebhookSignature(rawBody: string, signature: string, timestamp: string): boolean;
}

function getConfig(): { clientId: string; clientSecret: string; baseUrl: string } | null {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const baseUrl = process.env.CASHFREE_BASE_URL ?? "https://api.cashfree.com";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, baseUrl };
}

/**
 * Which environment the credentials point at, derived from the base URL rather
 * than configured separately. The browser SDK needs this (`load({mode})`), and
 * two settings that can disagree about which environment you are in is how a
 * production payment session gets handed to the sandbox SDK.
 */
export function cashfreeMode(): "sandbox" | "production" {
  const baseUrl = process.env.CASHFREE_BASE_URL ?? "https://api.cashfree.com";
  return baseUrl.includes("sandbox") ? "sandbox" : "production";
}

/**
 * The public origin of the customer-facing app, used to build the Cashfree
 * return_url and notify_url. Not optional in production -- without it the
 * customer is never sent back from the payment page.
 */
export function appBaseUrl(): string | null {
  const raw = process.env.PUBLIC_APP_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/**
 * The other providers' dev-fallbacks return a fake success so the whole app
 * runs on a laptop with an empty .env (backend.md's "Provider dev-fallback").
 * Money is the same shape of problem as KYC: a faked payment confirms a
 * booking nobody paid for. So the fake is opt-in and local-only, exactly like
 * KYC_DEV_AUTO_VERIFY, and `assertConfig` refuses to boot in production if it
 * is set.
 *
 * It deliberately does NOT cover verifyWebhookSignature -- see below.
 */
function devAutoSucceed(): boolean {
  return process.env.PAYMENTS_DEV_AUTO_SUCCEED === "true";
}

function headers(clientId: string, clientSecret: string) {
  return {
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
    "x-api-version": API_VERSION,
    "Content-Type": "application/json",
  };
}

// All amounts in this codebase are integer paise; Cashfree's PG API takes rupees.
function paiseToRupees(paise: number): number {
  return paise / 100;
}

function unavailable(what: string): never {
  throw new PaymentsUnavailableError(
    `Cashfree is not configured, so ${what} did not happen. ` +
      `Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET, or PAYMENTS_DEV_AUTO_SUCCEED=true for local work.`,
  );
}

/**
 * Cashfree's documented refund_status values, mapped onto ours. Anything
 * unrecognised stays PENDING: an unknown status is not evidence the money
 * moved, and it is not evidence it failed either.
 */
function mapRefundStatus(raw: unknown): "PENDING" | "SUCCEEDED" | "FAILED" {
  switch (raw) {
    case "SUCCESS":
      return "SUCCEEDED";
    // REJECTED and CANCELLED are terminal refusals. Leaving them PENDING (as
    // this did) means nobody ever learns the customer did not get their money.
    case "CANCELLED":
    case "REJECTED":
      return "FAILED";
    case "PENDING":
    case "PENDING_APPROVAL":
    case "ONHOLD":
      return "PENDING";
    default:
      return "PENDING";
  }
}

export const cashfreeClient: CashfreeClient = {
  async createOrder({ orderId, amount, expiresAt, customerId, customerPhone, customerName, returnUrl }) {
    const config = getConfig();
    if (!config) {
      if (!devAutoSucceed()) unavailable(`creating order ${orderId}`);
      console.log(`[dev-fallback] Cashfree.createOrder faking order ${orderId} for ${amount} paise`);
      return { orderId, paymentSessionId: `fake_session_${orderId}`, expiresAt };
    }
    const { clientId, clientSecret, baseUrl } = config;

    // The hold can have less than the documented 5-minute minimum left on it
    // by the time the customer presses Pay. Clamping means a late attempt is
    // refused by the hold sweep (and refunded if it somehow lands), rather
    // than failing to produce an order at all with an opaque 400.
    const minExpiry = new Date(Date.now() + MIN_ORDER_TTL_MS);
    const orderExpiry = expiresAt.getTime() < minExpiry.getTime() ? minExpiry : expiresAt;

    const orderMeta: Record<string, string> = {};
    if (returnUrl) orderMeta.return_url = returnUrl;
    // notify_url MUST be https per the docs. On a laptop the base URL is http,
    // and sending it anyway 400s the whole order -- so it is simply omitted and
    // the webhook is configured in the dashboard instead.
    const base = appBaseUrl();
    if (base?.startsWith("https://")) orderMeta.notify_url = `${base}/api/user/payments/webhook`;

    const body = {
      order_id: orderId,
      order_amount: paiseToRupees(amount),
      order_currency: "INR",
      order_expiry_time: orderExpiry.toISOString(),
      customer_details: {
        customer_id: customerId,
        customer_phone: customerPhone,
        ...(customerName ? { customer_name: customerName } : {}),
      },
      ...(Object.keys(orderMeta).length > 0 ? { order_meta: orderMeta } : {}),
    };

    const response = await fetch(`${baseUrl}/pg/orders`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      body: JSON.stringify(body),
    });

    // 409 = "order with same id already exists", and our order id is derived
    // from the booking group, so every return to the payment screen hits this.
    // The existing order is the right answer, not an error.
    if (response.status === 409) {
      const existing = await cashfreeClient.getOrder(orderId);
      if (existing?.paymentSessionId) {
        return { orderId, paymentSessionId: existing.paymentSessionId, expiresAt: orderExpiry };
      }
      throw new Error(`Cashfree createOrder 409 for ${orderId} but the order could not be read back`);
    }
    if (!response.ok) {
      throw new Error(`Cashfree createOrder failed (${response.status}): ${await response.text()}`);
    }
    const parsed = (await response.json()) as { payment_session_id: string };
    return { orderId, paymentSessionId: parsed.payment_session_id, expiresAt: orderExpiry };
  },

  async getOrder(orderId) {
    const config = getConfig();
    if (!config) {
      if (!devAutoSucceed()) unavailable(`reading order ${orderId}`);
      // The local fake says PAID, because the point of the flag is to let the
      // booking flow complete with no vendor. It is refused in production.
      console.log(`[dev-fallback] Cashfree.getOrder faking PAID for ${orderId}`);
      return { orderStatus: "PAID", paymentSessionId: `fake_session_${orderId}` };
    }
    const { clientId, clientSecret, baseUrl } = config;
    const response = await fetch(`${baseUrl}/pg/orders/${encodeURIComponent(orderId)}`, {
      headers: headers(clientId, clientSecret),
    });
    // An order we never created is not an error worth throwing over: the caller
    // treats null as "no evidence of payment", which is the safe reading.
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Cashfree getOrder failed (${response.status}): ${await response.text()}`);
    }
    const parsed = (await response.json()) as {
      order_status?: string;
      payment_session_id?: string;
    };
    return {
      orderStatus: (parsed.order_status ?? "ACTIVE") as CashfreeOrderStatus,
      paymentSessionId: parsed.payment_session_id ?? null,
    };
  },

  async refund({ orderId, refundId, amount }) {
    const config = getConfig();
    if (!config) {
      if (!devAutoSucceed()) unavailable(`refund ${refundId} for order ${orderId}`);
      console.log(`[dev-fallback] Cashfree.refund faking refund ${refundId} for order ${orderId}`);
      return { refundId, status: "SUCCEEDED" };
    }
    const { clientId, clientSecret, baseUrl } = config;
    const response = await fetch(`${baseUrl}/pg/orders/${encodeURIComponent(orderId)}/refunds`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      body: JSON.stringify({
        refund_id: refundId,
        refund_amount: paiseToRupees(amount),
      }),
    });
    if (!response.ok) {
      throw new Error(`Cashfree refund failed (${response.status}): ${await response.text()}`);
    }
    const parsed = (await response.json()) as { refund_status?: string };
    return { refundId, status: mapRefundStatus(parsed.refund_status) };
  },

  /**
   * signedPayload     = x-webhook-timestamp + rawBody
   * expectedSignature = Base64Encode(HMAC-SHA256(signedPayload, clientSecret))
   *
   * NOT covered by devAutoSucceed, and this is deliberate: with no secret this
   * used to return `true` for everything, so any deploy with a public URL and
   * NODE_ENV != production would confirm a booking for anyone who POSTed a
   * JSON body. A webhook signature is not a local convenience; a forged one is
   * a free scooter. No secret, no verification, no confirmation.
   */
  verifyWebhookSignature(rawBody, signature, timestamp) {
    const config = getConfig();
    if (!config) return false;
    if (!signature || !timestamp) return false;
    const expected = createHmac("sha256", config.clientSecret)
      .update(timestamp + rawBody)
      .digest("base64");
    return expected === signature;
  },
};
