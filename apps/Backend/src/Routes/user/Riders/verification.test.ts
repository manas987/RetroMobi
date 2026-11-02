// The convergent pipeline. A stub KycClient stands in for Cashfree -- the
// adapter's own request/response shape is pinned in providers/kyc.test.ts, so
// what is tested here is what the service DOES with each answer, especially
// the answers that must not end in an approval.
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createRider, createUser } from "../../../test/fixtures.ts";
import type { KycClient, LicenceResult } from "../../../providers/kyc.ts";
import { hashLicenceNumber } from "../../../lib/verificationHash.ts";
import {
  ConsentRequiredError,
  RetryLimitError,
  SessionNotFoundError,
  SessionNotPendingError,
  cancelSession,
  completeDigilocker,
  confirmPhotoUpload,
  getLicence,
  getSessionStatus,
  retrySession,
  startSession,
  verifyByDlNumber,
} from "./verificationService.ts";

// Storage has to actually succeed here. These tests used to pass with no R2
// configured, which was only possible because the service ignored
// putObject's devFallback flag and recorded a photograph it had discarded --
// so the bug was holding the tests up rather than the other way round.
/** Flipped by the one test that checks what happens when storage is absent. */
let storageConfigured = true;

mock.module("../../../lib/storage.ts", () => ({
  putObject: async (key: string) =>
    storageConfigured ? { storageKey: key } : { storageKey: key, devFallback: true },
  presignUpload: async (key: string) => ({ uploadUrl: "https://stub.test/put", storageKey: key }),
  presignDownload: async (key: string) => `https://stub.test/get/${key}`,
  deleteObject: async () => ({}),
}));

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  mock.restore();
  await pool.end();
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  storageConfigured = true;
  delete process.env.ALLOW_LOW_ASSURANCE_VERIFICATION;
});

const VALID_LICENCE: LicenceResult = {
  status: "VERIFIED",
  holderName: "ASHA DEVI",
  licenceStatus: "Active",
  validFrom: "2019-07-01",
  expiresOn: "2039-06-30",
  issuingAuthority: "RTO DEHRADUN",
  sourceAt: "2024-02-11",
  categories: [{ code: "MCWG", issueDate: "2019-07-01", endorseDate: "2019-07-01" }],
};

function stubKyc(overrides: Partial<KycClient> = {}): KycClient {
  return {
    verifyLicence: async () => VALID_LICENCE,
    digilockerCreateRequest: async () => ({
      consentUrl: "https://digilocker.example/consent",
      providerReference: "42",
    }),
    digilockerStatus: async () => ({ status: "AUTHENTICATED" }),
    digilockerDocument: async () => ({ xmlFileUrl: "https://vendor.example/doc.zip" }),
    ...overrides,
  };
}

function certificate(opts: { photo?: boolean; categories?: string[]; expiry?: string } = {}) {
  const categories = (opts.categories ?? ["MCWG"])
    .map((code) => `<Category code="${code}" abbreviation="${code}" issueDate="01-07-2019" endorseDate="01-07-2019"/>`)
    .join("");
  const photo = opts.photo === false ? "" : `<Photo format="JPEG">aGVsbG8=</Photo>`;
  return `<Certificate type="DRVLC" number="UK0720190001234" issueDate="01-07-2019" expiryDate="${opts.expiry ?? "30-06-2039"}">
    <IssuedBy><Organization name="RTO DEHRADUN" type="RTO"/></IssuedBy>
    <IssuedTo><Person name="ASHA DEVI" dob="15-06-1995" gender="F">${photo}</Person></IssuedTo>
    <CertificateData><DrivingLicense><Categories>${categories}</Categories></DrivingLicense></CertificateData>
  </Certificate>`;
}

function zipOf(xml: string): Uint8Array {
  const nameBytes = Buffer.from("DRVLC.xml");
  const raw = Buffer.from(xml);
  const body = deflateRawSync(raw);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(body.length, 18);
  header.writeUInt32LE(raw.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  return new Uint8Array(Buffer.concat([header, nameBytes, body]));
}

/** Serves the zip (and any photo URL) the service goes out to fetch. */
function serveDocument(xml = certificate()) {
  globalThis.fetch = (async (url: string) =>
    String(url).endsWith(".zip")
      ? new Response(zipOf(xml))
      : new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/jpeg" },
        })) as unknown as typeof fetch;
}

