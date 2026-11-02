// One case per reason code, plus the cases where two rules disagree. This is a
// legal mapping expressed as code, so the tests are the specification of it.
import { describe, expect, test } from "bun:test";
import { checkEligibility, type EligibilityInput } from "./licenceEligibility.ts";

const SCOOTER = { allowedCov: ["MCWOG", "MCWG", "MC50CC"], minAgeYears: 18 };
const MOTORCYCLE = { allowedCov: ["MCWG"], minAgeYears: 18 };

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    categories: [{ code: "MCWG", issueDate: "2015-01-01", endorseDate: "2015-01-01" }],
    licenceStatus: "Active",
    validFrom: "2015-01-01",
    expiresOn: "2035-01-01",
    dob: "1995-06-15",
    rentalStart: "2026-11-10",
    rentalEnd: "2026-11-14",
    today: "2026-11-02",
    rule: SCOOTER,
    ...overrides,
  };
}

describe("the happy path", () => {
  test("a geared-motorcycle licence may take a scooter", () => {
    expect(checkEligibility(input())).toEqual({ outcome: "PASS", reasons: [], flagForReview: false });
  });

  test("a gearless-only licence may take a scooter", () => {
    expect(checkEligibility(input({ categories: [{ code: "MCWOG" }] })).outcome).toBe("PASS");
  });

  test("Vahan's alternative spellings are the same entitlement", () => {
    for (const code of ["M/CYCLE.WG", "MC WITH GEAR", "mcwg"]) {
      expect(checkEligibility(input({ categories: [{ code }] })).outcome).toBe("PASS");
    }
  });
});

describe("entitlement", () => {
  // The whole point of reading driving_licence_categories at last.
  test("a gearless-only licence may NOT take a geared motorcycle", () => {
    expect(checkEligibility(input({ categories: [{ code: "MCWOG" }], rule: MOTORCYCLE }))).toEqual({
      outcome: "FAIL",
      reasons: ["CATEGORY_NOT_ALLOWED"],
      flagForReview: false,
    });
  });

  test("a car licence entitles nobody to a two-wheeler", () => {
    expect(checkEligibility(input({ categories: [{ code: "LMV" }] })).reasons).toEqual([
      "CATEGORY_NOT_ALLOWED",
    ]);
  });

  test("one allowed category among several is enough", () => {
    expect(
      checkEligibility(input({ categories: [{ code: "LMV" }, { code: "MCWG" }] })).outcome,
    ).toBe("PASS");
  });

  test("a learner's licence is refused outright, never reviewed", () => {
    expect(checkEligibility(input({ categories: [{ code: "MCWG-LRN" }] }))).toEqual({
      outcome: "FAIL",
      reasons: ["LEARNER_LICENCE"],
      flagForReview: false,
    });
  });

  test("an entitlement endorsed after the rental starts is not yet effective", () => {
    expect(
      checkEligibility(input({ categories: [{ code: "MCWG", endorseDate: "2026-12-01" }] })),
    ).toEqual({ outcome: "FAIL", reasons: ["ENDORSEMENT_NOT_EFFECTIVE"], flagForReview: false });
  });

  test("an unrecognised code goes to a human, not to a refusal", () => {
    expect(checkEligibility(input({ categories: [{ code: "WHAT-IS-THIS" }] }))).toEqual({
      outcome: "REVIEW",
      reasons: ["CATEGORY_UNRECOGNISED"],
      flagForReview: true,
    });
  });

  test("no category data at all fails closed", () => {
    expect(checkEligibility(input({ categories: [] }))).toEqual({
      outcome: "FAIL",
      reasons: ["NO_CATEGORY_DATA"],
      flagForReview: false,
    });
  });
});

describe("validity window", () => {
  test("an expired licence fails", () => {
    expect(checkEligibility(input({ expiresOn: "2026-01-01" })).reasons).toEqual([
      "LICENCE_EXPIRED",
    ]);
  });

  // The rule that already existed inline in bookingsService: licensed for the
  // whole rental, not just at pickup.
  test("a licence expiring mid-rental fails even though it is valid today", () => {
    expect(checkEligibility(input({ expiresOn: "2026-11-12" }))).toEqual({
      outcome: "FAIL",
      reasons: ["EXPIRES_DURING_RENTAL"],
      flagForReview: false,
    });
  });

  test("a licence expiring exactly on the return date is fine", () => {
    expect(checkEligibility(input({ expiresOn: "2026-11-14" })).outcome).toBe("PASS");
  });

  test("a licence that starts after the rental does is not yet valid", () => {
    expect(checkEligibility(input({ validFrom: "2026-12-01" })).reasons).toEqual(["NOT_YET_VALID"]);
  });

  test("no expiry at all is no usable licence", () => {
    expect(checkEligibility(input({ expiresOn: null }))).toEqual({
      outcome: "FAIL",
      reasons: ["NO_LICENCE"],
      flagForReview: false,
    });
  });
});

