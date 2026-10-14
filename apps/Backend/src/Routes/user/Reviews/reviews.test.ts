import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";
import { applyMigrations } from "../../../DB/migrate.ts";
import {
  createBookableVehicle,
  createRider,
  createUser,
  insertBooking,
} from "../../../test/fixtures.ts";
import {
  ReviewExistsError,
  ReviewNotAllowedError,
  createReview,
  softDeleteReview,
} from "./reviewsService.ts";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgres://retromobi:retromobi@localhost:5433/retromobi_test",
});

beforeAll(async () => {
  await applyMigrations(pool);
});

afterAll(async () => {
  await pool.end();
});

async function pickedUpBooking(vehicleId: string) {
  const user = await createUser(pool);
  const rider = await createRider(pool, user.id);
  const { rows } = await pool.query(`insert into booking_groups (user_id) values ($1) returning id`, [
    user.id,
  ]);
  const booking = await insertBooking(pool, {
    vehicleId,
    pickupAt: new Date(Date.now() + 86_400_000 * 900).toISOString(),
    returnAt: new Date(Date.now() + 86_400_000 * 901).toISOString(),
    riderId: rider.id,
    groupId: rows[0].id,
  });
  await pool.query(`update bookings set actual_pickup_at = now() where id = $1`, [booking.id]);
  return { userId: user.id, bookingId: booking.id };
}

describe("reviews and shop rating", () => {
  test("reviewing without a pickup is refused", async () => {
    const vehicle = await createBookableVehicle(pool);
    const user = await createUser(pool);
    const rider = await createRider(pool, user.id);
    const booking = await insertBooking(pool, {
      vehicleId: vehicle.id,
      pickupAt: new Date(Date.now() + 86_400_000 * 910).toISOString(),
      returnAt: new Date(Date.now() + 86_400_000 * 911).toISOString(),
      riderId: rider.id,
    });

    await expect(
      createReview(pool, user.id, { bookingId: booking.id, rating: 5 }),
    ).rejects.toBeInstanceOf(ReviewNotAllowedError);
  });

  test("a review recomputes shops.rating, a second review on the same booking is rejected, and deleting the only review resets it to null", async () => {
    const vehicle = await createBookableVehicle(pool);
    const { userId, bookingId } = await pickedUpBooking(vehicle.id);

    const review = await createReview(pool, userId, { bookingId, rating: 4 });

    const { rows: afterCreate } = await pool.query(`select rating, review_count from shops where id = $1`, [
      vehicle.shopId,
    ]);
    expect(Number(afterCreate[0].rating)).toBe(4);
    expect(afterCreate[0].review_count).toBe(1);

    await expect(createReview(pool, userId, { bookingId, rating: 2 })).rejects.toBeInstanceOf(
      ReviewExistsError,
    );

    await softDeleteReview(pool, userId, review.id);
    const { rows: afterDelete } = await pool.query(`select rating, review_count from shops where id = $1`, [
      vehicle.shopId,
    ]);
    expect(afterDelete[0].rating).toBeNull();
    expect(afterDelete[0].review_count).toBe(0);
  });
});