async function freshRider() {
  const user = await createUser(pool);
  // verified: false -- these tests are about producing the verification, not
  // starting from one.
  const rider = await createRider(pool, user.id, { verified: false });
  return { userId: user.id as string, riderId: rider.id as string };
}

/**
 * The test database is persistent and never truncated (see fixtures.ts), so a
 * hardcoded licence number is a cross-RUN duplicate the second time these
 * tests execute -- which is exactly what the duplicate-detection tests look
 * for. Generated per call, like every other fixture value.
 */
function uniqueLicence(): string {
  return `UK${String(crypto.getRandomValues(new Uint32Array(1))[0]).padStart(13, "0")}`;
}

async function stateOf(sessionId: string) {
  const { rows } = await pool.query(
    `select state, assurance_level, review_required, rejection_code
       from rider_verification_sessions where id = $1`,
    [sessionId],
  );
  return rows[0];
}

describe("consent", () => {
  test("a session cannot start without it", async () => {
    const { userId, riderId } = await freshRider();
    await expect(
      startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: false }, stubKyc()),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  test("the wording stored is the server's, with the IP and a timestamp", async () => {
    const { userId, riderId } = await freshRider();
    const { sessionId } = await startSession(
      pool,
      userId,
      riderId,
      { method: "DL_NUMBER", consent: true, ip: "203.0.113.9" },
      stubKyc(),
    );

    const { rows } = await pool.query(
      `select consent_text, consent_ip, consent_at from rider_verification_sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0].consent_text).toContain("I allow RetroMobi to verify my driving licence");
    expect(rows[0].consent_ip).toBe("203.0.113.9");
    expect(rows[0].consent_at).toBeInstanceOf(Date);
  });

  test("DigiLocker needs somewhere to come back to", async () => {
    const { userId, riderId } = await freshRider();
    await expect(
      startSession(pool, userId, riderId, { method: "DIGILOCKER", consent: true }, stubKyc()),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  // A session created for a vendor request that then failed would sit in
  // CONSENT_PENDING forever with no consent URL to send anyone to.
  test("a failed vendor call leaves no session behind", async () => {
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({
      digilockerCreateRequest: async () => {
        throw new Error("vendor down");
      },
    });

    await expect(
      startSession(
        pool,
        userId,
        riderId,
        { method: "DIGILOCKER", consent: true, redirectUrl: "https://retromobi.test/back" },
        kyc,
      ),
    ).rejects.toThrow("vendor down");

    const { rows } = await pool.query(
      `select count(*)::int as n from rider_verification_sessions where rider_id = $1`,
      [riderId],
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("the DL-number path", () => {
  test("a valid licence with a photo verifies, at MEDIUM assurance", async () => {
    serveDocument();
    const { userId, riderId } = await freshRider();
    const { sessionId } = await startSession(
      pool,
      userId,
      riderId,
      { method: "DL_NUMBER", consent: true },
      stubKyc({ verifyLicence: async () => ({ ...VALID_LICENCE, photoUrl: "https://cf.example/p.jpg" }) }),
    );

    const result = await verifyByDlNumber(
      pool,
      userId,
      riderId,
      sessionId,
      { licenceNumber: "uk-07 2019 0001234", dob: "1995-06-15" },
      stubKyc({ verifyLicence: async () => ({ ...VALID_LICENCE, photoUrl: "https://cf.example/p.jpg" }) }),
    );

    expect(result.state).toBe("VERIFIED");
    // An RTO lookup is a database read about the document, not the document --
    // DigiLocker's issued certificate is the one that earns HIGH.
    expect((await stateOf(sessionId)).assurance_level).toBe("MEDIUM");

    const licence = await getLicence(pool, userId, riderId);
    expect(licence.licence_number_masked).toBe("UK07*******1234");
    expect(licence.holder_name).toBe("ASHA DEVI");
    expect(licence.photo_available).toBe(true);
    expect(licence.categories).toEqual([{ code: "MCWG", abbreviation: null }]);
  });

  test("the number is stored masked and hashed from its normalised form", async () => {
    serveDocument();
    const { userId, riderId } = await freshRider();
    const { sessionId } = await startSession(
      pool,
      userId,
      riderId,
      { method: "DL_NUMBER", consent: true },
      stubKyc(),
    );
    await verifyByDlNumber(
      pool,
      userId,
      riderId,
      sessionId,
      { licenceNumber: "UK-07/2019/0001234", dob: "1995-06-15" },
      stubKyc(),
    );

    const { rows } = await pool.query(
      `select licence_number, licence_number_hash from driving_licence_verifications where session_id = $1`,
      [sessionId],
    );
    expect(rows[0].licence_number).toBe("UK07*******1234");
    // Separators are presentation: the same licence written any way collides.
    expect(rows[0].licence_number_hash).toBe(hashLicenceNumber("UK0720190001234"));
  });

  test("the rider's dob is taken from the one place it is entered", async () => {
    serveDocument();
    const { userId, riderId } = await freshRider();
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, stubKyc());
    await verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, stubKyc());

    const { rows } = await pool.query(`select to_char(dob, 'YYYY-MM-DD') as dob from riders where id = $1`, [riderId]);
    expect(rows[0].dob).toBe("1995-06-15");
  });

  test("no photograph means PHOTO_PENDING, not VERIFIED", async () => {
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({ verifyLicence: async () => VALID_LICENCE });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);

    const result = await verifyByDlNumber(
      pool,
      userId,
      riderId,
      sessionId,
      { licenceNumber: "UK0720190001234", dob: "1995-06-15" },
      kyc,
    );
    // With face matching dropped the photo IS the identity evidence; without
    // one there is nothing for the merchant to compare at pickup.
    expect(result.state).toBe("PHOTO_PENDING");
  });

  // The photograph IS the identity evidence since face matching was dropped, so
  // a session must never claim to hold one that was not actually stored --
  // that would send a merchant to an empty URL at handover with the customer
  // standing in front of them.
  test("a photo that could not be stored counts as no photo, not as a verified one", async () => {
    storageConfigured = false;
    serveDocument();
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({
      verifyLicence: async () => ({ ...VALID_LICENCE, photoUrl: "https://cf.example/p.jpg" }),
    });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);

    const result = await verifyByDlNumber(
      pool,
      userId,
      riderId,
      sessionId,
      { licenceNumber: "UK0720190001234", dob: "1995-06-15" },
      kyc,
    );

    expect(result.state).toBe("PHOTO_PENDING");
    const { rows } = await pool.query(
      `select photo_available from driving_licence_verifications where session_id = $1`,
      [sessionId],
    );
    expect(rows[0].photo_available).toBe(false);
    const photos = await pool.query(
      `select count(*)::int as n from verification_photos where session_id = $1`,
      [sessionId],
    );
    expect(photos.rows[0].n).toBe(0);
  });

  test("an invalid licence fails the document, it does not go to review", async () => {
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({ verifyLicence: async () => ({ status: "REJECTED" }) });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);

    const result = await verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, kyc);
    expect(result).toEqual({ state: "DOCUMENT_FAILED", rejectionCode: "LICENCE_INVALID" });
  });

  test("a licence the RTO has no record of is distinct from an invalid one", async () => {
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({ verifyLicence: async () => null });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);

    const result = await verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, kyc);
    expect(result).toEqual({ state: "DOCUMENT_FAILED", rejectionCode: "LICENCE_NOT_FOUND" });
  });

  // An outage is not the customer's fault and must never be an approval.
  test("an unconfigured or unreachable vendor goes to review, never to VERIFIED", async () => {
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({ verifyLicence: async () => ({ status: "SANDBOX_UNAVAILABLE" }) });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);

    const result = await verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, kyc);
    expect(result).toEqual({ state: "MANUAL_REVIEW_REQUIRED", rejectionCode: "PROVIDER_UNAVAILABLE" });
    expect((await stateOf(sessionId)).review_required).toBe(true);
  });

  test("an expired licence is refused even though the vendor said VALID", async () => {
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({
      verifyLicence: async () => ({ ...VALID_LICENCE, expiresOn: "2020-01-01" }),
    });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);

    const result = await verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, kyc);
    expect(result).toEqual({ state: "DOCUMENT_FAILED", rejectionCode: "LICENCE_EXPIRED" });
  });

  test("a learner's licence is refused", async () => {
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({
      verifyLicence: async () => ({ ...VALID_LICENCE, categories: [{ code: "MCWG-LRN" }] }),
    });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);

    const result = await verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, kyc);
    expect(result).toEqual({ state: "DOCUMENT_FAILED", rejectionCode: "LEARNER_LICENCE" });
  });

  test("a second submit does not call the vendor again", async () => {
    serveDocument();
    const { userId, riderId } = await freshRider();
    let calls = 0;
    const kyc = stubKyc({
      verifyLicence: async () => {
        calls += 1;
        return VALID_LICENCE;
      },
    });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);
    await verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, kyc);

    await expect(
      verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, kyc),
    ).rejects.toBeInstanceOf(SessionNotPendingError);
    expect(calls).toBe(1);
  });
});

describe("the DigiLocker path", () => {
  async function startDigilocker(kyc: KycClient) {
    const { userId, riderId } = await freshRider();
    const { sessionId, consentUrl } = await startSession(
      pool,
      userId,
      riderId,
      { method: "DIGILOCKER", consent: true, redirectUrl: "https://retromobi.test/back" },
      kyc,
    );
    return { userId, riderId, sessionId, consentUrl };
  }

  test("the issued document verifies at HIGH assurance, with its photo", async () => {
    serveDocument();
    const kyc = stubKyc();
    const { userId, riderId, sessionId, consentUrl } = await startDigilocker(kyc);
    expect(consentUrl).toBe("https://digilocker.example/consent");

    const result = await completeDigilocker(pool, userId, riderId, sessionId, kyc);
    expect(result.state).toBe("VERIFIED");

    const session = await stateOf(sessionId);
    expect(session.assurance_level).toBe("HIGH");
    // The XML signature is not verified yet, so an issued document is flagged
    // rather than trusted outright. This is a production blocker, recorded.
    expect(session.review_required).toBe(true);
    const { rows } = await pool.query(
      `select 1 from rider_verification_events where session_id = $1 and event_type = 'xml_signature_unverified'`,
      [sessionId],
    );
    expect(rows).toHaveLength(1);
  });

  test("the certificate's own fields reach the licence record", async () => {
    serveDocument();
    const kyc = stubKyc();
    const { userId, riderId, sessionId } = await startDigilocker(kyc);
    await completeDigilocker(pool, userId, riderId, sessionId, kyc);

    const licence = await getLicence(pool, userId, riderId);
    expect(licence).toMatchObject({
      licence_number_masked: "UK07*******1234",
      holder_name: "ASHA DEVI",
      issuing_authority: "RTO DEHRADUN",
      source_type: "DIGILOCKER_ISSUED",
      valid_from: "2019-07-01",
      expires_on: "2039-06-30",
    });
    const { rows } = await pool.query(`select to_char(dob,'YYYY-MM-DD') as dob from riders where id = $1`, [riderId]);
    expect(rows[0].dob).toBe("1995-06-15");
  });

  test("a redirect that arrives before consent is recorded is not an error", async () => {
    const kyc = stubKyc({ digilockerStatus: async () => ({ status: "PENDING" }) });
    const { userId, riderId, sessionId } = await startDigilocker(kyc);

    expect(await completeDigilocker(pool, userId, riderId, sessionId, kyc)).toEqual({
      state: "CONSENT_PENDING",
    });
  });

  test("a denied consent is rejected, and says so", async () => {
    const kyc = stubKyc({ digilockerStatus: async () => ({ status: "CONSENT_DENIED" }) });
    const { userId, riderId, sessionId } = await startDigilocker(kyc);

    expect(await completeDigilocker(pool, userId, riderId, sessionId, kyc)).toEqual({
      state: "REJECTED",
      rejectionCode: "CONSENT_DENIED",
    });
  });

  test("an expired consent is rejected separately from a denied one", async () => {
    const kyc = stubKyc({ digilockerStatus: async () => ({ status: "EXPIRED" }) });
    const { userId, riderId, sessionId } = await startDigilocker(kyc);

    expect(await completeDigilocker(pool, userId, riderId, sessionId, kyc)).toEqual({
      state: "REJECTED",
      rejectionCode: "CONSENT_EXPIRED",
    });
  });

  test("a document that cannot be read is a review, not a rejection", async () => {
    globalThis.fetch = (async () => new Response("not a zip")) as unknown as typeof fetch;
    const kyc = stubKyc();
    const { userId, riderId, sessionId } = await startDigilocker(kyc);

    const result = await completeDigilocker(pool, userId, riderId, sessionId, kyc);
    expect(result).toMatchObject({ state: "MANUAL_REVIEW_REQUIRED", rejectionCode: "DOCUMENT_UNREADABLE" });
  });

  test("an authenticated consent with no document to fetch goes to review", async () => {
    const kyc = stubKyc({ digilockerDocument: async () => null });
    const { userId, riderId, sessionId } = await startDigilocker(kyc);

    expect(await completeDigilocker(pool, userId, riderId, sessionId, kyc)).toMatchObject({
      state: "MANUAL_REVIEW_REQUIRED",
      rejectionCode: "DOCUMENT_UNAVAILABLE",
    });
  });

  test("a certificate with no photo waits for one", async () => {
    serveDocument(certificate({ photo: false }));
    const kyc = stubKyc({ digilockerDocument: async () => ({ xmlFileUrl: "https://vendor.example/doc.zip" }) });
    const { userId, riderId, sessionId } = await startDigilocker(kyc);

    expect((await completeDigilocker(pool, userId, riderId, sessionId, kyc)).state).toBe("PHOTO_PENDING");
  });

  test("a duplicate redirect does not verify twice", async () => {
    serveDocument();
    const kyc = stubKyc();
    const { userId, riderId, sessionId } = await startDigilocker(kyc);
    await completeDigilocker(pool, userId, riderId, sessionId, kyc);

    await expect(completeDigilocker(pool, userId, riderId, sessionId, kyc)).rejects.toBeInstanceOf(
      SessionNotPendingError,
    );
    const { rows } = await pool.query(
      `select count(*)::int as n from driving_licence_verifications where session_id = $1`,
      [sessionId],
    );
    expect(rows[0].n).toBe(1);
  });
});

describe("the self-uploaded photo", () => {
  async function toPhotoPending() {
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({ verifyLicence: async () => VALID_LICENCE });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);
    await verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, kyc);
    return { userId, riderId, sessionId };
  }

  // It proves nothing about whose licence this is.
  test("it never verifies on its own -- a human decides", async () => {
    const { userId, riderId, sessionId } = await toPhotoPending();
    expect(await confirmPhotoUpload(pool, userId, riderId, sessionId, { contentType: "image/jpeg" })).toEqual({
      state: "MANUAL_REVIEW_REQUIRED",
    });

    const session = await stateOf(sessionId);
    expect(session.assurance_level).toBe("LOW");
    expect(session.review_required).toBe(true);
  });

  test("the key is derived server-side, not supplied", async () => {
    const { userId, riderId, sessionId } = await toPhotoPending();
    await confirmPhotoUpload(pool, userId, riderId, sessionId, { contentType: "image/jpeg" });

    const { rows } = await pool.query(
      `select storage_key, source from verification_photos where session_id = $1`,
      [sessionId],
    );
    expect(rows[0].storage_key).toBe(`riders/${riderId}/verification/${sessionId}-self`);
    expect(rows[0].source).toBe("SELF_UPLOADED");
  });

  test("the policy flag is the only way it approves, and it stays LOW", async () => {
    process.env.ALLOW_LOW_ASSURANCE_VERIFICATION = "true";
    const { userId, riderId, sessionId } = await toPhotoPending();
    expect(await confirmPhotoUpload(pool, userId, riderId, sessionId, { contentType: "image/jpeg" })).toEqual({
      state: "VERIFIED",
    });
    expect((await stateOf(sessionId)).assurance_level).toBe("LOW");
  });
});

describe("ownership and limits", () => {
  test("another account's session is not found, rather than forbidden", async () => {
    const { userId, riderId } = await freshRider();
    const stranger = await createUser(pool);
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, stubKyc());

    await expect(
      getSessionStatus(pool, stranger.id, riderId, sessionId),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  test("a session id belonging to another rider of the same account is also refused", async () => {
    const { userId, riderId } = await freshRider();
    const other = await createRider(pool, userId, { verified: false });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, stubKyc());

    await expect(getSessionStatus(pool, userId, other.id, sessionId)).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });

  // Without this, POST .../dl-number is an oracle for testing whether an
  // arbitrary licence number and date of birth go together.
  test("a rider cannot start an unlimited number of attempts", async () => {
    const { userId, riderId } = await freshRider();
    for (let i = 0; i < 3; i += 1) {
      await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, stubKyc());
    }
    await expect(
      startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, stubKyc()),
    ).rejects.toBeInstanceOf(RetryLimitError);
  });

  test("a retry only applies to a finished session, and starts a new one", async () => {
    const { userId, riderId } = await freshRider();
    const kyc = stubKyc({ verifyLicence: async () => ({ status: "REJECTED" }) });
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);

    await expect(retrySession(pool, userId, riderId, sessionId, {}, kyc)).rejects.toBeInstanceOf(
      SessionNotPendingError,
    );

    await verifyByDlNumber(pool, userId, riderId, sessionId, { licenceNumber: "UK0720190001234", dob: "1995-06-15" }, kyc);
    const retried = await retrySession(pool, userId, riderId, sessionId, {}, kyc);
    expect(retried.sessionId).not.toBe(sessionId);
    // The failed attempt's trail survives -- that is why a retry is a new row.
    expect((await stateOf(sessionId)).state).toBe("DOCUMENT_FAILED");
  });

  test("cancelling an in-flight session rejects it once and not twice", async () => {
    const { userId, riderId } = await freshRider();
    const { sessionId } = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, stubKyc());

    expect(await cancelSession(pool, userId, riderId, sessionId)).toEqual({ state: "REJECTED" });
    await expect(cancelSession(pool, userId, riderId, sessionId)).rejects.toBeInstanceOf(
      SessionNotPendingError,
    );
  });
});

describe("the same licence on two accounts", () => {
  // A family sharing an account is not fraud, so this flags rather than refuses.
  test("is flagged for review, and still verifies", async () => {
    serveDocument();
    const kyc = stubKyc({ verifyLicence: async () => ({ ...VALID_LICENCE, photoUrl: "https://cf.example/p.jpg" }) });
    const shared = uniqueLicence();

    const first = await freshRider();
    const firstSession = await startSession(pool, first.userId, first.riderId, { method: "DL_NUMBER", consent: true }, kyc);
    await verifyByDlNumber(pool, first.userId, first.riderId, firstSession.sessionId, { licenceNumber: shared, dob: "1995-06-15" }, kyc);

    const second = await freshRider();
    const secondSession = await startSession(pool, second.userId, second.riderId, { method: "DL_NUMBER", consent: true }, kyc);
    const result = await verifyByDlNumber(pool, second.userId, second.riderId, secondSession.sessionId, { licenceNumber: shared, dob: "1995-06-15" }, kyc);

    expect(result.state).toBe("VERIFIED");
    expect((await stateOf(secondSession.sessionId)).review_required).toBe(true);
    const { rows } = await pool.query(
      `select metadata->>'duplicateLicence' as dup from rider_verification_events
        where session_id = $1 and event_type = 'document_verified'`,
      [secondSession.sessionId],
    );
    expect(rows[0].dup).toBe("true");
  });

  test("the same licence on the SAME account is not a duplicate", async () => {
    serveDocument();
    const kyc = stubKyc({ verifyLicence: async () => ({ ...VALID_LICENCE, photoUrl: "https://cf.example/p.jpg" }) });
    const { userId, riderId } = await freshRider();
    const shared = uniqueLicence();

    const first = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);
    await verifyByDlNumber(pool, userId, riderId, first.sessionId, { licenceNumber: shared, dob: "1995-06-15" }, kyc);
    const second = await startSession(pool, userId, riderId, { method: "DL_NUMBER", consent: true }, kyc);
    await verifyByDlNumber(pool, userId, riderId, second.sessionId, { licenceNumber: shared, dob: "1995-06-15" }, kyc);

    expect((await stateOf(second.sessionId)).review_required).toBe(false);
  });
});
