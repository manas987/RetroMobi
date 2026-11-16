// Cashfree Secure ID -- DL verification against RTO records, and consent-based
// DigiLocker fetch. One vendor for both payments and identity.
//
// Every path and field name below was checked against the live Cashfree docs on
// 2026-11-02 and is recorded in docs/dl-verification.md. The previous version of
// this file was written from memory without network access (see progress.md's
// Phase 3 warning) and got most of them wrong: it posted `id_number` instead of
// `dl_number`, omitted the required `verification_id`, read `valid_from` /
// `nt_validity_to` / `issuing_rto_name` at the top level when they live under
// `dl_validity` and `details_of_driving_licence`, and called two DigiLocker
// paths that do not exist. Do not "simplify" these back.

const API_VERSION = "2023-12-18";

/** A normalised DL check. `SANDBOX_UNAVAILABLE` is not a vendor status -- see getConfig. */
export interface LicenceResult {
  status: "VERIFIED" | "REJECTED" | "SANDBOX_UNAVAILABLE" | "PROVIDER_OUTAGE";
  holderName?: string;
  /** The RTO's own status string, e.g. "Active". Eligibility reads this; it is not our status. */
  licenceStatus?: string;
  validFrom?: string;
  expiresOn?: string;
  issuingAuthority?: string;
  /** When the transport record was last touched -- i.e. how fresh this answer is. */
  sourceAt?: string;
  /** Pre-signed, EXPIRES IN 24 HOURS. Download it immediately; never store the URL. */
  photoUrl?: string;
  categories?: Array<{
    code: string;
    abbreviation?: string;
    issueDate?: string;
    endorseDate?: string;
  }>;
}

export type DigilockerStatus =
  | "PENDING"
  | "AUTHENTICATED"
  | "EXPIRED"
  | "CONSENT_DENIED"
  | "PROVIDER_OUTAGE"
  | "SANDBOX_UNAVAILABLE";

export interface KycClient {
  verifyLicence(args: {
    verificationId: string;
    licenceNumber: string;
    dob: string;
  }): Promise<LicenceResult | null>;
  digilockerCreateRequest(args: {
    verificationId: string;
    redirectUrl: string;
  }): Promise<{ consentUrl: string; providerReference: string | null }>;
  digilockerStatus(args: { verificationId: string }): Promise<{
    status: DigilockerStatus;
    userDetails?: { name?: string; dob?: string; gender?: string };
  } | null>;
  /** The issued DL document: a base64 photo and a link to a zip of the signed XML. */
  digilockerDocument(args: { verificationId: string }): Promise<{
    photoBase64?: string;
    xmlFileUrl?: string;
  } | "PROVIDER_OUTAGE" | null>;
}

function getConfig(): { clientId: string; clientSecret: string; baseUrl: string } | null {
  const clientId = process.env.CASHFREE_CLIENT_ID;
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  const baseUrl = process.env.CASHFREE_SECUREID_BASE_URL ?? "https://api.cashfree.com/verification";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, baseUrl };
}

/**
 * The other five providers' dev-fallbacks return a fake success, so the whole
 * app runs on a laptop with an empty .env (backend.md's "Provider
 * dev-fallback"). This one must not: a faked `VERIFIED` is an approved driving
 * licence, and `lib/config.ts` did not require Cashfree credentials in
 * production -- so an unset CASHFREE_CLIENT_ID in production approved every
 * licence silently, with a [dev-fallback] log line nobody reads.
 *
 * So the fake pass is now opt-in and local-only: set KYC_DEV_AUTO_VERIFY=true
 * to keep exercising the booking flow end to end, and `assertConfig` refuses to
 * boot in production if it is set. Without it, an unconfigured vendor reports
 * SANDBOX_UNAVAILABLE, which is not an approval in any code path.
 */
function devAutoVerify(): boolean {
  return process.env.KYC_DEV_AUTO_VERIFY === "true";
}

