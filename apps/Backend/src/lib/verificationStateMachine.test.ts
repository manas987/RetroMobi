// With automated face matching dropped, the transition table IS the policy
// that stops a licence being approved on insufficient evidence. So the cases
// that matter most here are the ones asserting what CANNOT happen.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import { createRider, createUser } from "../test/fixtures.ts";
import {
  IllegalTransitionError,
  SessionNotFoundError,
  TRANSITIONS,
  type VerificationState,
  canTransition,
  isAlreadyApplied,
  transition,
} from "./verificationStateMachine.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

async function createSession(state: VerificationState, policyVersion = "v1") {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id, { verified: false });
  const { rows } = await pool.query(
    `insert into rider_verification_sessions
       (rider_id, user_id, method, provider, state, verification_id, policy_version,
        consent_text, consent_at, expires_at)
     values ($1, $2, 'DL_NUMBER', 'CASHFREE_SECURE_ID', $3, $4, $5,
             'test consent', now(), now() + interval '1 day')
     returning id`,
    [rider.id, user.id, state, `test-${crypto.randomUUID()}`, policyVersion],
  );
  return { sessionId: rows[0].id as string, userId: user.id as string };
}

async function move(sessionId: string, to: VerificationState, actorId?: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await transition(client, {
      sessionId,
      to,
      actorType: "SYSTEM",
      actorId: actorId ?? null,
      eventType: "test",
    });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

describe("the transition table", () => {
  test("every legal edge is accepted", () => {
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransition(from as VerificationState, to)).toBe(true);
      }
    }
  });

  test("every state's own state is not a legal edge -- a no-op is not a transition", () => {
    for (const state of Object.keys(TRANSITIONS) as VerificationState[]) {
      expect(canTransition(state, state)).toBe(false);
    }
  });

  test("a decided session is terminal and a retry must start a new one", () => {
    for (const terminal of ["DOCUMENT_FAILED", "REJECTED", "EXPIRED", "REVOKED"] as const) {
      expect(TRANSITIONS[terminal]).toEqual([]);
    }
  });

  // The five things the brief says must NEVER independently produce VERIFIED.
  test("nothing reaches VERIFIED except from document-verified, photo-pending or review", () => {
    const allowed = new Set(["DOCUMENT_VERIFIED", "PHOTO_PENDING", "MANUAL_REVIEW_REQUIRED"]);
    for (const state of Object.keys(TRANSITIONS) as VerificationState[]) {
      if (allowed.has(state)) continue;
      expect(canTransition(state, "VERIFIED")).toBe(false);
    }
  });

  test("a vendor HTTP 200 alone cannot verify: DOCUMENT_PENDING has no edge to VERIFIED", () => {
    expect(canTransition("DOCUMENT_PENDING", "VERIFIED")).toBe(false);
  });

  test("a DigiLocker authentication alone cannot verify, nor skip the document", () => {
    expect(canTransition("CONSENT_PENDING", "VERIFIED")).toBe(false);
    expect(canTransition("CONSENT_PENDING", "DOCUMENT_VERIFIED")).toBe(false);
  });

  test("a failed document check cannot be walked back to approval", () => {
    expect(canTransition("DOCUMENT_FAILED", "VERIFIED")).toBe(false);
    expect(canTransition("DOCUMENT_FAILED", "MANUAL_REVIEW_REQUIRED")).toBe(false);
  });

  test("an admin can only approve out of review, never out of a failed document", () => {
    expect(canTransition("MANUAL_REVIEW_REQUIRED", "VERIFIED")).toBe(true);
    expect(canTransition("REJECTED", "VERIFIED")).toBe(false);
  });

  test("a customer can cancel either path mid-flow", () => {
    expect(canTransition("CONSENT_PENDING", "REJECTED")).toBe(true);
    expect(canTransition("DOCUMENT_PENDING", "REJECTED")).toBe(true);
  });

  test("isAlreadyApplied absorbs a duplicate or out-of-order vendor result", () => {
    expect(isAlreadyApplied("DOCUMENT_VERIFIED", "DOCUMENT_VERIFIED")).toBe(true);
    expect(isAlreadyApplied("VERIFIED", "DOCUMENT_VERIFIED")).toBe(true);
    expect(isAlreadyApplied("DOCUMENT_PENDING", "DOCUMENT_VERIFIED")).toBe(false);
  });
});

