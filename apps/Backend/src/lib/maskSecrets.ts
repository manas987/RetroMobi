/**
 * Masking for driving licence numbers, and a redactor for anything written to
 * an audit trail.
 *
 * `driving_licence_verifications.licence_number` holds the mask, not the
 * number -- the full value is never persisted (docs/dl-verification.md). So
 * `maskDl` is not a display convenience, it is the storage format.
 */

/**
 * First four and last four kept, the middle starred. An Indian DL's leading
 * characters are the state and RTO code -- public information, printed on the
 * card, and useful to staff reading one -- while the last four are what makes
 * a number recognisable to its holder.
 *
 * Short inputs are masked harder rather than leaking proportionally more: at
 * nine characters or fewer, only the last four survive, and under five nothing
 * does. A bad input must not round-trip to itself.
 */
export function maskDl(licenceNumber: string): string {
  const value = licenceNumber.trim();
  if (value.length < 5) return "*".repeat(Math.max(value.length, 1));
  if (value.length <= 9) return "*".repeat(value.length - 4) + value.slice(-4);
  return value.slice(0, 4) + "*".repeat(value.length - 8) + value.slice(-4);
}

/** Last four only, for the digits a staff member reads off a physical card. */
export function dlLast4(licenceNumber: string): string {
  return licenceNumber.trim().slice(-4);
}

// Keys whose values must never reach an event row, a log line or an API
// response. Matched case-insensitively on the key name, so `dl_number`,
// `dlNumber` and `DL_NUMBER` are all caught. A denylist is the wrong default
// in general, but the alternative here -- a whitelist -- means every new
// vendor field is invisible in the audit trail until someone remembers to add
// it, and an audit trail nobody can read gets switched off.
const SENSITIVE = [
  "dl_number",
  "dlnumber",
  "licence_number",
  "license_number",
  "licencenumber",
  "licensenumber",
  "id_number",
  "idnumber",
  "aadhaar",
  "aadhar",
  "dob",
  "date_of_birth",
  "dateofbirth",
  "photo",
  "photo_link",
  "photolink",
  "photourl",
  "photo_url",
  "address",
  "father_or_husband_name",
  "client_secret",
  "clientsecret",
  "consent_ip",
];

function isSensitive(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return SENSITIVE.some((s) => k === s || k.endsWith(s));
}

/**
 * Deep-copies a value with every sensitive field replaced. A licence number is
 * masked rather than dropped, because "which licence was this" is exactly the
 * question an audit trail exists to answer; everything else becomes
 * "[redacted]", which is honest about there having been a value.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[redacted:too-deep]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isSensitive(key)) {
      out[key] = redact(raw, depth + 1);
      continue;
    }
    out[key] = typeof raw === "string" && /licen[cs]e|dl/i.test(key) ? maskDl(raw) : "[redacted]";
  }
  return out;
}
