import type { NextFunction, Request, Response } from "express";
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

async function resolveShopId(req: Request): Promise<string | null> {
  const direct = req.params.shopId ?? (req.body as any)?.shopId ?? (req.query as any)?.shopId;
  if (typeof direct === "string") return direct;

  const vehicleId = req.params.vehicleId ?? (req.body as any)?.vehicleId;
  if (typeof vehicleId === "string") {
    const { rows } = await pool.query(
      `select shop_id from vehicles where id = $1 and deleted_at is null`,
      [vehicleId],
    );
    return rows[0]?.shop_id ?? null;
  }

  const bookingId = req.params.bookingId ?? (req.body as any)?.bookingId;
  if (typeof bookingId === "string") {
    const { rows } = await pool.query(
      `select v.shop_id from bookings b
         join vehicles v on v.id = b.vehicle_id
        where b.id = $1 and b.deleted_at is null`,
      [bookingId],
    );
    return rows[0]?.shop_id ?? null;
  }

  return null;
}

// Every merchant route is scoped to exactly one shop, but the URL names different
// things per module -- vehicles, bookings, or the shop itself. This resolves the
// shop from whichever is present, then checks the caller's active membership.
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const shopId = await resolveShopId(req);
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