describe("status", () => {
  test("suspended or cancelled fails", () => {
    for (const status of ["Suspended", "CANCELLED", "Disqualified"]) {
      expect(checkEligibility(input({ licenceStatus: status })).reasons).toEqual([
        "STATUS_NOT_ACTIVE",
      ]);
    }
  });

  // Government data being unavailable is not evidence of fraud.
  test("a missing status goes to review, not to a refusal", () => {
    expect(checkEligibility(input({ licenceStatus: null }))).toEqual({
      outcome: "REVIEW",
      reasons: ["STATUS_UNKNOWN"],
      flagForReview: true,
    });
  });
});

describe("age", () => {
  test("under the minimum fails", () => {
    expect(checkEligibility(input({ dob: "2010-01-01" })).reasons).toEqual(["UNDER_MIN_AGE"]);
  });

  test("the eighteenth birthday on the pickup date counts", () => {
    expect(checkEligibility(input({ dob: "2008-11-10", rentalStart: "2026-11-10" })).outcome).toBe(
      "PASS",
    );
  });

  test("one day short of the birthday does not", () => {
    expect(
      checkEligibility(input({ dob: "2008-11-11", rentalStart: "2026-11-10" })).reasons,
    ).toEqual(["UNDER_MIN_AGE"]);
  });

  test("a missing date of birth goes to review", () => {
    expect(checkEligibility(input({ dob: null }))).toEqual({
      outcome: "REVIEW",
      reasons: ["DOB_UNKNOWN"],
      flagForReview: true,
    });
  });
});

describe("the rule itself", () => {
  test("a vehicle class nobody has mapped fails closed", () => {
    expect(checkEligibility(input({ rule: null }))).toEqual({
      outcome: "FAIL",
      reasons: ["NO_RULE"],
      flagForReview: false,
    });
  });
});

describe("the legacy grace window", () => {
  const legacy = { categories: [], policyVersion: "legacy", legacyGraceUntil: "2026-12-31" };

  // It must PASS, not REVIEW: a review blocks the booking, which is the exact
  // outcome the grace window exists to prevent for riders verified before
  // categories were captured. It is flagged instead.
  test("inside the window a legacy licence with no categories passes, flagged", () => {
    expect(checkEligibility(input({ ...legacy, today: "2026-11-02" }))).toEqual({
      outcome: "PASS",
      reasons: ["LEGACY_NO_CATEGORY_DATA"],
      flagForReview: true,
    });
  });

  test("on the last day it still does", () => {
    expect(checkEligibility(input({ ...legacy, today: "2026-12-31" })).outcome).toBe("PASS");
  });

  test("after the window it fails like anything else", () => {
    expect(checkEligibility(input({ ...legacy, today: "2027-01-01" }))).toEqual({
      outcome: "FAIL",
      reasons: ["NO_CATEGORY_DATA"],
      flagForReview: false,
    });
  });

  test("with no window configured there is no grace at all", () => {
    expect(
      checkEligibility(input({ categories: [], policyVersion: "legacy", legacyGraceUntil: null }))
        .outcome,
    ).toBe("FAIL");
  });

  // The grace exists for rows backfilled by migration 0015, not for anything new.
  test("a current-policy verification gets no grace", () => {
    expect(
      checkEligibility(input({ categories: [], policyVersion: "v1", legacyGraceUntil: "2026-12-31" }))
        .reasons,
    ).toEqual(["NO_CATEGORY_DATA"]);
  });
});

describe("when several rules disagree", () => {
  test("a hard failure beats a review -- there is nothing to decide", () => {
    expect(
      checkEligibility(input({ licenceStatus: null, expiresOn: "2026-01-01" })),
    ).toEqual({ outcome: "FAIL", reasons: ["LICENCE_EXPIRED"], flagForReview: false });
  });

  test("every applicable failure is reported, not just the first", () => {
    const result = checkEligibility(
      input({ expiresOn: "2026-01-01", dob: "2010-01-01", categories: [{ code: "LMV" }] }),
    );
    expect(result.outcome).toBe("FAIL");
    expect(result.reasons).toEqual(["LICENCE_EXPIRED", "UNDER_MIN_AGE", "CATEGORY_NOT_ALLOWED"]);
  });
});
