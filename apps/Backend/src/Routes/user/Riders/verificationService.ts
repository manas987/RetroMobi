import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";
import {
  photoContentType,
  parseDrivingLicenceXml,
  type ParsedDrivingLicence,
} from "../../../lib/digilockerXml.ts";
import { maskDl } from "../../../lib/maskSecrets.ts";
import { putObject, presignUpload } from "../../../lib/storage.ts";
import {
  IllegalTransitionError,
  transition,
  type VerificationState,
} from "../../../lib/verificationStateMachine.ts";
import { hashLicenceNumber, normaliseLicenceNumber } from "../../../lib/verificationHash.ts";
import { istDate, policyVersion } from "../../../lib/licenceGate.ts";
import { readXmlFromZip } from "../../../lib/zip.ts";
import type { KycClient, LicenceResult } from "../../../providers/kyc.ts";
import { RiderNotFoundError } from "./ridersService.ts";

export class SessionNotFoundError extends Error {}
export class ConsentRequiredError extends Error {}
export class SessionNotPendingError extends Error {}
export class RetryLimitError extends Error {}
export class PhotoNotExpectedError extends Error {}

/**
 * The consent wording is the SERVER'S, not the client's. A client-supplied
 * string would let a caller record that the customer agreed to something they
 * were never shown, which is the one thing a consent record exists to prevent.
 * The UI reads it from `GET .../verification/consent` and must display exactly
 * this.
 *
 * Purpose-specific, per DPDP Rule 3 (in force 2027-05-13). "Verifying your
 * driving licence so you can rent" is the purpose; it does not cover marketing
 * or anything else, and the retention line is the promise Phase 8's sweep keeps.
 */
export const CONSENT_TEXT =
  "I allow RetroMobi to verify my driving licence with the issuing authority " +
  "(through DigiLocker or the transport department's records) and to store my " +
  "licence details and licence photograph for the purpose of renting a vehicle. " +
  "I understand the photograph is shown to the shop staff at pickup so they can " +
  "confirm I am the rider, and that these details are deleted after my last rental.";

/** A session this old was abandoned. Short, because a consent is a moment. */
const SESSION_TTL_HOURS = 24;
/** Attempts per rider, counted across sessions -- the enumeration limit. */
const MAX_ATTEMPTS = 3;

const TERMINAL: VerificationState[] = ["DOCUMENT_FAILED", "REJECTED", "EXPIRED", "REVOKED"];

async function requireOwnedRider(client: Pool | PoolClient, userId: string, riderId: string) {
  const { rows } = await client.query(
    `select id from riders where id = $1 and user_id = $2 and deleted_at is null`,
    [riderId, userId],
  );
  if (rows.length === 0) throw new RiderNotFoundError(`rider ${riderId} not found`);
}

/**
 * A session id from another account must be indistinguishable from one that
 * does not exist -- a 403 would confirm it is real.
 */
async function loadOwnedSession(
  client: Pool | PoolClient,
  userId: string,
  riderId: string,
  sessionId: string,
) {
  const { rows } = await client.query(
    `select s.* from rider_verification_sessions s
       join riders r on r.id = s.rider_id
      where s.id = $1 and s.rider_id = $2 and r.user_id = $3 and r.deleted_at is null`,
    [sessionId, riderId, userId],
  );
  if (rows.length === 0) throw new SessionNotFoundError(`verification session ${sessionId} not found`);
  return rows[0] as {
    id: string;
    rider_id: string;
    user_id: string;
    method: "DIGILOCKER" | "DL_NUMBER";
    state: VerificationState;
    verification_id: string;
    policy_version: string;
    expires_at: Date;
  };
}

function allowLowAssurance(): boolean {
  return process.env.ALLOW_LOW_ASSURANCE_VERIFICATION === "true";
}

