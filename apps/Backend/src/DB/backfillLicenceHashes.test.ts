// This script is destructive in one direction -- it masks the number it just
// hashed -- so the order and the idempotency are the whole test.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { createRider, createUser } from "../test/fixtures.ts";
import { hashLicenceNumber } from "../lib/verificationHash.ts";
import { applyMigrations } from "./migrate.ts";
import { backfillLicenceHashes } from "./backfillLicenceHashes.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

async function legacyRow(licenceNumber: string) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id, { verified: false });
  const { rows } = await pool.query(
    `insert into driving_licence_verifications
       (rider_id, provider, licence_number, status, expires_on, verified_at)
     values ($1, 'TEST', $2, 'VERIFIED', '2035-01-01', now())
     returning id`,
    [rider.id, licenceNumber],
  );
  return rows[0].id as string;
}

async function read(id: string) {
  const { rows } = await pool.query(
    `select licence_number, licence_number_hash from driving_licence_verifications where id = $1`,
    [id],
  );
  return rows[0] as { licence_number: string; licence_number_hash: string | null };
}

describe("backfillLicenceHashes", () => {
  test("hashes first and masks second, so the hash matches the original number", async () => {
    const id = await legacyRow("UK0720190001234");
    await backfillLicenceHashes(pool);

    const row = await read(id);
    expect(row.licence_number).toBe("UK07*******1234");
    // The point of the ordering: had it masked first, this would be the hash
    // of "UK07*******1234" and every duplicate check would be meaningless.
    expect(row.licence_number_hash).toBe(hashLicenceNumber("UK0720190001234"));
  });

  test("re-running changes nothing -- it is the kind of script people run twice", async () => {
    const id = await legacyRow("MH4820240007455");
    await backfillLicenceHashes(pool);
    const first = await read(id);
    await backfillLicenceHashes(pool);
    expect(await read(id)).toEqual(first);
  });

  test("an already-masked number is skipped rather than hashed again", async () => {
    const id = await legacyRow("DL14********1234");
    const result = await backfillLicenceHashes(pool);

    expect(result.skipped).toBeGreaterThan(0);
    const row = await read(id);
    expect(row.licence_number_hash).toBeNull();
    expect(row.licence_number).toBe("DL14********1234");
  });

  test("an empty licence number -- an abandoned DigiLocker consent -- is left alone", async () => {
    const id = await legacyRow("");
    await backfillLicenceHashes(pool);

    const row = await read(id);
    expect(row.licence_number).toBe("");
    expect(row.licence_number_hash).toBeNull();
  });
});
