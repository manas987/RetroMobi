import type { PoolClient } from "pg";
import {
  checkEligibility,
  type EligibilityOutcome,
  type EligibilityReason,
} from "./licenceEligibility.ts";

/**
 * Loads everything `checkEligibility` needs and runs it.
 *
 * One function, two callers: the booking gate (bookingsService.createHold) and
 * the handover gate (pickup). They must agree, and a licence can expire between
 * the two, so re-running the same check at handover is the point rather than a
 * duplicate.
 */

/**
 * Every date in this system's rules is an IST calendar date -- a rental that
 * returns at 00:30 IST on the 14th is a 14th return, and a licence expiring on
 * the 13th does not cover it. Lifted out of bookingsService, which had this
 * inline.
 */
export function istDate(at: Date): string {
  return new Date(at.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function policyVersion(): string {
  return process.env.DL_VERIFICATION_POLICY_VERSION ?? "v1";
}

/**
 * No default on purpose: unset means no grace, so turning the eligibility
 * engine on without thinking about the riders already in the database refuses
 * them rather than quietly grandfathering everyone forever.
 */
export function legacyGraceUntil(): string | null {
  return process.env.LEGACY_LICENCE_GRACE_UNTIL?.trim() || null;
}

export interface GateResult {
  outcome: EligibilityOutcome;
  reasons: EligibilityReason[];
  flagForReview: boolean;
  /** The verification session behind the decision, for flagging it for review. */
  sessionId: string | null;
}

export async function evaluateRiderForVehicle(
  client: PoolClient,
  input: {
    userId: string;
    riderId: string;
    vehicleId: string;
    rentalStart: string;
    rentalEnd: string;
    today?: string;
  },
): Promise<GateResult> {
  // Dates come back as text, not as `date`: pg maps a date column to a JS Date
  // at *local* midnight, which is a day earlier than the stored value in IST.
  // That bug already shipped once, on riders.dob.
  const { rows } = await client.query(
    `select to_char(r.dob, 'YYYY-MM-DD') as dob,
            m.class as vehicle_class,
            dlv.id as verification_id,
            dlv.licence_status,
            to_char(dlv.valid_from, 'YYYY-MM-DD') as valid_from,
            to_char(dlv.expires_on, 'YYYY-MM-DD') as expires_on,
            dlv.session_id,
            s.policy_version,
            coalesce(
              (select json_agg(json_build_object(
                        'code', c.code,
                        'issueDate', to_char(c.issue_date, 'YYYY-MM-DD'),
                        'endorseDate', to_char(c.endorse_date, 'YYYY-MM-DD')))
                 from driving_licence_categories c
                where c.licence_verification_id = dlv.id),
              '[]'::json) as categories
       from riders r
       -- bookings has no model_id: the vehicle's class is two joins away.
       join vehicles v on v.id = $3
       join vehicle_models m on m.id = v.model_id
       left join driving_licence_verifications dlv
              on dlv.rider_id = r.id and dlv.status = 'VERIFIED'
       left join rider_verification_sessions s on s.id = dlv.session_id
      where r.id = $1 and r.user_id = $2 and r.deleted_at is null
      order by dlv.verified_at desc nulls last
      limit 1`,
    [input.riderId, input.userId, input.vehicleId],
  );

  // No rider of this account, or no verified licence on it at all.
  if (rows.length === 0 || !rows[0].verification_id) {
    return { outcome: "FAIL", reasons: ["NO_LICENCE"], flagForReview: false, sessionId: null };
  }
  const row = rows[0];

  const { rows: ruleRows } = await client.query(
    `select allowed_cov, min_age_years from vehicle_class_licence_rules
      where vehicle_class = $1 and policy_version = $2`,
    [row.vehicle_class, policyVersion()],
  );

  const result = checkEligibility({
    categories: row.categories,
    licenceStatus: row.licence_status,
    validFrom: row.valid_from,
    expiresOn: row.expires_on,
    dob: row.dob,
    rentalStart: input.rentalStart,
    rentalEnd: input.rentalEnd,
    today: input.today ?? istDate(new Date()),
    rule: ruleRows[0]
      ? { allowedCov: ruleRows[0].allowed_cov, minAgeYears: ruleRows[0].min_age_years }
      : null,
    policyVersion: row.policy_version,
    legacyGraceUntil: legacyGraceUntil(),
  });

  return { ...result, sessionId: row.session_id ?? null };
}

/**
 * Marks the session so it surfaces in the admin queue. Deliberately does not
 * change the state: a grandfathered legacy licence is still VERIFIED and the
 * customer is not stopped, somebody just needs to look at it.
 */
export async function flagSessionForReview(
  client: PoolClient,
  sessionId: string,
  reasons: EligibilityReason[],
): Promise<void> {
  await client.query(
    `update rider_verification_sessions
        set review_required = true, updated_at = now()
      where id = $1 and review_required = false`,
    [sessionId],
  );
  await client.query(
    `insert into rider_verification_events
       (session_id, actor_type, event_type, metadata)
     values ($1, 'SYSTEM', 'eligibility_flagged', $2)`,
    [sessionId, JSON.stringify({ reasons })],
  );
}