function headers(clientId: string, clientSecret: string) {
  return {
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
    "x-api-version": API_VERSION,
    "Content-Type": "application/json",
  };
}

async function lookup(url: string, options: RequestInit) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
    return response.status === 429 || response.status >= 500 ? null : response;
  } catch (err) {
    if (err instanceof TypeError || (err instanceof Error && err.name === "TimeoutError")) return null;
    throw err;
  }
}

/**
 * `cov_details` is an array in the docs with no documented item shape, so the
 * key carrying the class code is read defensively rather than guessed at. A
 * plain string item is accepted too.
 */
function normaliseCategories(raw: unknown): LicenceResult["categories"] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<LicenceResult["categories"]> = [];
  for (const item of raw) {
    if (typeof item === "string") {
      if (item.trim()) out.push({ code: item.trim().toUpperCase() });
      continue;
    }
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const code = row.cov ?? row.code ?? row.category ?? row.class_of_vehicle;
    if (typeof code !== "string" || !code.trim()) continue;
    out.push({
      code: code.trim().toUpperCase(),
      abbreviation: typeof row.abbreviation === "string" ? row.abbreviation : undefined,
      issueDate: typeof row.issue_date === "string" ? row.issue_date : undefined,
      endorseDate: typeof row.endorse_date === "string" ? row.endorse_date : undefined,
    });
  }
  return out.length ? out : undefined;
}

