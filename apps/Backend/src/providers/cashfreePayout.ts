// Cashfree Payouts V2 -- paying merchants.
//
// A SEPARATE Cashfree product from the Payment Gateway in providers/cashfree.ts:
// different base path (/payout), different API version (2024-01-01), and its
// own credential pair from the Payouts dashboard. The credentials deliberately
// do NOT fall back to the PG ones: if Payouts needs its own pair and we quietly
// reuse the gateway's, every transfer 401s with a message that points nowhere.
//
// Chosen over Easy Split because Easy Split settles on Cashfree's own cycle and
// cannot express UPFRONT-at-confirmation / BALANCE-at-pickup, which is the
// payout model this codebase is built around. Easy Split also has no transfer
// endpoint at all -- see docs/decisions.md, 2026-11-02.
//
// Every path, header, field name and status value below was checked against the
// live docs on 2026-11-02 and is recorded, with source links, in
// docs/payments.md. Do not change one from memory.

import { createHmac } from "node:crypto";
import { PaymentsUnavailableError } from "./cashfree.ts";

const API_VERSION = "2024-01-01";

/** Cashfree's documented beneficiary_status values. */
export type BeneficiaryStatus =
  | "VERIFIED"
  | "INVALID"
  | "INITIATED"
  | "CANCELLED"
  | "FAILED"
  | "DELETED";

/**
 * Cashfree's documented transfer status values. The API is **asynchronous**, so
 * the create response is usually one of the non-terminal ones -- treating
 * anything that is not SUCCESS as a failure would mark good transfers failed.
 */
export type TransferStatus =
  | "SUCCESS"
  | "FAILED"
  | "REJECTED"
  | "REVERSED"
  | "MANUALLY_REJECTED"
  | "RECEIVED"
  | "PENDING"
  | "APPROVAL_PENDING"
  | "QUEUED"
  | "VALIDATION_PENDING";

const TERMINAL_SUCCESS: TransferStatus[] = ["SUCCESS"];
const TERMINAL_FAILURE: TransferStatus[] = [
  "FAILED",
  "REJECTED",
  "REVERSED",
  "MANUALLY_REJECTED",
];

/** PENDING, PAID or FAILED -- what `payouts.status` can hold. */
export function mapTransferStatus(status: TransferStatus | string): "PENDING" | "PAID" | "FAILED" {
  if (TERMINAL_SUCCESS.includes(status as TransferStatus)) return "PAID";
  if (TERMINAL_FAILURE.includes(status as TransferStatus)) return "FAILED";
  // Every non-terminal status, and anything Cashfree adds later: still in
  // flight. The sweep re-polls it; nothing is decided here.
  return "PENDING";
}

/** Cashfree's beneficiary_status onto `merchant_payout_accounts.status`. */
export function mapBeneficiaryStatus(
  status: BeneficiaryStatus | string,
): "PENDING" | "VERIFIED" | "REJECTED" {
  if (status === "VERIFIED") return "VERIFIED";
  if (status === "INVALID" || status === "FAILED" || status === "CANCELLED" || status === "DELETED") {
    return "REJECTED";
  }
  // INITIATED, and anything new: Cashfree has not finished checking.
  return "PENDING";
}

export interface CashfreePayoutClient {
  createBeneficiary(args: {
    beneficiaryId: string;
    name: string;
    accountNumber: string;
    ifsc: string;
    phone?: string;
    email?: string;
  }): Promise<{ beneficiaryId: string; status: BeneficiaryStatus }>;
  transfer(args: {
    transferId: string;
    beneficiaryId: string;
    beneficiaryName: string;
    /** Integer paise, as everywhere in this codebase. Converted here. */
    amount: number;
    remarks?: string;
  }): Promise<{ transferId: string; cfTransferId: string | null; status: TransferStatus }>;
  getTransfer(transferId: string): Promise<{ status: TransferStatus } | null>;
}

function getConfig(): { clientId: string; clientSecret: string; baseUrl: string } | null {
  const clientId = process.env.CASHFREE_PAYOUT_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_PAYOUT_CLIENT_SECRET;
  const baseUrl = process.env.CASHFREE_PAYOUT_BASE_URL ?? "https://api.cashfree.com/payout";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, baseUrl };
}

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

function paiseToRupees(paise: number): number {
  return paise / 100;
}

function unavailable(what: string): never {
  throw new PaymentsUnavailableError(
    `Cashfree Payouts is not configured, so ${what} did not happen. ` +
      `Set CASHFREE_PAYOUT_CLIENT_ID and CASHFREE_PAYOUT_CLIENT_SECRET, ` +
      `or PAYMENTS_DEV_AUTO_SUCCEED=true for local work.`,
  );
}

/**
 * `beneficiary_name` is documented as alphabets and whitespace only, so a shop
 * name with a digit, an ampersand or a full stop is rejected by the API. Strip
 * rather than fail: the name is a label on a transfer, and the account number
 * plus IFSC are what decide where the money lands.
 */
export function sanitiseBeneficiaryName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z\s]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned.length >= 3 ? cleaned : "Merchant";
}

