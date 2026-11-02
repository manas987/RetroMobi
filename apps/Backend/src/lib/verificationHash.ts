import { createHash } from "node:crypto";

/**
 * Identity for a driving licence number, without storing the number.
 *
 * The hash is what detects the same licence appearing on two accounts. The
 * pepper is what stops that hash being a lookup table: there are maybe a few
 * hundred million Indian DL numbers in a format with very little entropy, so
 * an unpeppered sha256 is reversible by anyone with a weekend.
 * `lib/config.ts` requires DL_HASH_PEPPER in production for that reason.
 */
function pepper(): string {
  // Dev and test run without one. A guessable hash in a local database is not
  // interesting; a guessable hash in production is, which is why absence is a
  // boot failure there rather than a silent default here.
  return process.env.DL_HASH_PEPPER ?? "";
}

/**
 * Case and separators are presentation -- a licence printed `UK-07 2019
 * 0001234` is the same licence as `UK0720190001234`, and two accounts holding
 * it must collide. Nothing else is touched: **alphanumerics are never
 * altered**, because DL formats differ by state and RTO and a "cleanup" that
 * drops a character turns one person's licence into another's.
 */
export function normaliseLicenceNumber(licenceNumber: string): string {
  return licenceNumber.toUpperCase().replace(/[\s\-/]/g, "");
}

export function hashLicenceNumber(licenceNumber: string): string {
  return createHash("sha256")
    .update(normaliseLicenceNumber(licenceNumber) + pepper())
    .digest("hex");
}
