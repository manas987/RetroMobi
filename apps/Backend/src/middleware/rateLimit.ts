import type { NextFunction, Request, Response } from "express";
import { pool } from "../DB/client.ts";

const WINDOW_MS = 60_000;
const LIMIT = 60;

// IP-based, Postgres-backed, same fixed-window-bucket shape as the rest of the
// schema (no Redis). Applied only to public GET routes.
export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? "unknown";
  const key = `${ip}:${req.path}`;
  const windowStart = new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);

  const { rows } = await pool.query(
    `insert into rate_limits (key, window_start, count)
     values ($1, $2, 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [key, windowStart],
  );

  // Every distinct ip+path+minute leaves a row behind forever otherwise. Pruned
  // here rather than on a timer so the cleanup lives next to the thing it cleans
  // up; 1-in-500 keeps it off the hot path. ix_rate_limits_window makes it cheap.
  if (Math.random() < 0.002) {
    await pool.query(`delete from rate_limits where window_start < $1`, [
      new Date(Date.now() - 10 * WINDOW_MS),
    ]);
  }

  if (rows[0].count > LIMIT) {
    const retryAfterSeconds = Math.ceil((windowStart.getTime() + WINDOW_MS - Date.now()) / 1000);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: "rate_limited", retryAfterSeconds });
    return;
  }

  next();
}
