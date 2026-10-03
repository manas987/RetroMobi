// Fail fast on config whose ABSENCE PRODUCES SILENTLY WRONG MONEY OR DOCUMENTS.
//
// Vendor credentials are deliberately not checked here: smsSender, cashfree, kyc,
// tracker and storage each throw a clear error at the point of use, so a missing
// Twilio token is a loud 502 and you can still run search locally without one.
// These six are different -- every one of them has a fallback that looks like it
// worked. `GST_RATE ?? 18` prices a booking at a rate nobody chose, and
// `PLATFORM_GSTIN ?? null` issues a GST invoice with no GSTIN on it, which is how
// that one shipped. A boot failure is cheaper than either.

interface Requirement {
  key: string;
  why: string;
  validate?: (value: string) => string | null;
}

// 2 digits state code, 10 char PAN, 1 entity digit, 1 letter, 1 check char.
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const REQUIRED: Requirement[] = [
  { key: "DATABASE_URL", why: "nothing works without it" },
  { key: "AUTH_ACCESS_TOKEN_SECRET", why: "tokens cannot be signed" },
  {
    key: "GST_RATE",
    why: "a missing rate silently prices every booking at 18%",
    validate: (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? null : "must be a number"),
  },
  {
    key: "PLATFORM_FEE_PCT",
    why: "a missing percentage silently charges every customer 10%",
    validate: (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? null : "must be a number"),
  },
  {
    key: "PAYOUT_UPFRONT_PCT",
    why: "a missing percentage silently pays merchants 10% up front",
    validate: (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? null : "must be a number"),
  },
  {
    key: "PLATFORM_GSTIN",
    why: "every PLATFORM invoice is a GST document and cannot be issued without it",
    validate: (v) =>
      GSTIN_PATTERN.test(v) ? null : "must be a valid 15-character GSTIN, e.g. 05ABCDE1234F1Z5",
  },
];

/** Throws with every problem at once, so you fix the .env in one pass, not six. */
export function assertConfig(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = [];

  for (const { key, why, validate } of REQUIRED) {
    const value = env[key]?.trim();
    if (!value) {
      problems.push(`  ${key} is not set — ${why}`);
      continue;
    }
    const invalid = validate?.(value);
    if (invalid) problems.push(`  ${key} ${invalid} — ${why}`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: ${problems.length} configuration problem(s) in .env\n${problems.join("\n")}\n`,
    );
  }
}
