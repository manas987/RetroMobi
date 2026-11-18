// The one thing this provider must never do is approve a licence nobody
// checked. Every other provider's dev-fallback returns a fake success and that
// is fine; a fake success here is a scooter handed to a stranger. These tests
// pin the fallback's behaviour and the request shape, since the request shape
// was wrong for months (`id_number`, no `verification_id`) and nothing caught it.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { kycClient } from "./kyc.ts";

const SAVED = {
  id: process.env.CASHFREE_CLIENT_ID,
  secret: process.env.CASHFREE_CLIENT_SECRET,
  base: process.env.CASHFREE_SECUREID_BASE_URL,
  auto: process.env.KYC_DEV_AUTO_VERIFY,
};
const realFetch = globalThis.fetch;

beforeEach(() => {
  delete process.env.CASHFREE_CLIENT_ID;
  delete process.env.CASHFREE_CLIENT_SECRET;
  delete process.env.KYC_DEV_AUTO_VERIFY;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const [key, value] of [
    ["CASHFREE_CLIENT_ID", SAVED.id],
    ["CASHFREE_CLIENT_SECRET", SAVED.secret],
    ["CASHFREE_SECUREID_BASE_URL", SAVED.base],
    ["KYC_DEV_AUTO_VERIFY", SAVED.auto],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("kyc dev-fallback", () => {
  test("an unconfigured vendor never reports VERIFIED", async () => {
    const result = await kycClient.verifyLicence({
      verificationId: "v1",
      licenceNumber: "UK0720190001234",
      dob: "1995-06-15",
    });
    expect(result?.status).toBe("SANDBOX_UNAVAILABLE");
  });

  test("an unconfigured vendor never reports AUTHENTICATED DigiLocker consent", async () => {
    const result = await kycClient.digilockerStatus({ verificationId: "v1" });
    expect(result?.status).toBe("SANDBOX_UNAVAILABLE");
  });

  test("KYC_DEV_AUTO_VERIFY=true is the only way to a fake pass", async () => {
    process.env.KYC_DEV_AUTO_VERIFY = "true";
    const result = await kycClient.verifyLicence({
      verificationId: "v1",
      licenceNumber: "UK0720190001234",
      dob: "1995-06-15",
    });
    expect(result?.status).toBe("VERIFIED");
  });

  test("any value other than the exact string 'true' is off", async () => {
    process.env.KYC_DEV_AUTO_VERIFY = "1";
    const result = await kycClient.verifyLicence({
      verificationId: "v1",
      licenceNumber: "UK0720190001234",
      dob: "1995-06-15",
    });
    expect(result?.status).toBe("SANDBOX_UNAVAILABLE");
  });
});

describe("kyc request and response shape", () => {
  function stubFetch(body: unknown, status = 200) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    return calls;
  }

  beforeEach(() => {
    process.env.CASHFREE_CLIENT_ID = "test-id";
    process.env.CASHFREE_CLIENT_SECRET = "test-secret";
    process.env.CASHFREE_SECUREID_BASE_URL = "https://sandbox.example/verification";
  });

  test("a configured provider returning 503 records an outage for each licence lookup", async () => {
    stubFetch({}, 503);
    const verificationId = "v1";
    expect(await kycClient.verifyLicence({ verificationId, licenceNumber: "UK0720190001234", dob: "1995-06-15" }))
      .toEqual({ status: "PROVIDER_OUTAGE" });
    expect(await kycClient.digilockerStatus({ verificationId })).toEqual({ status: "PROVIDER_OUTAGE" });
    expect(await kycClient.digilockerDocument({ verificationId })).toBe("PROVIDER_OUTAGE");
  });

  test("posts dl_number and verification_id, not id_number", async () => {
    const calls = stubFetch({ status: "INVALID" });
    await kycClient.verifyLicence({
      verificationId: "rm-abc",
      licenceNumber: "UK0720190001234",
      dob: "1995-06-15",
    });

    expect(calls[0]!.url).toBe("https://sandbox.example/verification/driving-license");
    const sent = JSON.parse(String(calls[0]!.init.body));
    expect(sent).toEqual({
      verification_id: "rm-abc",
      dl_number: "UK0720190001234",
      dob: "1995-06-15",
    });
    expect(sent.id_number).toBeUndefined();
  });

  test("reads validity and photo from their real nested locations", async () => {
    stubFetch({
      status: "VALID",
      dl_validity: {
        non_transport: { from: "2019-07-01", to: "2039-06-30" },
        transport: { from: "2019-07-01", to: "2022-06-30" },
      },
      details_of_driving_licence: {
        name: "ASHA DEVI",
        status: "Active",
        date_of_issue: "2019-07-01",
        last_transacted_at: "2024-02-11",
        issuing_rto: "RTO DEHRADUN",
        photo: "https://cf.example/photo.jpg?sig=abc",
        cov_details: [{ cov: "mcwg", issue_date: "2019-07-01" }, "LMV"],
      },
    });

    const result = await kycClient.verifyLicence({
      verificationId: "rm-abc",
      licenceNumber: "UK0720190001234",
      dob: "1995-06-15",
    });

    expect(result).toMatchObject({
      status: "VERIFIED",
      holderName: "ASHA DEVI",
      licenceStatus: "Active",
      // The non-transport window, not the transport one -- a rental scooter is
      // a private vehicle, and the transport entitlement expired in 2022.
      validFrom: "2019-07-01",
      expiresOn: "2039-06-30",
      issuingAuthority: "RTO DEHRADUN",
      sourceAt: "2024-02-11",
      photoUrl: "https://cf.example/photo.jpg?sig=abc",
    });
    // cov_details has no documented item shape, so both forms are accepted and
    // codes are upper-cased.
    expect(result?.categories).toEqual([
      { code: "MCWG", abbreviation: undefined, issueDate: "2019-07-01", endorseDate: undefined },
      { code: "LMV" },
    ]);
  });

  test("an unrecognised DigiLocker status is PENDING, never AUTHENTICATED", async () => {
    stubFetch({ status: "SOMETHING_NEW" });
    const result = await kycClient.digilockerStatus({ verificationId: "rm-abc" });
    expect(result?.status).toBe("PENDING");
  });

  test("a 404 from the RTO is a missing record, distinct from an outage", async () => {
    stubFetch({}, 404);
    const result = await kycClient.verifyLicence({
      verificationId: "rm-abc",
      licenceNumber: "UK0720190001234",
      dob: "1995-06-15",
    });
    expect(result).toBeNull();
  });
});
