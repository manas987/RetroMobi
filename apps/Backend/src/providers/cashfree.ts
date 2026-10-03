import { createHmac } from "node:crypto";

export interface CashfreeClient {
  createOrder(args: {
    orderId: string;
    amount: number;
    expiresAt: Date;
    customerPhone: string;
  }): Promise<{ orderId: string; paymentSessionId: string; expiresAt: Date }>;
  refund(args: {
    orderId: string;
    refundId: string;
    amount: number;
  }): Promise<{ refundId: string; status: "PENDING" | "SUCCEEDED" | "FAILED" }>;
  transfer(args: {
    transferId: string;
    vendorId: string;
    amount: number;
  }): Promise<{ transferId: string; status: "PENDING" | "PAID" | "FAILED" }>;
  verifyWebhookSignature(rawBody: string, signature: string, timestamp: string): boolean;
}

function getConfig() {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const baseUrl = process.env.CASHFREE_BASE_URL ?? "https://api.cashfree.com";
  if (!clientId || !clientSecret) {
    throw new Error("CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET must both be set");
  }
  return { clientId, clientSecret, baseUrl };
}

function headers(clientId: string, clientSecret: string) {
  return {
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
    "x-api-version": "2023-08-01",
    "Content-Type": "application/json",
  };
}

// All amounts in this codebase are integer paise; Cashfree's PG API takes rupees.
function paiseToRupees(paise: number): number {
  return paise / 100;
}

export const cashfreeClient: CashfreeClient = {
  async createOrder({ orderId, amount, expiresAt, customerPhone }) {
    const { clientId, clientSecret, baseUrl } = getConfig();
    const response = await fetch(`${baseUrl}/pg/orders`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      body: JSON.stringify({
        order_id: orderId,
        order_amount: paiseToRupees(amount),
        order_currency: "INR",
        order_expiry_time: expiresAt.toISOString(),
        customer_details: {
          customer_id: orderId,
          customer_phone: customerPhone,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Cashfree createOrder failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as { payment_session_id: string };
    return { orderId, paymentSessionId: body.payment_session_id, expiresAt };
  },

  async refund({ orderId, refundId, amount }) {
    const { clientId, clientSecret, baseUrl } = getConfig();
    const response = await fetch(`${baseUrl}/pg/orders/${orderId}/refunds`, {
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
    const body = (await response.json()) as { refund_status: string };
    const status = body.refund_status === "SUCCESS" ? "SUCCEEDED" : body.refund_status === "FAILED" ? "FAILED" : "PENDING";
    return { refundId, status };
  },

  // Payouts via Cashfree Easy Split — merchant settlement.
  async transfer({ transferId, vendorId, amount }) {
    const { clientId, clientSecret, baseUrl } = getConfig();
    const response = await fetch(`${baseUrl}/pg/easy-split/transfers`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      body: JSON.stringify({
        transfer_id: transferId,
        vendor_id: vendorId,
        transfer_amount: paiseToRupees(amount),
      }),
    });
    if (!response.ok) {
      throw new Error(`Cashfree transfer failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as { status: string };
    const status = body.status === "PAID" ? "PAID" : body.status === "FAILED" ? "FAILED" : "PENDING";
    return { transferId, status };
  },

  verifyWebhookSignature(rawBody, signature, timestamp) {
    const { clientSecret } = getConfig();
    const expected = createHmac("sha256", clientSecret)
      .update(timestamp + rawBody)
      .digest("base64");
    return expected === signature;
  },
};
