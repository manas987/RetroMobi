import type { Pool } from "pg";

/**
 * The verification numbers worth watching, as one query.
 *
 * Deliberately not a metrics dependency. There is no Prometheus, StatsD or
 * OpenTelemetry in this repo, and adding one to count seven things nobody is
 * yet alerting on would be the expensive kind of thorough. These come out of
 * the tables that already record every transition, and they are read by the
 * admin overview.
 *
 * ponytail: a single aggregate over the whole window. If the sessions table
 * ever gets big enough for that to hurt, add an index on (created_at) or
 * materialise it -- it is one query to change.
 */
export interface VerificationMetrics {
  windowDays: number;
  started: number;
  verified: number;
  rejected: number;
  documentFailed: number;
  awaitingReview: number;
  awaitingPhoto: number;
  /** How many needed a human. The number that decides whether this is working. */
  reviewRate: number;
  /** Sessions the vendor could not answer for -- an outage signal, not a fraud one. */
  providerUnavailable: number;
  /** The same licence seen on more than one account. */
  duplicateLicences: number;
  /** Handovers refused because the person or the card did not match. */
  pickupMismatches: number;
  /** Median seconds from consent to a final state, for the ones that finished. */
  medianSecondsToDecision: number | null;
}

export async function verificationMetrics(pool: Pool, windowDays = 30): Promise<VerificationMetrics> {
  const { rows } = await pool.query(
    `with window_sessions as (
       select * from rider_verification_sessions
        where created_at > now() - make_interval(days => $1::int)
     )
     select
       (select count(*)::int from window_sessions) as started,
       (select count(*)::int from window_sessions where state = 'VERIFIED') as verified,
       (select count(*)::int from window_sessions where state = 'REJECTED') as rejected,
       (select count(*)::int from window_sessions where state = 'DOCUMENT_FAILED') as document_failed,
       (select count(*)::int from window_sessions where state = 'MANUAL_REVIEW_REQUIRED') as awaiting_review,
       (select count(*)::int from window_sessions where state = 'PHOTO_PENDING') as awaiting_photo,
       (select count(*)::int from window_sessions where review_required) as needed_review,
       (select count(*)::int from window_sessions where rejection_code = 'PROVIDER_UNAVAILABLE')
         as provider_unavailable,
       (select count(*)::int from rider_verification_events e
          join window_sessions s on s.id = e.session_id
         where e.metadata->>'duplicateLicence' = 'true') as duplicate_licences,
       (select count(*)::int from audit_logs a
         where a.created_at > now() - make_interval(days => $1::int)
           and a.action in ('booking.identity_check_failed',
                            'booking.identity_check_licence_mismatch')) as pickup_mismatches,
       (select percentile_cont(0.5) within group (
                 order by extract(epoch from (s.updated_at - s.created_at)))
          from window_sessions s
         where s.state in ('VERIFIED', 'REJECTED', 'DOCUMENT_FAILED')) as median_seconds`,
    [Math.max(0, Math.round(windowDays))],
  );
  const r = rows[0];
  return {
    windowDays,
    started: r.started,
    verified: r.verified,
    rejected: r.rejected,
    documentFailed: r.document_failed,
    awaitingReview: r.awaiting_review,
    awaitingPhoto: r.awaiting_photo,
    // Rounded to a whole percent: this is a dashboard number, not a budget.
    reviewRate: r.started > 0 ? Math.round((r.needed_review / r.started) * 100) : 0,
    providerUnavailable: r.provider_unavailable,
    duplicateLicences: r.duplicate_licences,
    pickupMismatches: r.pickup_mismatches,
    medianSecondsToDecision: r.median_seconds === null ? null : Math.round(Number(r.median_seconds)),
  };
}