export const kycClient: KycClient = {
  async verifyLicence({ verificationId, licenceNumber, dob }) {
    const config = getConfig();
    if (!config) {
      if (!devAutoVerify()) {
        console.log(
          `[dev-fallback] KYC.verifyLicence not configured — reporting SANDBOX_UNAVAILABLE. ` +
            `Set KYC_DEV_AUTO_VERIFY=true to fake a pass locally.`,
        );
        return { status: "SANDBOX_UNAVAILABLE" };
      }
      console.log(
        `[dev-fallback] KYC_DEV_AUTO_VERIFY is on — FAKING a VERIFIED licence. ` +
          `No real check happened.`,
      );
      return {
        status: "VERIFIED",
        holderName: "DEV FAKE HOLDER",
        licenceStatus: "Active",
        validFrom: "2020-01-01",
        expiresOn: "2035-01-01",
        issuingAuthority: "DEV FAKE RTO",
        sourceAt: "2020-01-01",
        categories: [{ code: "LMV" }, { code: "MCWG" }],
      };
    }
    const { clientId, clientSecret, baseUrl } = config;
    const response = await lookup(`${baseUrl}/driving-license`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      // `verification_id` is ours and required: max 50 chars, alphanumeric plus
      // . - _ only. It is also the only correlation key the vendor gives back.
      body: JSON.stringify({
        verification_id: verificationId,
        dl_number: licenceNumber,
        dob,
      }),
    });
    if (!response) return { status: "PROVIDER_OUTAGE" };
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `Cashfree Secure ID DL check failed (${response.status}): ${await response.text()}`,
      );
    }
    const body = (await response.json()) as {
      status?: string;
      dl_validity?: {
        non_transport?: { from?: string; to?: string };
        transport?: { from?: string; to?: string };
      };
      details_of_driving_licence?: {
        name?: string;
        status?: string;
        date_of_issue?: string;
        date_of_last_transaction?: string;
        last_transacted_at?: string;
        issuing_rto?: string;
        photo?: string;
        cov_details?: unknown;
      };
    };
    const details = body.details_of_driving_licence;
    return {
      status: body.status === "VALID" ? "VERIFIED" : "REJECTED",
      holderName: details?.name,
      licenceStatus: details?.status,
      // Non-transport validity: a rental scooter is a private vehicle. The
      // transport window is a separate commercial entitlement we do not use.
      validFrom: body.dl_validity?.non_transport?.from ?? details?.date_of_issue,
      expiresOn: body.dl_validity?.non_transport?.to,
      // Not in the v2 API reference's field list, only on the product page, so
      // it may simply be absent -- never required by anything downstream.
      issuingAuthority: details?.issuing_rto,
      sourceAt: details?.last_transacted_at ?? details?.date_of_last_transaction,
      photoUrl: details?.photo,
      categories: normaliseCategories(details?.cov_details),
    };
  },

  async digilockerCreateRequest({ verificationId, redirectUrl }) {
    const config = getConfig();
    if (!config) {
      console.log(
        `[dev-fallback] KYC.digilockerCreateRequest not configured — faking a consent URL for ${verificationId}`,
      );
      return {
        consentUrl: `https://dev-fallback.local/digilocker/${verificationId}`,
        providerReference: null,
      };
    }
    const { clientId, clientSecret, baseUrl } = config;
    const response = await fetch(`${baseUrl}/digilocker`, {
      method: "POST",
      headers: headers(clientId, clientSecret),
      body: JSON.stringify({
        verification_id: verificationId,
        document_requested: ["DRIVING_LICENSE"],
        redirect_url: redirectUrl,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Cashfree DigiLocker request failed (${response.status}): ${await response.text()}`,
      );
    }
    const body = (await response.json()) as { url: string; reference_id?: number | string };
    return {
      consentUrl: body.url,
      providerReference: body.reference_id != null ? String(body.reference_id) : null,
    };
  },

  async digilockerStatus({ verificationId }) {
    const config = getConfig();
    if (!config) {
      if (!devAutoVerify()) {
        console.log(
          `[dev-fallback] KYC.digilockerStatus not configured — reporting SANDBOX_UNAVAILABLE for ${verificationId}. ` +
            `Set KYC_DEV_AUTO_VERIFY=true to fake a pass locally.`,
        );
        return { status: "SANDBOX_UNAVAILABLE" };
      }
      console.log(
        `[dev-fallback] KYC_DEV_AUTO_VERIFY is on — FAKING an AUTHENTICATED DigiLocker consent for ${verificationId}.`,
      );
      return { status: "AUTHENTICATED", userDetails: { name: "DEV FAKE HOLDER" } };
    }
    const { clientId, clientSecret, baseUrl } = config;
    const response = await lookup(
      `${baseUrl}/digilocker?verification_id=${encodeURIComponent(verificationId)}`,
      { method: "GET", headers: headers(clientId, clientSecret) },
    );
    if (!response) return { status: "PROVIDER_OUTAGE" };
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `Cashfree DigiLocker status failed (${response.status}): ${await response.text()}`,
      );
    }
    const body = (await response.json()) as {
      status?: string;
      user_details?: { name?: string; dob?: string; gender?: string };
    };
    // Anything unrecognised is PENDING, never AUTHENTICATED: an unknown status
    // must not be read as consent.
    const known: DigilockerStatus[] = ["PENDING", "AUTHENTICATED", "EXPIRED", "CONSENT_DENIED"];
    const status = known.find((s) => s === body.status) ?? "PENDING";
    return { status, userDetails: body.user_details };
  },

  async digilockerDocument({ verificationId }) {
    const config = getConfig();
    if (!config) {
      console.log(
        `[dev-fallback] KYC.digilockerDocument not configured — returning no document for ${verificationId}`,
      );
      return null;
    }
    const { clientId, clientSecret, baseUrl } = config;
    const response = await lookup(
      `${baseUrl}/digilocker/document/DRIVING_LICENSE?verification_id=${encodeURIComponent(verificationId)}`,
      { method: "GET", headers: headers(clientId, clientSecret) },
    );
    if (!response) return "PROVIDER_OUTAGE";
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `Cashfree DigiLocker document fetch failed (${response.status}): ${await response.text()}`,
      );
    }
    const body = (await response.json()) as { photo_link?: string; xml_file?: string };
    return { photoBase64: body.photo_link, xmlFileUrl: body.xml_file };
  },
};
