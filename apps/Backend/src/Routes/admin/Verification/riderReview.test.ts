// The admin review path. The important cases are the ones an admin must NOT
// be able to do: approve a session whose document failed, approve one still
// waiting on the vendor, or approve without saying why.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import { createRider, createUser } from "../../../test/fixtures.ts";
import { RiderReviewSchema } from "./schema.ts";
import {
  NotReviewableError,
  VerificationTargetNotFoundError,
  decideRiderVerification,
  getRiderVerificationEvents,
  listVerificationQueue,
} from "./verificationService.ts";

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

async function adminId() {
  const { rows } = await pool.query(
    `insert into admins (phone, email, name, role) values ($1, $2, 'Reviewer', 'ADMIN') returning id`,
    [`+9170${String(crypto.getRandomValues(new Uint32Array(1))[0]).padStart(8, "0").slice(0, 8)}`,
     `reviewer${crypto.randomUUID()}@example.com`],
  );
  return rows[0].id as string;
}

async function sessionIn(state: string) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id, { verified: false });
  const { rows } = await pool.query(
    `insert into rider_verification_sessions
       (rider_id, user_id, method, provider, state, verification_id, policy_version,
        assurance_level, review_required, consent_text, consent_at, expires_at)
     values ($1, $2, 'DL_NUMBER', 'CASHFREE_SECURE_ID', $3, $4, 'v1',
             'LOW', $5, 'consent', now(), now() + interval '1 day')
     returning id`,
    [
      rider.id,
      user.id,
      state,
      `review-${crypto.randomUUID()}`,
      state === "MANUAL_REVIEW_REQUIRED",
    ],
  );
  return { sessionId: rows[0].id as string, riderId: rider.id as string };
}

describe("the queue", () => {
  // The shared default status is "PENDING", which no session state ever equals
  // -- without a per-type default this queue was silently always empty.
  test("defaults to the sessions awaiting a human", async () => {
    const { sessionId } = await sessionIn("MANUAL_REVIEW_REQUIRED");
    const rows = await listVerificationQueue(pool, "RIDER_VERIFICATION");
    expect(rows.map((r: { id: string }) => r.id)).toContain(sessionId);
  });

  test("a verified session is not in it, but can be asked for", async () => {
    const { sessionId } = await sessionIn("VERIFIED");
    const pending = await listVerificationQueue(pool, "RIDER_VERIFICATION");
    expect(pending.map((r: { id: string }) => r.id)).not.toContain(sessionId);

    const decided = await listVerificationQueue(pool, "RIDER_VERIFICATION", "VERIFIED");
    expect(decided.map((r: { id: string }) => r.id)).toContain(sessionId);
  });

  test("rows carry why a human is needed, and never a full licence number", async () => {
    const { sessionId } = await sessionIn("MANUAL_REVIEW_REQUIRED");
    const rows = await listVerificationQueue(pool, "RIDER_VERIFICATION");
    const row = rows.find((r: { id: string }) => r.id === sessionId);

    expect(row).toMatchObject({ review_required: true, assurance_level: "LOW", method: "DL_NUMBER" });
    expect(row).toHaveProperty("rider_name");
    expect(row).toHaveProperty("other_accounts");
    expect(row).not.toHaveProperty("licence_number");
  });
});

describe("deciding", () => {
  test("approving out of review works and is audited with the reason", async () => {
    const admin = await adminId();
    const { sessionId } = await sessionIn("MANUAL_REVIEW_REQUIRED");

    expect(
      await decideRiderVerification(pool, admin, sessionId, {
        status: "VERIFIED",
        reason: "Called the customer and checked the licence by video",
      }),
    ).toEqual({ state: "VERIFIED" });

    const { rows } = await pool.query(
      `select review_required, state from rider_verification_sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]).toEqual({ state: "VERIFIED", review_required: false });

    const events = await getRiderVerificationEvents(pool, sessionId);
    expect(events.at(-1)).toMatchObject({
      actor_type: "ADMIN",
      event_type: "approved_by_admin",
      next_state: "VERIFIED",
    });
    const audit = await pool.query(
      `select 1 from audit_logs where entity_id = $1 and action = 'rider_verification.decided'`,
      [sessionId],
    );
    expect(audit.rows).toHaveLength(1);
  });

  test("rejecting records a code so the customer can be told why", async () => {
    const admin = await adminId();
    const { sessionId } = await sessionIn("MANUAL_REVIEW_REQUIRED");
    await decideRiderVerification(pool, admin, sessionId, {
      status: "REJECTED",
      reason: "Photo is of a different person than the licence holder",
    });

    const { rows } = await pool.query(
      `select state, rejection_code from rider_verification_sessions where id = $1`,
      [sessionId],
    );
    expect(rows[0]).toEqual({ state: "REJECTED", rejection_code: "REJECTED_ON_REVIEW" });
  });

  // The whole reason this does not reuse the merchant-side decide() helper,
  // which would have written a status column straight onto the table.
  test("an admin cannot approve a session whose document failed", async () => {
    const admin = await adminId();
    const { sessionId } = await sessionIn("DOCUMENT_FAILED");

    await expect(
      decideRiderVerification(pool, admin, sessionId, {
        status: "VERIFIED",
        reason: "Looks fine to me honestly",
      }),
    ).rejects.toBeInstanceOf(NotReviewableError);
  });

  test("nor one still waiting on the vendor", async () => {
    const admin = await adminId();
    const { sessionId } = await sessionIn("DOCUMENT_PENDING");

    await expect(
      decideRiderVerification(pool, admin, sessionId, {
        status: "VERIFIED",
        reason: "Customer is in a hurry and seems honest",
      }),
    ).rejects.toBeInstanceOf(NotReviewableError);
  });

  test("nor one that has already been decided", async () => {
    const admin = await adminId();
    const { sessionId } = await sessionIn("MANUAL_REVIEW_REQUIRED");
    const reason = "Verified by phone with the licence holder";
    await decideRiderVerification(pool, admin, sessionId, { status: "VERIFIED", reason });

    await expect(
      decideRiderVerification(pool, admin, sessionId, { status: "REJECTED", reason }),
    ).rejects.toBeInstanceOf(NotReviewableError);
  });

  test("an unknown session is not found", async () => {
    const admin = await adminId();
    await expect(
      decideRiderVerification(pool, admin, crypto.randomUUID(), {
        status: "VERIFIED",
        reason: "Some sufficiently long reason",
      }),
    ).rejects.toBeInstanceOf(VerificationTargetNotFoundError);
  });

  // Manual approval is the one path that overrides the automated evidence, so
  // it has to justify itself in the audit trail.
  test("a reason is mandatory and cannot be 'ok'", () => {
    expect(RiderReviewSchema.safeParse({ status: "VERIFIED" }).success).toBe(false);
    expect(RiderReviewSchema.safeParse({ status: "VERIFIED", reason: "ok" }).success).toBe(false);
    expect(
      RiderReviewSchema.safeParse({ status: "VERIFIED", reason: "Checked by video call" }).success,
    ).toBe(true);
  });
});