export async function startSession(
  pool: Pool,
  userId: string,
  riderId: string,
  input: { method: "DIGILOCKER" | "DL_NUMBER"; consent: boolean; redirectUrl?: string; ip?: string },
  kyc: KycClient,
) {
  await requireOwnedRider(pool, userId, riderId);
  // Checked here and nowhere else, so there is no path to a session without it.
  // The schema backs this up with a check constraint.
  if (!input.consent) {
    throw new ConsentRequiredError("verification cannot start without consent");
  }

  const { rows: attemptRows } = await pool.query(
    `select count(*)::int as n from rider_verification_sessions
      where rider_id = $1 and created_at > now() - interval '24 hours'`,
    [riderId],
  );
  if (attemptRows[0].n >= MAX_ATTEMPTS) {
    throw new RetryLimitError(
      `too many verification attempts for rider ${riderId}; try again tomorrow or ask for a review`,
    );
  }

  // Ours, minted before the vendor is called. Cashfree's `verification_id`
  // allows alphanumerics plus . - _ only, so a bare uuid is safe.
  const verificationId = crypto.randomUUID();
  const digilocker = input.method === "DIGILOCKER";

  // The vendor call comes first: a session created for a request that then
  // fails to start leaves a CONSENT_PENDING row nobody can ever complete.
  let consentUrl: string | undefined;
  let providerReference: string | null = null;
  if (digilocker) {
    if (!input.redirectUrl) throw new ConsentRequiredError("DigiLocker needs a redirect URL");
    const created = await kyc.digilockerCreateRequest({
      verificationId,
      redirectUrl: input.redirectUrl,
    });
    consentUrl = created.consentUrl;
    providerReference = created.providerReference;
  }

  const { rows } = await pool.query(
    `insert into rider_verification_sessions
       (rider_id, user_id, method, provider, state, verification_id, provider_reference,
        policy_version, consent_text, consent_at, consent_ip, expires_at)
     values ($1, $2, $3, 'CASHFREE_SECURE_ID', $4, $5, $6, $7, $8, now(), $9,
             now() + ($10 || ' hours')::interval)
     returning id, state`,
    [
      riderId,
      userId,
      input.method,
      digilocker ? "CONSENT_PENDING" : "DOCUMENT_PENDING",
      verificationId,
      providerReference,
      policyVersion(),
      CONSENT_TEXT,
      input.ip ?? null,
      String(SESSION_TTL_HOURS),
    ],
  );

  return { sessionId: rows[0].id as string, state: rows[0].state as VerificationState, consentUrl };
}

/**
 * Vehicle-independent sanity checks on the licence itself. Entitlement is NOT
 * decided here -- that needs a vehicle, so it belongs to the booking and
 * handover gates (lib/licenceGate.ts). This only rejects a licence that is
 * unusable whatever it is pointed at.
 */
function licenceIsUnusable(result: {
  expiresOn?: string;
  licenceStatus?: string;
  categories?: Array<{ code: string }>;
}): string | null {
  if (result.expiresOn && result.expiresOn < istDate(new Date())) return "LICENCE_EXPIRED";
  const status = result.licenceStatus?.trim().toUpperCase();
  if (status && !/^(ACTIVE|VALID)$/.test(status)) return "STATUS_NOT_ACTIVE";
  if (result.categories?.some((c) => /LRN|LEARNER/.test(c.code.toUpperCase()))) {
    return "LEARNER_LICENCE";
  }
  return null;
}

