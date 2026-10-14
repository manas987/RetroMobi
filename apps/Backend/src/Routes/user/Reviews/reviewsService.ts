import type { Pool, PoolClient } from "pg";
import { writeAudit } from "../../../lib/audit.ts";

export class ReviewNotAllowedError extends Error {}
export class ReviewExistsError extends Error {}
export class ReviewNotFoundError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

// Not a DB trigger, so this stays greppable with the rest of the SQL. A shop
// whose last review is deleted goes back to rating = null, which is what
// makes it sort last in search.
async function recomputeShopRating(client: PoolClient, shopId: string) {
  await client.query(
    `update shops set
       rating = (select round(avg(rating)::numeric, 1) from reviews where shop_id = $1 and deleted_at is null),
       review_count = (select count(*) from reviews where shop_id = $1 and deleted_at is null)
     where id = $1`,
    [shopId],
  );
}

export async function createReview(
  pool: Pool,
  userId: string,
  input: { bookingId: string; rating: number; comment?: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `select b.vehicle_id, v.shop_id
         from bookings b
         join booking_groups g on g.id = b.group_id
         join vehicles v on v.id = b.vehicle_id
        where b.id = $1 and g.user_id = $2 and b.actual_pickup_at is not null and b.deleted_at is null`,
      [input.bookingId, userId],
    );
    if (rows.length === 0) {
      throw new ReviewNotAllowedError(`booking ${input.bookingId} is not eligible for a review`);
    }
    const { vehicle_id: vehicleId, shop_id: shopId } = rows[0];

    let review;
    try {
      const { rows: inserted } = await client.query(
        `insert into reviews (booking_id, shop_id, user_id, vehicle_id, rating, comment)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [input.bookingId, shopId, userId, vehicleId, input.rating, input.comment ?? null],
      );
      review = inserted[0];
    } catch (err) {
      if (isUniqueViolation(err)) throw new ReviewExistsError(`booking ${input.bookingId} already has a review`);
      throw err;
    }

    await recomputeShopRating(client, shopId);

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "review.created",
      entityType: "review",
      entityId: review.id,
      after: { rating: input.rating },
    });

    await client.query("COMMIT");
    return review;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateReview(
  pool: Pool,
  userId: string,
  reviewId: string,
  input: { rating?: number; comment?: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: beforeRows } = await client.query(
      `select * from reviews where id = $1 and user_id = $2 and deleted_at is null`,
      [reviewId, userId],
    );
    if (beforeRows.length === 0) throw new ReviewNotFoundError(`review ${reviewId} not found`);
    const before = beforeRows[0];

    const { rows } = await client.query(
      `update reviews set rating = coalesce($1, rating), comment = coalesce($2, comment) where id = $3 returning *`,
      [input.rating ?? null, input.comment ?? null, reviewId],
    );
    const review = rows[0];

    if (input.rating !== undefined) await recomputeShopRating(client, review.shop_id);

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "review.updated",
      entityType: "review",
      entityId: reviewId,
      before: { rating: before.rating },
      after: { rating: review.rating },
    });

    await client.query("COMMIT");
    return review;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function softDeleteReview(pool: Pool, userId: string, reviewId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `update reviews set deleted_at = now() where id = $1 and user_id = $2 and deleted_at is null returning shop_id`,
      [reviewId, userId],
    );
    if (rows.length === 0) throw new ReviewNotFoundError(`review ${reviewId} not found`);

    await recomputeShopRating(client, rows[0].shop_id);

    await writeAudit(client, {
      actorType: "CUSTOMER",
      actorId: userId,
      action: "review.deleted",
      entityType: "review",
      entityId: reviewId,
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listShopReviews(pool: Pool, shopId: string, filters: { page?: number; limit?: number }) {
  const limit = Math.min(filters.limit ?? 25, 100);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * limit;
  const { rows } = await pool.query(
    `select * from reviews where shop_id = $1 and deleted_at is null order by created_at desc limit $2 offset $3`,
    [shopId, limit, offset],
  );
  return rows;
}
