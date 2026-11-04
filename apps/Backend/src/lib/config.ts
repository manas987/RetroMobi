// Fail fast on config whose ABSENCE PRODUCES SILENTLY WRONG MONEY OR DOCUMENTS.
//
// Vendor credentials are deliberately not checked here: smsSender, cashfree, kyc,
// tracker and storage each throw a clear error at the point of use, so a missing
// Twilio token is a loud 502 and you can still run search locally without one.
// These six are different -- every one of them has a fallback that looks like it
// worked. `GST_RATE ?? 18` prices a booking at a rate nobody chose, and
// `PLATFORM_GSTIN ?? null` issues a GST invoice with no GSTIN on it, which is how
// that one shipped. A boot failure is cheaper than either.
//
// Twilio and Cashfree Secure ID are the exceptions, and only in production.
//
// Twilio: a missing SMS credential doesn't throw loudly at point of use --
// smsSender.ts's dev-fallback logs
// "[dev-fallback]" and returns successfully, because that's what lets `bun test`
// and local dev run with no vendor creds at all. The same silent success in
// production means phone OTP -- the only way into the app -- never sends, and
// nobody finds out until a real signup fails. So it's required, but only when
// NODE_ENV=production, so dev/test are unaffected.
//
// Cashfree PG: the payments half of the same credential pair. createOrder and
// getOrder used to fake a paid order when it was missing, and
// verifyWebhookSignature returned true for EVERY request -- so any non-production
// deploy with a public URL confirmed a booking for whoever POSTed a JSON body.
// The signature check now fails closed unconditionally, the fakes are behind
// PAYMENTS_DEV_AUTO_SUCCEED (refused in production below), and
// PUBLIC_APP_BASE_URL is required because without it a paying customer never
// gets back to the app.
//
// Cashfree Secure ID: the same shape, found later and worse. kyc.ts's
// dev-fallback returned a faked `VERIFIED` driving licence, so an unset
// CASHFREE_CLIENT_ID in production approved every rider without a single check
// and a scooter went out to whoever asked. kyc.ts no longer fakes a pass
// unless KYC_DEV_AUTO_VERIFY is explicitly on -- which is itself refused in
// production below -- and the credentials are required here, because in
// production a licence nobody can verify is a dead feature either way.

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
];

// Required only outside dev/test -- see the note at the top of the file.
const REQUIRED_IN_PRODUCTION: Requirement[] = [
  { key: "TWILIO_ACCOUNT_SID", why: "phone OTP silently never sends without it -- the dev-fallback logs and returns success" },
  { key: "TWILIO_AUTH_TOKEN", why: "phone OTP silently never sends without it -- the dev-fallback logs and returns success" },
  { key: "TWILIO_FROM_NUMBER", why: "phone OTP silently never sends without it -- the dev-fallback logs and returns success" },
  // Same failure shape as Twilio above, with a worse consequence: without
  // these, providers/kyc.ts used to return a faked VERIFIED, so every driving
  // licence was approved without being checked and a scooter went out to
  // whoever asked. It now reports SANDBOX_UNAVAILABLE instead, but in
  // production an unverifiable licence is a dead feature, so refuse to boot.
  { key: "CASHFREE_CLIENT_ID", why: "no driving licence can be verified at all without it" },
  { key: "CASHFREE_CLIENT_SECRET", why: "no driving licence can be verified at all without it" },
  // An unpeppered sha256 of a driving licence number is reversible: the format
  // carries very little entropy, so a lookup table of every plausible Indian
  // DL number is a weekend's work. The hash is all we keep of the number
  // (lib/verificationHash.ts), so if it is guessable we have stored the number.
  { key: "DL_HASH_PEPPER", why: "without it the stored licence hashes are reversible by anyone" },
  // Cashfree's return_url and notify_url are built from this. Without it the
  // customer pays and is then left on Cashfree's page with no way back, and no
  // webhook is registered on the order -- so the booking is confirmed only by
  // the reconcile sweep, minutes later, with the customer already gone.
  {
    key: "PUBLIC_APP_BASE_URL",
    why: "a paying customer is never returned to the app and no webhook is registered on the order",
    validate: (v) => (v.startsWith("https://") ? null : "must be an https:// origin in production"),
  },
];

// Set in production = a silently wrong decision, so these are refused outright.
// There is no legitimate production value, which is why they are not in
// REQUIRED_IN_PRODUCTION with a validator -- absence is the only correct state.
const FORBIDDEN_IN_PRODUCTION: Requirement[] = [
  {
    key: "KYC_DEV_AUTO_VERIFY",
    why: "it fakes a VERIFIED driving licence with no check -- a local-only escape hatch",
    // "false" and "" are the off state and perfectly fine to leave in a .env.
    validate: (v) => (v === "true" ? "must not be true in production" : null),
  },
  {
    key: "PAYMENTS_DEV_AUTO_SUCCEED",
    why: "it fakes a paid Cashfree order, so a booking confirms with no money -- a local-only escape hatch",
    validate: (v) => (v === "true" ? "must not be true in production" : null),
  },
];

// Not required: RetroMobi may not be GST-registered yet, and a half-configured
// tax identity must not stop anyone running the app. But if it IS set it has to be
// real, because the only thing worse than no GSTIN on an invoice is a wrong one --
// so a placeholder like CHANGEME is rejected rather than quietly printed.
const OPTIONAL_BUT_VALIDATED: Requirement[] = [
  {
    key: "PLATFORM_GSTIN",
    why: "without it no PLATFORM tax invoice is issued at all (payments and payouts are unaffected)",
    validate: (v) =>
      GSTIN_PATTERN.test(v) ? null : "must be a valid 15-character GSTIN, e.g. 05ABCDE1234F1Z5",
  },
];

/**
 * Throws with every problem at once, so you fix the .env in one pass, not six.
 * Returns warnings for config that is legitimately absent but changes behaviour.
 */
export function assertConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const warnings: string[] = [];

  const required = env.NODE_ENV === "production" ? [...REQUIRED, ...REQUIRED_IN_PRODUCTION] : REQUIRED;

  for (const { key, why, validate } of required) {
    const value = env[key]?.trim();
    if (!value) {
      problems.push(`  ${key} is not set — ${why}`);
      continue;
    }
    const invalid = validate?.(value);
    if (invalid) problems.push(`  ${key} ${invalid} — ${why}`);
  }

  if (env.NODE_ENV === "production") {
    for (const { key, why, validate } of FORBIDDEN_IN_PRODUCTION) {
      const value = env[key]?.trim();
      if (!value) continue;
      const invalid = validate?.(value);
      if (invalid) problems.push(`  ${key} ${invalid} — ${why}`);
    }
  }

  for (const { key, why, validate } of OPTIONAL_BUT_VALIDATED) {
    const value = env[key]?.trim();
    if (!value) {
      warnings.push(`${key} is not set — ${why}`);
      continue;
    }
    // Set but wrong is a hard failure: it would be printed on a legal document.
    const invalid = validate?.(value);
    if (invalid) problems.push(`  ${key} ${invalid} — ${why}`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: ${problems.length} configuration problem(s) in .env\n${problems.join("\n")}\n`,
    );
  }

  return warnings;
}