/** Stores the photo and returns its key, or null when there is nothing to store. */
async function storeVendorPhoto(
  riderId: string,
  sessionId: string,
  photo: { base64?: string; url?: string; format?: string },
): Promise<{ storageKey: string; contentType: string } | null> {
  let bytes: Uint8Array | null = null;
  let contentType = photoContentType(photo.format);

  if (photo.base64) {
    bytes = new Uint8Array(Buffer.from(photo.base64, "base64"));
  } else if (photo.url) {
    // The RTO photo URL expires in 24 hours, so it is downloaded now and the
    // URL is never stored: a stored dead link looks exactly like a working one.
    const response = await fetch(photo.url);
    if (!response.ok) return null;
    contentType = response.headers.get("content-type") ?? "image/jpeg";
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (!bytes || bytes.byteLength === 0) return null;

  const key = `riders/${riderId}/verification/${sessionId}`;
  const stored = await putObject(key, bytes, contentType);
  if (stored.devFallback) {
    // No storage configured, so the bytes are gone. Treated as "no photograph"
    // rather than recorded as one: with face matching dropped, this photo IS
    // the identity evidence, and a session that claims to hold one it does not
    // would send a merchant to an empty presigned URL at handover with a
    // customer standing in front of them. The session goes to PHOTO_PENDING
    // instead -- which is also why R2 credentials are a production requirement
    // for verification, not just for uploads (dl-verification-checklist.md).
    console.log(
      `[dev-fallback] verification photo for rider ${riderId} was NOT stored — treating the session as having no photograph`,
    );
    return null;
  }
  return { storageKey: key, contentType };
}

/**
 * Everything after a document has been read, for both paths: write the licence
 * record, the categories and the photo, then decide the final state.
 *
 * `VERIFIED` requires a document AND a photograph of a trusted source. With
 * automated face matching dropped, the photograph is the whole of the identity
 * evidence -- without one there is nothing for the merchant to compare a face
 * against at pickup, so the session waits in PHOTO_PENDING instead.
 */
async function recordDocument(
  client: PoolClient,
  args: {
    session: { id: string; rider_id: string };
    userId: string;
    sourceType: "DIGILOCKER_ISSUED" | "RTO_RECORD";
    licenceNumber: string;
    holderName?: string;
    licenceStatus?: string;
    validFrom?: string;
    expiresOn?: string;
    issuingAuthority?: string;
    sourceAt?: string;
    photo: { storageKey: string; contentType: string } | null;
    categories: Array<{
      code: string;
      abbreviation?: string;
      issueDate?: string;
      endorseDate?: string;
    }>;
  },
) {
  const hash = hashLicenceNumber(args.licenceNumber);

  // The same licence on two accounts is a flag, never a refusal: families share
  // an account, and one person legitimately re-registers. A human looks.
  const { rows: duplicates } = await client.query(
    `select 1 from driving_licence_verifications dlv
       join riders r on r.id = dlv.rider_id
      where dlv.licence_number_hash = $1 and r.user_id <> $2
      limit 1`,
    [hash, args.userId],
  );
  const duplicate = duplicates.length > 0;

  const { rows } = await client.query(
    `insert into driving_licence_verifications
       (rider_id, session_id, provider, licence_number, licence_number_hash, status,
        licence_status, source_type, source_at, valid_from, expires_on, issuing_authority,
        holder_name, photo_available, verified_at)
     values ($1, $2, 'CASHFREE_SECURE_ID', $3, $4, 'VERIFIED', $5, $6, $7, $8, $9, $10, $11, $12, now())
     returning id`,
    [
      args.session.rider_id,
      args.session.id,
      // The mask, never the number. See lib/maskSecrets.ts.
      maskDl(args.licenceNumber),
      hash,
      args.licenceStatus ?? null,
      args.sourceType,
      args.sourceAt ?? null,
      args.validFrom ?? null,
      args.expiresOn ?? null,
      args.issuingAuthority ?? null,
      args.holderName ?? null,
      args.photo !== null,
    ],
  );
  const verificationId = rows[0].id as string;

  for (const category of args.categories) {
    await client.query(
      `insert into driving_licence_categories
         (licence_verification_id, code, abbreviation, issue_date, endorse_date)
       values ($1, $2, $3, $4, $5)`,
      [
        verificationId,
        category.code,
        category.abbreviation ?? null,
        category.issueDate ?? null,
        category.endorseDate ?? null,
      ],
    );
  }

  if (args.photo) {
    await client.query(
      `insert into verification_photos (rider_id, session_id, source, storage_key, content_type)
       values ($1, $2, $3, $4, $5)`,
      [
        args.session.rider_id,
        args.session.id,
        args.sourceType,
        args.photo.storageKey,
        args.photo.contentType,
      ],
    );
  }

  await transition(client, {
    sessionId: args.session.id,
    to: "DOCUMENT_VERIFIED",
    actorType: "PROVIDER",
    eventType: "document_verified",
    reviewRequired: duplicate || undefined,
    metadata: {
      sourceType: args.sourceType,
      licenceNumber: args.licenceNumber,
      duplicateLicence: duplicate,
    },
  });

  if (!args.photo) {
    await transition(client, {
      sessionId: args.session.id,
      to: "PHOTO_PENDING",
      actorType: "SYSTEM",
      eventType: "photo_required",
      metadata: { reason: "no trusted photograph available from the provider" },
    });
    return { state: "PHOTO_PENDING" as VerificationState, verificationId, duplicate };
  }

  await transition(client, {
    sessionId: args.session.id,
    to: "VERIFIED",
    actorType: "SYSTEM",
    eventType: "verified",
    // ISSUED beats an RTO lookup: one is the government's own signed document,
    // the other is a database read about it.
    assuranceLevel: args.sourceType === "DIGILOCKER_ISSUED" ? "HIGH" : "MEDIUM",
  });
  return { state: "VERIFIED" as VerificationState, verificationId, duplicate };
}

async function failDocument(
  pool: Pool,
  sessionId: string,
  to: Extract<VerificationState, "DOCUMENT_FAILED" | "REJECTED" | "MANUAL_REVIEW_REQUIRED">,
  code: string,
  metadata: Record<string, unknown> = {},
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await transition(client, {
      sessionId,
      to,
      actorType: "PROVIDER",
      eventType: code.toLowerCase(),
      rejectionCode: code,
      reviewRequired: to === "MANUAL_REVIEW_REQUIRED" || undefined,
      metadata,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { state: to, rejectionCode: code };
}

export async function verifyByDlNumber(
  pool: Pool,
  userId: string,
  riderId: string,
  sessionId: string,
  input: { licenceNumber: string; dob: string },
  kyc: KycClient,
) {
  const session = await loadOwnedSession(pool, userId, riderId, sessionId);
  if (session.state !== "DOCUMENT_PENDING") {
    // Includes the duplicate-submit case: a second POST finds the session has
    // moved on and says so, rather than calling the vendor twice.
    throw new SessionNotPendingError(`session ${sessionId} is ${session.state}, not awaiting a licence`);
  }

  // Normalised, never altered: case and separators only (lib/verificationHash).
  const licenceNumber = normaliseLicenceNumber(input.licenceNumber);
  const result: LicenceResult | null = await kyc.verifyLicence({
    verificationId: session.verification_id,
    licenceNumber,
    dob: input.dob,
  });

  if (result?.status === "SANDBOX_UNAVAILABLE") {
    // The plan's intent, now that the state exists: an outage is not a
    // rejection and must never be an approval either.
    return failDocument(pool, sessionId, "MANUAL_REVIEW_REQUIRED", "PROVIDER_UNAVAILABLE");
  }
  if (!result) {
    return failDocument(pool, sessionId, "DOCUMENT_FAILED", "LICENCE_NOT_FOUND");
  }
  if (result.status !== "VERIFIED") {
    return failDocument(pool, sessionId, "DOCUMENT_FAILED", "LICENCE_INVALID");
  }
  const unusable = licenceIsUnusable(result);
  if (unusable) return failDocument(pool, sessionId, "DOCUMENT_FAILED", unusable);

  const photo = await storeVendorPhoto(riderId, sessionId, {
    url: result.photoUrl,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const outcome = await recordDocument(client, {
      session,
      userId,
      sourceType: "RTO_RECORD",
      licenceNumber,
      holderName: result.holderName,
      licenceStatus: result.licenceStatus,
      validFrom: result.validFrom,
      expiresOn: result.expiresOn,
      issuingAuthority: result.issuingAuthority,
      sourceAt: result.sourceAt,
      photo,
      categories: result.categories ?? [],
    });
    // The rider's dob is set from the one place it is entered, so Profile and
    // the age check have it without asking again.
    await client.query(`update riders set dob = $1, updated_at = now() where id = $2`, [
      input.dob,
      riderId,
    ]);
    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "rider.licence_verified",
      entityType: "rider",
      entityId: riderId,
      after: { state: outcome.state, source: "RTO_RECORD", licence: maskDl(licenceNumber) },
    });
    await client.query("COMMIT");
    return outcome;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function completeDigilocker(
  pool: Pool,
  userId: string,
  riderId: string,
  sessionId: string,
  kyc: KycClient,
) {
  const session = await loadOwnedSession(pool, userId, riderId, sessionId);
  // No client-supplied id anywhere in here: the vendor is asked about the
  // verification_id WE minted and stored, so a forged redirect cannot point
  // this at someone else's consent.
  if (session.state !== "CONSENT_PENDING") {
    throw new SessionNotPendingError(`session ${sessionId} is ${session.state}, not awaiting consent`);
  }

  const live = await kyc.digilockerStatus({ verificationId: session.verification_id });
  if (!live || live.status === "SANDBOX_UNAVAILABLE") {
    return failDocument(pool, sessionId, "MANUAL_REVIEW_REQUIRED", "PROVIDER_UNAVAILABLE");
  }
  // The customer has not finished on DigiLocker's side. Not an error: they can
  // come back, and the redirect legitimately arrives before consent is recorded.
  if (live.status === "PENDING") return { state: "CONSENT_PENDING" as VerificationState };
  if (live.status === "CONSENT_DENIED") {
    return failDocument(pool, sessionId, "REJECTED", "CONSENT_DENIED");
  }
  if (live.status === "EXPIRED") {
    return failDocument(pool, sessionId, "REJECTED", "CONSENT_EXPIRED");
  }

  const document = await kyc.digilockerDocument({ verificationId: session.verification_id });
  if (!document?.xmlFileUrl) {
    return failDocument(pool, sessionId, "MANUAL_REVIEW_REQUIRED", "DOCUMENT_UNAVAILABLE");
  }

  let parsed: ParsedDrivingLicence;
  try {
    const response = await fetch(document.xmlFileUrl);
    if (!response.ok) throw new Error(`xml_file fetch failed (${response.status})`);
    const zipped = new Uint8Array(await response.arrayBuffer());
    parsed = parseDrivingLicenceXml(readXmlFromZip(zipped));
  } catch (err) {
    // A document we cannot read is not a verified document, and not the
    // customer's fault either.
    return failDocument(pool, sessionId, "MANUAL_REVIEW_REQUIRED", "DOCUMENT_UNREADABLE", {
      error: (err as Error).message,
    });
  }

  const unusable = licenceIsUnusable({ expiresOn: parsed.expiryDate, categories: parsed.categories });
  if (unusable) return failDocument(pool, sessionId, "DOCUMENT_FAILED", unusable);

  // Consent moves the session to DOCUMENT_PENDING before the document is
  // recorded, so the trail reads consent -> document rather than jumping.
  const consentClient = await pool.connect();
  try {
    await consentClient.query("BEGIN");
    await transition(consentClient, {
      sessionId,
      to: "DOCUMENT_PENDING",
      actorType: "CUSTOMER",
      actorId: userId,
      eventType: "digilocker_authenticated",
      metadata: { userDetails: live.userDetails ?? {} },
    });
    await consentClient.query("COMMIT");
  } catch (err) {
    await consentClient.query("ROLLBACK");
    throw err;
  } finally {
    consentClient.release();
  }

  const photo = await storeVendorPhoto(riderId, sessionId, {
    base64: parsed.photoBase64 ?? document.photoBase64,
    format: parsed.photoFormat,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const outcome = await recordDocument(client, {
      session,
      userId,
      sourceType: "DIGILOCKER_ISSUED",
      licenceNumber: parsed.licenceNumber,
      holderName: parsed.holderName,
      // DigiLocker issues the document rather than reporting a status for it;
      // an issued certificate that exists is the authority's own statement.
      licenceStatus: "ACTIVE",
      validFrom: parsed.issueDate,
      expiresOn: parsed.expiryDate,
      issuingAuthority: parsed.issuingAuthority,
      photo,
      categories: parsed.categories,
    });

    // The XML's signature was NOT verified -- see lib/digilockerXml.ts. Until
    // it is, an issued document is flagged rather than trusted outright, and
    // the event records exactly which assumption was made.
    await client.query(
      `update rider_verification_sessions set review_required = true where id = $1`,
      [sessionId],
    );
    await client.query(
      `insert into rider_verification_events (session_id, actor_type, event_type, metadata)
       values ($1, 'SYSTEM', 'xml_signature_unverified', $2)`,
      [sessionId, JSON.stringify({ blocker: "docs/dl-verification-checklist.md" })],
    );

    if (parsed.dob) {
      await client.query(`update riders set dob = $1, updated_at = now() where id = $2`, [
        parsed.dob,
        riderId,
      ]);
    }
    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "rider.licence_verified",
      entityType: "rider",
      entityId: riderId,
      after: {
        state: outcome.state,
        source: "DIGILOCKER_ISSUED",
        licence: maskDl(parsed.licenceNumber),
      },
    });
    await client.query("COMMIT");
    return outcome;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The last resort, when neither vendor path produced a photograph. A photo the
 * customer supplies is NOT identity evidence -- it proves nothing about whose
 * licence this is -- so it never raises assurance above LOW and the session
 * goes to a human unless policy explicitly allows LOW.
 */
export async function requestPhotoUpload(
  pool: Pool,
  userId: string,
  riderId: string,
  sessionId: string,
  contentType: string,
) {
  const session = await loadOwnedSession(pool, userId, riderId, sessionId);
  if (session.state !== "PHOTO_PENDING") {
    throw new PhotoNotExpectedError(`session ${sessionId} is ${session.state}, not awaiting a photo`);
  }
  return presignUpload(`riders/${riderId}/verification/${sessionId}-self`, contentType);
}

export async function confirmPhotoUpload(
  pool: Pool,
  userId: string,
  riderId: string,
  sessionId: string,
  input: { contentType: string },
) {
  const session = await loadOwnedSession(pool, userId, riderId, sessionId);
  if (session.state !== "PHOTO_PENDING") {
    throw new PhotoNotExpectedError(`session ${sessionId} is ${session.state}, not awaiting a photo`);
  }
  // The key is derived here, not taken from the client: otherwise a caller
  // could point the record at any object in the bucket.
  const storageKey = `riders/${riderId}/verification/${sessionId}-self`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `insert into verification_photos (rider_id, session_id, source, storage_key, content_type)
       values ($1, $2, 'SELF_UPLOADED', $3, $4)`,
      [riderId, sessionId, storageKey, input.contentType],
    );
    await client.query(
      `update driving_licence_verifications set photo_available = true where session_id = $1`,
      [sessionId],
    );

    const low = allowLowAssurance();
    await transition(client, {
      sessionId,
      to: low ? "VERIFIED" : "MANUAL_REVIEW_REQUIRED",
      actorType: "CUSTOMER",
      actorId: userId,
      eventType: "self_uploaded_photo",
      assuranceLevel: "LOW",
      reviewRequired: !low || undefined,
      metadata: { source: "SELF_UPLOADED", allowLowAssurance: low },
    });
    await client.query("COMMIT");
    return { state: low ? "VERIFIED" : "MANUAL_REVIEW_REQUIRED" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getSessionStatus(
  pool: Pool,
  userId: string,
  riderId: string,
  sessionId: string,
) {
  const session = await loadOwnedSession(pool, userId, riderId, sessionId);
  const { rows } = await pool.query(
    `select s.state, s.method, s.assurance_level, s.review_required, s.rejection_code,
            s.expires_at,
            dlv.licence_number as licence_number_masked,
            to_char(dlv.expires_on, 'YYYY-MM-DD') as licence_expires_on,
            (select p.source from verification_photos p
              where p.session_id = s.id and p.deleted_at is null
              order by p.created_at desc limit 1) as photo_source
       from rider_verification_sessions s
       left join driving_licence_verifications dlv on dlv.session_id = s.id
      where s.id = $1`,
    [session.id],
  );
  return rows[0];
}

/**
 * A decided session is never revived -- the event trail of the failed attempt
 * has to stay intact -- so a retry is a new session. The rider's attempt count
 * is what stops this being an enumeration oracle.
 */
export async function retrySession(
  pool: Pool,
  userId: string,
  riderId: string,
  sessionId: string,
  input: { redirectUrl?: string; ip?: string },
  kyc: KycClient,
) {
  const session = await loadOwnedSession(pool, userId, riderId, sessionId);
  if (!TERMINAL.includes(session.state)) {
    throw new SessionNotPendingError(
      `session ${sessionId} is ${session.state} and has not finished; there is nothing to retry`,
    );
  }
  return startSession(
    pool,
    userId,
    riderId,
    { method: session.method, consent: true, redirectUrl: input.redirectUrl, ip: input.ip },
    kyc,
  );
}

export async function cancelSession(
  pool: Pool,
  userId: string,
  riderId: string,
  sessionId: string,
) {
  const session = await loadOwnedSession(pool, userId, riderId, sessionId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await transition(client, {
      sessionId: session.id,
      to: "REJECTED",
      actorType: "CUSTOMER",
      actorId: userId,
      eventType: "cancelled_by_customer",
      rejectionCode: "CANCELLED",
    });
    await client.query("COMMIT");
    return { state: "REJECTED" as VerificationState };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof IllegalTransitionError) {
      throw new SessionNotPendingError(`session ${sessionId} has already finished`);
    }
    throw err;
  } finally {
    client.release();
  }
}

/** The current licence result for a rider, masked. Nothing unmasked leaves here. */
export async function getLicence(pool: Pool, userId: string, riderId: string) {
  await requireOwnedRider(pool, userId, riderId);
  const { rows } = await pool.query(
    `select dlv.licence_number as licence_number_masked,
            dlv.holder_name,
            dlv.licence_status,
            dlv.source_type,
            to_char(dlv.valid_from, 'YYYY-MM-DD') as valid_from,
            to_char(dlv.expires_on, 'YYYY-MM-DD') as expires_on,
            dlv.issuing_authority,
            dlv.photo_available,
            s.id as session_id, s.state, s.assurance_level, s.review_required
       from driving_licence_verifications dlv
       left join rider_verification_sessions s on s.id = dlv.session_id
      where dlv.rider_id = $1 and dlv.status = 'VERIFIED'
      order by dlv.verified_at desc nulls last
      limit 1`,
    [riderId],
  );
  if (rows.length === 0) return { state: "NOT_STARTED" };

  const { rows: categories } = await pool.query(
    `select c.code, c.abbreviation
       from driving_licence_categories c
       join driving_licence_verifications dlv on dlv.id = c.licence_verification_id
      where dlv.rider_id = $1 and dlv.status = 'VERIFIED'
      order by c.code`,
    [riderId],
  );
  return { ...rows[0], categories };
}
