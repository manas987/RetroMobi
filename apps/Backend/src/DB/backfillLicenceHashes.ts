/**
 * One-off, idempotent: hash then mask every pre-existing driving licence
 * number. Run ONCE immediately after migration 0015.
 *
 *     bun run src/DB/backfillLicenceHashes.ts
 *
 * Not done inside the migration, for two reasons. `digest()` needs `pgcrypto`,
 * which this database does not have (only `btree_gist`, from 0009), and the
 * hash has to be computed with the same pepper the application uses, which
 * lives in the environment rather than in SQL.
 *
 * ORDER MATTERS: hash first, mask second. Masking first destroys the only
 * input the hash can be computed from, permanently and silently -- every
 * duplicate-licence check would then compare hashes of masks.
 */
import pg from "pg";
import { hashLicenceNumber } from "../lib/verificationHash.ts";
import { maskDl } from "../lib/maskSecrets.ts";

const { Pool } = pg;

export async function backfillLicenceHashes(pool: pg.Pool): Promise<{
  hashed: number;
  skipped: number;
}> {
  // Only rows still holding something unmasked and unhashed. Re-running is a
  // no-op, which matters because this is the kind of script someone runs twice
  // when they are unsure whether it worked.
  const { rows } = await pool.query<{ id: string; licence_number: string }>(
    `select id, licence_number
       from driving_licence_verifications
      where licence_number_hash is null
        and licence_number is not null
        and licence_number <> ''`,
  );

  let hashed = 0;
  let skipped = 0;

  for (const row of rows) {
    // A DigiLocker consent row that never completed stores '' (see
    // progress.md's note) and there is nothing to hash. It is also already
    // indistinguishable from a mask, so leave it alone.
    if (row.licence_number.includes("*")) {
      skipped += 1;
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update driving_licence_verifications
            set licence_number_hash = $1, licence_number = $2
          where id = $3`,
        [hashLicenceNumber(row.licence_number), maskDl(row.licence_number), row.id],
      );
      await client.query("commit");
      hashed += 1;
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  return { hashed, skipped };
}

if (import.meta.main) {
  if (!process.env.DL_HASH_PEPPER) {
    // Not fatal outside production -- verificationHash.ts documents why -- but
    // hashing a production table with an empty pepper and only noticing later
    // means rehashing from values that no longer exist.
    console.warn(
      "DL_HASH_PEPPER is not set. Hashes written now cannot be recomputed later, " +
        "because the numbers they came from are masked in the same pass.",
    );
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  backfillLicenceHashes(pool)
    .then(({ hashed, skipped }) => {
      console.log(`Hashed and masked ${hashed} licence number(s); skipped ${skipped}.`);
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