describe("transition()", () => {
  test("a legal move updates the state and writes one event", async () => {
    const { sessionId, userId } = await createSession("DOCUMENT_PENDING");
    const result = await move(sessionId, "DOCUMENT_VERIFIED", userId);
    expect(result).toEqual({ previousState: "DOCUMENT_PENDING", state: "DOCUMENT_VERIFIED" });

    const { rows } = await pool.query(
      `select previous_state, next_state from rider_verification_events where session_id = $1`,
      [sessionId],
    );
    expect(rows).toEqual([{ previous_state: "DOCUMENT_PENDING", next_state: "DOCUMENT_VERIFIED" }]);
  });

  test("an illegal move raises and leaves no event behind", async () => {
    const { sessionId } = await createSession("DOCUMENT_PENDING");
    await expect(move(sessionId, "VERIFIED")).rejects.toBeInstanceOf(IllegalTransitionError);

    const state = await pool.query(
      `select state from rider_verification_sessions where id = $1`,
      [sessionId],
    );
    expect(state.rows[0].state).toBe("DOCUMENT_PENDING");
    const events = await pool.query(
      `select count(*)::int as n from rider_verification_events where session_id = $1`,
      [sessionId],
    );
    expect(events.rows[0].n).toBe(0);
  });

  test("an unknown session is an error, not a silent no-op", async () => {
    await expect(move(crypto.randomUUID(), "VERIFIED")).rejects.toBeInstanceOf(
      SessionNotFoundError,
    );
  });

  test("event metadata is redacted -- a licence number is masked, a dob dropped", async () => {
    const { sessionId } = await createSession("DOCUMENT_PENDING");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await transition(client, {
        sessionId,
        to: "DOCUMENT_FAILED",
        actorType: "PROVIDER",
        eventType: "vendor_rejected",
        metadata: { dl_number: "UK0720190001234", dob: "1995-06-15", status: "INVALID" },
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const { rows } = await pool.query(
      `select metadata from rider_verification_events where session_id = $1`,
      [sessionId],
    );
    expect(rows[0].metadata).toEqual({
      dl_number: "UK07*******1234",
      dob: "[redacted]",
      status: "INVALID",
    });
  });

  test("assurance, review flag and rejection code are set with the state", async () => {
    const { sessionId } = await createSession("PHOTO_PENDING");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await transition(client, {
        sessionId,
        to: "MANUAL_REVIEW_REQUIRED",
        actorType: "SYSTEM",
        eventType: "self_uploaded_photo",
        assuranceLevel: "LOW",
        reviewRequired: true,
        rejectionCode: null,
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const { rows } = await pool.query(
      `select state, assurance_level, review_required from rider_verification_sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]).toEqual({
      state: "MANUAL_REVIEW_REQUIRED",
      assurance_level: "LOW",
      review_required: true,
    });
  });
});

describe("the consent constraint", () => {
  test("a new session cannot be created without a recorded consent", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { verified: false });
    await expect(
      pool.query(
        `insert into rider_verification_sessions
           (rider_id, user_id, method, provider, state, verification_id, policy_version, expires_at)
         values ($1, $2, 'DL_NUMBER', 'CASHFREE_SECURE_ID', 'DOCUMENT_PENDING', $3, 'v1', now())`,
        [rider.id, user.id, `test-${crypto.randomUUID()}`],
      ),
    ).rejects.toThrow(/consent_recorded_unless_legacy/);
  });

  test("only backfilled legacy rows are exempt", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { verified: false });
    await expect(
      pool.query(
        `insert into rider_verification_sessions
           (rider_id, user_id, method, provider, state, verification_id, policy_version, expires_at)
         values ($1, $2, 'DL_NUMBER', 'CASHFREE_SECURE_ID', 'VERIFIED', $3, 'legacy', now())`,
        [rider.id, user.id, `test-${crypto.randomUUID()}`],
      ),
    ).resolves.toBeDefined();
  });
});
