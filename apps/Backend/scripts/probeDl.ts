/**
 * Calls Cashfree's DL verification once, with a real licence, and shows exactly
 * what comes back. Nothing is written to the database.
 *
 *     cd apps/Backend
 *     bun run scripts/probeDl.ts UK0720190001234 1995-06-15
 *
 * This exists because the whole identity design rests on one assumption —
 * `details_of_driving_licence.photo` arrives — and that assumption has only
 * ever been checked against documentation, never against the API. Finding out
 * through the UI means a session row, a state machine and an R2 upload between
 * you and the answer. This is the answer on its own.
 *
 * It also answers the two field names the published docs do not pin down:
 * the item shape of `cov_details` (providers/kyc.ts guesses at
 * cov/code/category/class_of_vehicle) and whether `issuing_rto` exists at all.
 *
 * WARNING: the output is a real person's licence record — name, address,
 * father's name, date of birth. It prints to your terminal and writes the
 * photo to a file. Do not paste it into a ticket, a chat or a commit.
 */
const [licenceNumber, dob] = process.argv.slice(2);

if (!licenceNumber || !dob) {
  console.error("usage: bun run scripts/probeDl.ts <DL_NUMBER> <YYYY-MM-DD>");
  process.exit(1);
}

const clientId = process.env.CASHFREE_CLIENT_ID;
const clientSecret = process.env.CASHFREE_CLIENT_SECRET;
const baseUrl = process.env.CASHFREE_SECUREID_BASE_URL ?? "https://api.cashfree.com/verification";

if (!clientId || !clientSecret) {
  console.error(
    "CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET are not set, so there is nothing to call.\n" +
      "This script deliberately has no dev-fallback: a faked answer here would tell you nothing.",
  );
  process.exit(1);
}

console.log(`POST ${baseUrl}/driving-license`);

const response = await fetch(`${baseUrl}/driving-license`, {
  method: "POST",
  headers: {
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
    "x-api-version": "2023-12-18",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    verification_id: `probe-${Date.now()}`,
    dl_number: licenceNumber,
    dob,
  }),
});

const text = await response.text();
console.log(`HTTP ${response.status}\n`);

let body: Record<string, unknown>;
try {
  body = JSON.parse(text);
} catch {
  console.log(text);
  process.exit(response.ok ? 0 : 1);
}

console.log(JSON.stringify(body, null, 2));

const details = body.details_of_driving_licence as Record<string, unknown> | undefined;

console.log("\n--- what the code depends on ---");
console.log(`status                : ${String(body.status)}`);
console.log(`dl_validity           : ${JSON.stringify(body.dl_validity ?? null)}`);
console.log(`details.name          : ${String(details?.name ?? "(absent)")}`);
console.log(`details.status        : ${String(details?.status ?? "(absent)")}`);
console.log(`details.issuing_rto   : ${String(details?.issuing_rto ?? "(ABSENT — not in the v2 reference)")}`);
console.log(`details.cov_details   : ${JSON.stringify(details?.cov_details ?? null)}`);
console.log(
  `details.photo         : ${details?.photo ? "present" : "(ABSENT — the identity design assumes this)"}`,
);

// The photo URL expires in 24 hours, so there is no point printing it. Fetch it
// now, which is also what the real flow does and for the same reason.
if (typeof details?.photo === "string" && details.photo) {
  const photo = await fetch(details.photo);
  if (!photo.ok) {
    console.log(`\nphoto URL returned HTTP ${photo.status} — it may already have expired.`);
  } else {
    const bytes = new Uint8Array(await photo.arrayBuffer());
    const type = photo.headers.get("content-type") ?? "image/jpeg";
    const file = `/tmp/retromobi-dl-photo.${type.includes("png") ? "png" : "jpg"}`;
    await Bun.write(file, bytes);
    console.log(`\nphoto: ${bytes.byteLength} bytes, ${type} → ${file}`);
    console.log("Open it. If that is your face, the identity half of this system works.");
  }
}
