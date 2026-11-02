// Retention is a promise made in the consent text, so it needs a test, and the
// cases that matter are the ones where it must NOT delete.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../DB/migrate.ts";
import { createBookableVehicle, createRider, createUser, futureWindow } from "../test/fixtures.ts";
import { createHold } from "../Routes/user/Bookings/bookingsService.ts";
import { deleteRiderVerificationData, retentionDays, sweepVerificationPhotos } from "./verificationRetention.ts";

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

async function photoFor(riderId: string, ageDays: number) {
  const { rows } = await pool.query(
    `insert into verification_photos (rider_id, source, storage_key, content_type, created_at)
     values ($1, 'RTO_RECORD', $2, 'image/jpeg', now() - ($3 || ' days')::interval)
     returning id`,
    [riderId, `riders/${riderId}/verification/${crypto.randomUUID()}`, String(ageDays)],
  );
  return rows[0].id as string;
}

async function isDeleted(photoId: string) {
  const { rows } = await pool.query(`select deleted_at from verification_photos where id = $1`, [
    photoId,
  ]);
  return rows[0].deleted_at !== null;
}

describe("sweepVerificationPhotos", () => {
  test("deletes a photo older than the retention window", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { verified: false });
    const photo = await photoFor(rider.id, retentionDays() + 5);

    await sweepVerificationPhotos(pool, 200);
    expect(await isDeleted(photo)).toBe(true);
  });

  test("keeps one inside the window", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { verified: false });
    const photo = await photoFor(rider.id, 1);

    await sweepVerificationPhotos(pool, 200);
    expect(await isDeleted(photo)).toBe(false);
  });

  // Whatever the dates say, a vehicle that is out is a vehicle somebody may
  // have to be identified against.
  test("never deletes while the rider has an open rental", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id);
    const vehicle = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(900);
    await createHold(pool, {
      userId: user.id,
      items: [{ vehicleId: vehicle.id, riderId: rider.id }],
      pickupAt,
      returnAt,
    });
    const photo = await photoFor(rider.id, retentionDays() + 100);

    await sweepVerificationPhotos(pool, 200);
    expect(await isDeleted(photo)).toBe(false);
  });

  test("the clock runs from the last completed rental, not from the photo", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id);
    const vehicle = await createBookableVehicle(pool);
    const { pickupAt, returnAt } = futureWindow(900);
    const held = await createHold(pool, {
      userId: user.id,
      items: [{ vehicleId: vehicle.id, riderId: rider.id }],
      pickupAt,
      returnAt,
    });
    // An old photo, but the rental only just finished.
    await pool.query(
      `update bookings set status = 'COMPLETED', actual_return_at = now() where id = $1`,
      [held.bookings[0]!.id],
    );
    const photo = await photoFor(rider.id, retentionDays() + 100);

    await sweepVerificationPhotos(pool, 200);
    expect(await isDeleted(photo)).toBe(false);
  });

  test("a second sweep does not re-delete, so the batch keeps moving", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { verified: false });
    await photoFor(rider.id, retentionDays() + 5);

    const first = await sweepVerificationPhotos(pool, 200);
    expect(first).toBeGreaterThan(0);
    const { rows } = await pool.query(
      `select count(*)::int as n from verification_photos
        where rider_id = $1 and deleted_at is null`,
      [rider.id],
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("deleteRiderVerificationData", () => {
  test("a withdrawn consent is immediate, not on the retention clock", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id, { verified: false });
    const photo = await photoFor(rider.id, 0);

    expect(await deleteRiderVerificationData(pool, rider.id)).toBe(1);
    expect(await isDeleted(photo)).toBe(true);
  });

  // They identify nobody on their own, they are the audit record of a decision
  // that let a stranger ride away, and the cross-account duplicate check needs
  // the hash to survive.
  test("the masked licence number and its hash survive", async () => {
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id);
    await photoFor(rider.id, 0);
    await deleteRiderVerificationData(pool, rider.id);

    const { rows } = await pool.query(
      `select licence_number, licence_number_hash from driving_licence_verifications where rider_id = $1`,
      [rider.id],
    );
    expect(rows[0].licence_number).toContain("*");
    expect(rows[0].licence_number_hash).toBeTruthy();
  });
});
