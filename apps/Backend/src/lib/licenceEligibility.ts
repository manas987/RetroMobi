/**
 * Is this rider legally entitled to ride THIS vehicle for THIS window?
 *
 * Pure: no DB, no clock, no config reads -- every input is passed in, so every
 * rule below is a one-line test. The caller (bookingsService, and the pickup
 * gate) supplies the rule row and today's date.
 *
 * `driving_licence_categories` has been written since 0006 and read by nothing,
 * which meant a rider verified on a geared-motorcycle licence could book a car.
 * This is the thing that finally reads it.
 *
 * Three outcomes, not two. "Fail" and "we cannot tell" are different facts: an
 * RTO that does not return a licence status is not evidence of fraud, and
 * silently passing it is exactly what must not happen. REVIEW means a human
 * decides.
 *
 * `flagForReview` is separate from the outcome, for the one case that must pass
 * AND be looked at: a licence grandfathered in by the legacy grace window. If
 * that were a REVIEW it would block the booking, which is the exact outcome the
 * grace window exists to prevent.
 */
export type EligibilityOutcome = "PASS" | "FAIL" | "REVIEW";

export type EligibilityReason =
  | "NO_LICENCE"
  | "NO_RULE"
  | "NO_CATEGORY_DATA"
  | "LEGACY_NO_CATEGORY_DATA"
  | "CATEGORY_UNRECOGNISED"
  | "CATEGORY_NOT_ALLOWED"
  | "LEARNER_LICENCE"
  | "LICENCE_EXPIRED"
  | "EXPIRES_DURING_RENTAL"
  | "NOT_YET_VALID"
  | "STATUS_NOT_ACTIVE"
  | "STATUS_UNKNOWN"
  | "DOB_UNKNOWN"
  | "UNDER_MIN_AGE"
  | "ENDORSEMENT_NOT_EFFECTIVE";

export interface LicenceCategory {
  code: string;
  issueDate?: string | null;
  endorseDate?: string | null;
}

export interface EligibilityRule {
  allowedCov: string[];
  minAgeYears: number;
}

export interface EligibilityInput {
  /** Rows from driving_licence_categories for the chosen verification. */
  categories: LicenceCategory[];
  /** The RTO's own status string, e.g. "Active". Null when the vendor did not say. */
  licenceStatus?: string | null;
  validFrom?: string | null;
  expiresOn?: string | null;
  dob?: string | null;
  /** IST dates, YYYY-MM-DD. */
  rentalStart: string;
  rentalEnd: string;
  today: string;
  /** Null when no rule exists for the vehicle's class -- that is NO_RULE, a fail. */
  rule: EligibilityRule | null;
  /** 'legacy' marks a verification backfilled from before categories were captured. */
  policyVersion?: string | null;
  /** Date (YYYY-MM-DD) until which a legacy licence with no categories may still book. */
  legacyGraceUntil?: string | null;
}

/**
 * Vahan and the vendors do not agree on how to spell a class of vehicle --
 * "MCWG", "M/CYCLE.WG" and "MC WITH GEAR" are the same entitlement. Codes are
 * stripped to alphanumerics, upper-cased, then mapped through this table.
 *
 * It is deliberately incomplete. An unrecognised code is NOT quietly allowed
 * and NOT quietly refused: it produces CATEGORY_UNRECOGNISED and a REVIEW, so
 * a genuine rider with an odd RTO spelling reaches a human and the alias is
 * added here rather than guessed at in a hurry.
 */
const COV_ALIASES: Record<string, string> = {
  MCWOG: "MCWOG",
  MCYCLEWOG: "MCWOG",
  MCWITHOUTGEAR: "MCWOG",
  MWOG: "MCWOG",
  MC50CC: "MC50CC",
  MCEX50CC: "MCWG",
  MCWG: "MCWG",
  MCYCLEWG: "MCWG",
  MCWITHGEAR: "MCWG",
  MWG: "MCWG",
  LMV: "LMV",
  LMVNT: "LMV",
  LMVCAR: "LMV",
  LMVTR: "LMV_TR",
  TRANS: "TRANS",
  TRLR: "TRLR",
  HMV: "HMV",
  HGMV: "HGMV",
  HPMV: "HPMV",
};

function canonicalise(code: string): string | null {
  const key = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return COV_ALIASES[key] ?? null;
}

/**
 * A learner's licence is refused outright -- not reviewed. It is a hard rule
 * from the market research (00-market.md: licensed Uttarakhand and Goa
 * operators refuse them) and from insurance, not a judgment call.
 */
