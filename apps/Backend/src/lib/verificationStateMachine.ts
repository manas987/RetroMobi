import type { PoolClient } from "pg";
import { redact } from "./maskSecrets.ts";

/**
 * The only place a verification session changes state.
 *
 * It exists because `PENDING | VERIFIED | REJECTED` could not express
 * "document is fine, identity is unestablished" -- the single most common real
 * outcome -- and because, with automated face matching dropped, the states are
 * the whole of what stops a licence being approved on insufficient evidence.
 *
 * Takes a `PoolClient`, like `lib/audit.ts:writeAudit`, so the transition and
 * the event row join the caller's transaction and cannot half-apply.
 */
export type VerificationState =
  | "CONSENT_PENDING"
  | "DOCUMENT_PENDING"
  | "DOCUMENT_VERIFIED"
  | "DOCUMENT_FAILED"
  | "PHOTO_PENDING"
  | "MANUAL_REVIEW_REQUIRED"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED";

export class IllegalTransitionError extends Error {}
export class SessionNotFoundError extends Error {}

/**
 * Read this as the list of things that are allowed to happen, and note what is
 * absent. Nothing reaches `VERIFIED` except from `DOCUMENT_VERIFIED`,
 * `PHOTO_PENDING` or `MANUAL_REVIEW_REQUIRED` -- so a vendor's HTTP 200
 * (`DOCUMENT_PENDING`), a DigiLocker authentication (`CONSENT_PENDING`) or a
 * failed document check (`DOCUMENT_FAILED`) cannot approve a rider no matter
 * what the calling code asks for.
 *
 * `DOCUMENT_FAILED`, `REJECTED` and `EXPIRED` are terminal: a retry starts a
 * NEW session rather than reviving a decided one, which keeps the event trail
 * of the failed attempt intact.
 */
export const TRANSITIONS: Record<VerificationState, VerificationState[]> = {
  CONSENT_PENDING: ["DOCUMENT_PENDING", "REJECTED", "EXPIRED", "MANUAL_REVIEW_REQUIRED"],
  // REJECTED is reachable from here because a customer may cancel mid-flow --
  // without it, a DL-number session could only ever be abandoned, never
  // closed. Found by the cancel test, not by reading the table.
  DOCUMENT_PENDING: [
    "DOCUMENT_VERIFIED",
    "DOCUMENT_FAILED",
    "MANUAL_REVIEW_REQUIRED",
    "REJECTED",
    "EXPIRED",
  ],
  DOCUMENT_VERIFIED: ["PHOTO_PENDING", "VERIFIED", "MANUAL_REVIEW_REQUIRED", "REJECTED"],
  DOCUMENT_FAILED: [],
  PHOTO_PENDING: ["VERIFIED", "MANUAL_REVIEW_REQUIRED", "EXPIRED"],
  MANUAL_REVIEW_REQUIRED: ["VERIFIED", "REJECTED"],
  VERIFIED: ["EXPIRED", "REVOKED"],
  REJECTED: [],
  EXPIRED: [],
  REVOKED: [],
};

export function canTransition(from: VerificationState, to: VerificationState): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface TransitionInput {
  sessionId: string;
  to: VerificationState;
  actorType: "CUSTOMER" | "MERCHANT" | "ADMIN" | "PROVIDER" | "SYSTEM";
  actorId?: string | null;
  eventType: string;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  /** Set alongside the state, since the two are decided together. */
  assuranceLevel?: "HIGH" | "MEDIUM" | "LOW";
  reviewRequired?: boolean;
  rejectionCode?: string | null;
}

export async function transition(
  client: PoolClient,
  input: TransitionInput,
): Promise<{ previousState: VerificationState; state: VerificationState }> {
  // `for update` and not a plain select: two vendor callbacks arriving at once
  // would otherwise both read the same prior state and both apply, which is
  // how a duplicate DigiLocker redirect double-inserts.
  const { rows } = await client.query(
    `select state from rider_verification_sessions where id = $1 for update`,
    [input.sessionId],
  );
  if (rows.length === 0) {
    throw new SessionNotFoundError(`verification session ${input.sessionId} not found`);
  }
  const from = rows[0].state as VerificationState;

  if (!canTransition(from, input.to)) {
    throw new IllegalTransitionError(`cannot move a verification from ${from} to ${input.to}`);
  }

  await client.query(
    `update rider_verification_sessions
        set state = $1,
            assurance_level = coalesce($2, assurance_level),
            review_required = coalesce($3, review_required),
            rejection_code = coalesce($4, rejection_code),
            updated_at = now()
      where id = $5`,
    [
      input.to,
      input.assuranceLevel ?? null,
      input.reviewRequired ?? null,
      input.rejectionCode ?? null,
      input.sessionId,
    ],
  );

  await client.query(
    `insert into rider_verification_events
       (session_id, actor_type, actor_id, event_type, previous_state, next_state,
        correlation_id, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.sessionId,
      input.actorType,
      input.actorId ?? null,
      input.eventType,
      from,
      input.to,
      input.correlationId ?? null,
      // Never the raw object: vendor payloads carry licence numbers, dates of
      // birth and photo URLs, and this row is read by admins.
      JSON.stringify(redact(input.metadata ?? {})),
    ],
  );

  return { previousState: from, state: input.to };
}

/**
 * For a vendor result that arrives twice. Returns false when the session has
 * already moved past the state this result would have set, so a handler can
 * no-op instead of raising -- an out-of-order webhook is not an error.
 */
export function isAlreadyApplied(current: VerificationState, to: VerificationState): boolean {
  return current === to || !canTransition(current, to);
}
