import type { NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import { pool } from "../DB/client.ts";
import { can, type Permission, type ShopRole } from "../lib/permissions.ts";

declare global {
  namespace Express {
    interface Request {
      shopId?: string;
      shopRole?: ShopRole;
    }
  }
}

/**
 * The shop a request acts on. Every hint in the request (a `:shopId`, a body or
 * query `shopId`, a vehicle, a booking) must name the same shop: checked one at a
 * time, a member of shop A could name A next to shop B's vehicle and pass the
 * check for A. `db` is a parameter so tests can point it at the test database.
 */
export async function resolveShopId(db: Pool, req: Request): Promise<string | null> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const shops: (string | null)[] = [];

  const direct = req.params.shopId ?? body.shopId ?? (req.query as Record<string, unknown>)?.shopId;
  if (typeof direct === "string") shops.push(direct);

  const vehicleId = req.params.vehicleId ?? body.vehicleId;
  if (typeof vehicleId === "string") {
    const { rows } = await db.query(`select shop_id from vehicles where id = $1 and deleted_at is null`, [vehicleId]);
    shops.push(rows[0]?.shop_id ?? null);
  }

  const bookingId = req.params.bookingId ?? body.bookingId;
  if (typeof bookingId === "string") {
    const { rows } = await db.query(
      `select v.shop_id from bookings b
         join vehicles v on v.id = b.vehicle_id
        where b.id = $1 and b.deleted_at is null`,
      [bookingId],
    );
    shops.push(rows[0]?.shop_id ?? null);
  }

  const first = shops[0];
  return first && shops.every((s) => s === first) ? first : null;
}

// Every merchant route is scoped to exactly one shop, but the URL names different
// things per module -- vehicles, bookings, or the shop itself. This resolves the
// shop from whichever is present, then checks the caller's active membership.
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const shopId = await resolveShopId(pool, req);
    if (!shopId) {
      res.status(400).json({ error: "shop_scope_required" });
      return;
    }

    const { rows } = await pool.query(
      `select role from shop_members
        where shop_id = $1 and merchant_user_id = $2
          and status = 'ACTIVE' and deleted_at is null`,
      [shopId, req.merchantUserId],
    );
    const member = rows[0];
    // Whether a shop exists at all is not information a non-member is entitled to.
    if (!member) {
      res.status(404).json({ error: "shop_not_found" });
      return;
    }
    if (!can(member.role as ShopRole, permission)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    req.shopId = shopId;
    req.shopRole = member.role as ShopRole;
    next();
  };
}