export const cashfreePayoutClient: CashfreePayoutClient = {
  async createBeneficiary({ beneficiaryId, name, accountNumber, ifsc, phone, email }) {
    const config = getConfig();
    if (!config) {
      if (!devAutoSucceed()) unavailable(`registering beneficiary ${beneficiaryId}`);
      console.log(`[dev-fallback] CashfreePayout.createBeneficiary faking VERIFIED for ${beneficiaryId}`);
      return { beneficiaryId, status: "VERIFIED" };
    }
    const { clientId, clientSecret, baseUrl } = config;
    const response = await fetch(`${baseUrl}/beneficiary`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      body: JSON.stringify({
        beneficiary_id: beneficiaryId,
        beneficiary_name: sanitiseBeneficiaryName(name),
        beneficiary_instrument_details: {
          bank_account_number: accountNumber,
          bank_ifsc: ifsc,
        },
        ...(phone || email
          ? {
              beneficiary_contact_details: {
                ...(phone ? { beneficiary_phone: phone } : {}),
                ...(email ? { beneficiary_email: email } : {}),
              },
            }
          : {}),
      }),
    });

    // 409 = this beneficiary id already exists. Ours is derived from the
    // merchant, so re-saving the same account always collides; the existing
    // registration is the right answer, not an error.
    if (response.status === 409) {
      console.log(`[cashfree-payout] beneficiary ${beneficiaryId} already registered`);
      return { beneficiaryId, status: "INITIATED" };
    }
    if (!response.ok) {
      throw new Error(
        `Cashfree createBeneficiary failed (${response.status}): ${await response.text()}`,
      );
    }
    const parsed = (await response.json()) as { beneficiary_status?: string };
    return {
      beneficiaryId,
      status: (parsed.beneficiary_status ?? "INITIATED") as BeneficiaryStatus,
    };
  },

  async transfer({ transferId, beneficiaryId, beneficiaryName, amount, remarks }) {
    const config = getConfig();
    if (!config) {
      if (!devAutoSucceed()) unavailable(`transfer ${transferId}`);
      console.log(`[dev-fallback] CashfreePayout.transfer faking SUCCESS for ${transferId}`);
      return { transferId, cfTransferId: `fake_${transferId}`, status: "SUCCESS" };
    }
    const { clientId, clientSecret, baseUrl } = config;
    const response = await fetch(`${baseUrl}/transfers`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      body: JSON.stringify({
        transfer_id: transferId,
        transfer_amount: paiseToRupees(amount),
        transfer_currency: "INR",
        beneficiary_details: {
          beneficiary_id: beneficiaryId,
          beneficiary_name: sanitiseBeneficiaryName(beneficiaryName),
        },
        ...(remarks ? { transfer_remarks: remarks.slice(0, 70) } : {}),
      }),
    });

    // Cashfree rejects a duplicate transfer_id, which is exactly the guard we
    // want: ours is `payout_<payout id>`, so a retry after an ambiguous failure
    // cannot pay twice. Read the existing transfer's status instead.
    if (response.status === 409) {
      const existing = await cashfreePayoutClient.getTransfer(transferId);
      return {
        transferId,
        cfTransferId: null,
        status: existing?.status ?? "PENDING",
      };
    }
    if (!response.ok) {
      throw new Error(`Cashfree transfer failed (${response.status}): ${await response.text()}`);
    }
    const parsed = (await response.json()) as { status?: string; cf_transfer_id?: string };
    return {
      transferId,
      cfTransferId: parsed.cf_transfer_id ?? null,
      // No default to SUCCESS, ever: an unreadable status is PENDING, which the
      // sweep will re-poll.
      status: (parsed.status ?? "PENDING") as TransferStatus,
    };
  },

  async getTransfer(transferId) {
    const config = getConfig();
    if (!config) {
      if (!devAutoSucceed()) unavailable(`reading transfer ${transferId}`);
      return { status: "SUCCESS" };
    }
    const { clientId, clientSecret, baseUrl } = config;
    const response = await fetch(
      `${baseUrl}/transfers?transfer_id=${encodeURIComponent(transferId)}`,
      { headers: headers(clientId, clientSecret) },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Cashfree getTransfer failed (${response.status}): ${await response.text()}`);
    }
    const parsed = (await response.json()) as { status?: string };
    return { status: (parsed.status ?? "PENDING") as TransferStatus };
  },
};

/**
 * Payouts webhooks use the same scheme as the gateway's --
 * Base64(HMAC-SHA256(timestamp + rawBody, clientSecret)) -- but with the
 * PAYOUT secret. Fails closed with no secret, for the same reason the gateway's
 * does: a forged TRANSFER_SUCCESS marks a merchant paid who was not.
 */
export function verifyPayoutWebhookSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
): boolean {
  const config = getConfig();
  if (!config) return false;
  if (!signature || !timestamp) return false;
  const expected = createHmac("sha256", config.clientSecret)
    .update(timestamp + rawBody)
    .digest("base64");
  return expected === signature;
}
