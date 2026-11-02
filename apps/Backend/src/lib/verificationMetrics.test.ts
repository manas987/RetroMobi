import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import { createRider, createUser } from "../test/fixtures.ts";
import { verificationMetrics } from "./verificationMetrics.ts";

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

describe("verificationMetrics", () => {
  test("counts the states and reports a review rate", async () => {
    const before = await verificationMetrics(pool, 1);

    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { verified: false });
    for (const [state, review] of [
      ["VERIFIED", false],
      ["MANUAL_REVIEW_REQUIRED", true],
      ["DOCUMENT_FAILED", false],
    ] as const) {
      await pool.query(
        `insert into rider_verification_sessions
           (rider_id, user_id, method, provider, state, verification_id, policy_version,
            review_required, consent_text, consent_at, expires_at)
         values ($1, $2, 'DL_NUMBER', 'TEST', $3, $4, 'v1', $5, 'c', now(), now() + interval '1 day')`,
        [rider.id, user.id, state, `metrics-${crypto.randomUUID()}`, review],
      );
    }

    const after = await verificationMetrics(pool, 1);
    expect(after.started).toBe(before.started + 3);
    expect(after.verified).toBe(before.verified + 1);
    expect(after.awaitingReview).toBe(before.awaitingReview + 1);
    expect(after.documentFailed).toBe(before.documentFailed + 1);
    expect(after.reviewRate).toBeGreaterThan(0);
    expect(after.reviewRate).toBeLessThanOrEqual(100);
  });

  test("an empty window reports zero rather than dividing by it", async () => {
    // A review rate of NaN on a dashboard is how a number stops being read.
    const metrics = await verificationMetrics(pool, 0);
    expect(metrics.started).toBe(0);
    expect(metrics.reviewRate).toBe(0);
    expect(metrics.medianSecondsToDecision).toBeNull();
  });
});
