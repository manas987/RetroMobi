// Cashfree Secure ID -- DL verification against RTO records, and consent-based
// DigiLocker fetch. One vendor for both payments and identity.
export interface KycClient {
  verifyLicence(args: { licenceNumber: string; dob: string }): Promise<{
    status: "VERIFIED" | "REJECTED";
    validFrom?: string;
    expiresOn?: string;
    issuingAuthority?: string;
    categories?: Array<{ code: string }>;
  } | null>;
  digilockerConsentUrl(args: {
    riderId: string;
    redirectUrl: string;
  }): Promise<{ consentUrl: string; requestId: string }>;
  digilockerFetch(args: {
    requestId: string;
  }): Promise<{ status: "VERIFIED" | "REJECTED"; licenceNumber?: string; expiresOn?: string } | null>;
}

function getConfig() {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const baseUrl = process.env.CASHFREE_SECUREID_BASE_URL ?? "https://api.cashfree.com/verification";
  if (!clientId || !clientSecret) {
    throw new Error("CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET must both be set");
  }
  return { clientId, clientSecret, baseUrl };
}

function headers(clientId: string, clientSecret: string) {
  return {
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
    "Content-Type": "application/json",
  };
}

export const kycClient: KycClient = {
  async verifyLicence({ licenceNumber, dob }) {
    const { clientId, clientSecret, baseUrl } = getConfig();
    const response = await fetch(`${baseUrl}/driving-license`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      body: JSON.stringify({ id_number: licenceNumber, dob }),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Cashfree Secure ID DL check failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as {
      status: string;
      valid_from?: string;
      nt_validity_to?: string;
      issuing_rto_name?: string;
      cov_details?: Array<{ cov: string }>;
    };
    return {
      status: body.status === "VALID" ? "VERIFIED" : "REJECTED",
      validFrom: body.valid_from,
      expiresOn: body.nt_validity_to,
      issuingAuthority: body.issuing_rto_name,
      categories: body.cov_details?.map((c) => ({ code: c.cov })),
    };
  },

  async digilockerConsentUrl({ riderId, redirectUrl }) {
    const { clientId, clientSecret, baseUrl } = getConfig();
    const response = await fetch(`${baseUrl}/digilocker/request`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      body: JSON.stringify({ reference_id: riderId, redirect_url: redirectUrl }),
    });
    if (!response.ok) {
      throw new Error(`Cashfree DigiLocker request failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as { url: string; request_id: string };
    return { consentUrl: body.url, requestId: body.request_id };
  },

  async digilockerFetch({ requestId }) {
    const { clientId, clientSecret, baseUrl } = getConfig();
    const response = await fetch(`${baseUrl}/digilocker/request/${requestId}`, {
      method: "GET",
      headers: headers(clientId, clientSecret),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Cashfree DigiLocker fetch failed (${response.status}): ${await response.text()}`);
    }
    const body = (await response.json()) as {
      status: string;
      document_details?: { id_number?: string; validity_nt?: string };
    };
    return {
      status: body.status === "SUCCESS" ? "VERIFIED" : "REJECTED",
      licenceNumber: body.document_details?.id_number,
      expiresOn: body.document_details?.validity_nt,
    };
  },
};