function isLearner(code: string): boolean {
  const key = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return key.includes("LRN") || key.includes("LEARNER");
}

/** Whole years completed by `on`. String dates, so no timezone can shift it. */
function ageOn(dob: string, on: string): number {
  const [by, bm, bd] = dob.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = on.split("-").map(Number) as [number, number, number];
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

export function checkEligibility(input: EligibilityInput): {
  outcome: EligibilityOutcome;
  reasons: EligibilityReason[];
  flagForReview: boolean;
} {
  const fail: EligibilityReason[] = [];
  const review: EligibilityReason[] = [];
  // Passes, but somebody should look: recorded on the session rather than
  // standing between the customer and the booking.
  const grace: EligibilityReason[] = [];

  // Verifications backfilled by migration 0015 predate category capture, the
  // RTO status column and (sometimes) a date of birth. Judging them by today's
  // rules would make every already-verified rider unbookable overnight, so
  // within a dated window their missing data is grandfathered and flagged
  // instead of blocking. Only these three absences, only for legacy rows, and
  // only until the date -- an expired or suspended legacy licence still fails.
  const inLegacyGrace =
    input.policyVersion === "legacy" &&
    !!input.legacyGraceUntil &&
    input.today <= input.legacyGraceUntil;
  const missing = (reason: EligibilityReason, otherwise: EligibilityReason[]) =>
    (inLegacyGrace ? grace : otherwise).push(reason);

  if (!input.rule) return { outcome: "FAIL", reasons: ["NO_RULE"], flagForReview: false };

  // --- the licence itself -------------------------------------------------
  if (!input.expiresOn) {
    // No expiry means no usable licence record, whatever the status column says.
    return { outcome: "FAIL", reasons: ["NO_LICENCE"], flagForReview: false };
  }
  if (input.expiresOn < input.today) fail.push("LICENCE_EXPIRED");
  // Licensed for the whole rental, not just at pickup -- the rule that already
  // existed inline in bookingsService and the reason this helper takes a window.
  else if (input.expiresOn < input.rentalEnd) fail.push("EXPIRES_DURING_RENTAL");
  if (input.validFrom && input.validFrom > input.rentalStart) fail.push("NOT_YET_VALID");

  // --- status: absent is not the same as bad ------------------------------
  const status = input.licenceStatus?.trim().toUpperCase();
  if (!status) missing("STATUS_UNKNOWN", review);
  else if (!/^(ACTIVE|VALID)$/.test(status)) fail.push("STATUS_NOT_ACTIVE");

  // --- age ----------------------------------------------------------------
  if (!input.dob) missing("DOB_UNKNOWN", review);
  else if (ageOn(input.dob, input.rentalStart) < input.rule.minAgeYears) fail.push("UNDER_MIN_AGE");

  // --- entitlement --------------------------------------------------------
  if (input.categories.some((c) => isLearner(c.code))) {
    fail.push("LEARNER_LICENCE");
  } else if (input.categories.length === 0) {
    if (inLegacyGrace) grace.push("LEGACY_NO_CATEGORY_DATA");
    else fail.push("NO_CATEGORY_DATA");
  } else {
    const allowed = new Set(input.rule.allowedCov.map((c) => canonicalise(c) ?? c.toUpperCase()));
    let matched = false;
    let unrecognised = false;
    for (const category of input.categories) {
      const code = canonicalise(category.code);
      if (!code) {
        unrecognised = true;
        continue;
      }
      if (!allowed.has(code)) continue;
      // On the licence but not yet effective. The endorsement date is when the
      // entitlement starts, which can be later than the licence's own issue.
      if (category.endorseDate && category.endorseDate > input.rentalStart) {
        fail.push("ENDORSEMENT_NOT_EFFECTIVE");
        continue;
      }
      matched = true;
    }
    if (!matched) {
      if (unrecognised) review.push("CATEGORY_UNRECOGNISED");
      else if (!fail.includes("ENDORSEMENT_NOT_EFFECTIVE")) fail.push("CATEGORY_NOT_ALLOWED");
    }
  }

  // A fail anywhere beats a review: there is nothing for a human to decide
  // about a licence that expired.
  if (fail.length > 0) return { outcome: "FAIL", reasons: fail, flagForReview: false };
  if (review.length > 0) return { outcome: "REVIEW", reasons: review, flagForReview: true };
  return { outcome: "PASS", reasons: grace, flagForReview: grace.length > 0 };
}
