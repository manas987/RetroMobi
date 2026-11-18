import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";
import { pool } from "../../../DB/client.ts";
import { writeAudit } from "../../../lib/audit.ts";
import { pathParam } from "../../../lib/pathParam.ts";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import { validate } from "../../../middleware/validate.ts";
import { CouponNotFoundError, createCoupon, type CouponInput } from "../../admin/Coupons/couponsService.ts";
import { CreateShopCouponSchema, SetCouponStatusSchema } from "../../admin/Coupons/schema.ts";

// A shop's own coupons: always SHOP-funded (the discount comes off the shop's
// wallet credit), always scoped to the one shop in the URL. A merchant with two
// shops runs a coupon per shop, so one shop never discounts another's scooters.

const MINE = `funded_by = 'SHOP' and $2 = any(shop_ids) and deleted_at is null`;

async function listShopCoupons(db: Pool, shopId: string) {
  const { rows } = await db.query(
    `select * from coupons where funded_by = 'SHOP' and $1 = any(shop_ids) and deleted_at is null
      order by created_at desc`,
    [shopId],
  );
  return rows;
}

async function updateShopCoupon(
  db: Pool,
  input: { couponId: string; shopId: string; merchantUserId: string; set: "status" | "delete"; status?: string },
) {
  const { rows } =
    input.set === "status"
      ? await db.query(`update coupons set status = $3 where id = $1 and ${MINE} returning *`, [
          input.couponId,
          input.shopId,
          input.status,
        ])
      : await db.query(`update coupons set deleted_at = now() where id = $1 and ${MINE} returning *`, [
          input.couponId,
          input.shopId,
        ]);
  if (!rows[0]) throw new CouponNotFoundError(`coupon ${input.couponId} not found`);
  await writeAudit(db, {
    actorType: "MERCHANT",
    actorId: input.merchantUserId,
    action: input.set === "status" ? "coupon.status_updated" : "coupon.soft_deleted",
    entityType: "coupon",
    entityId: input.couponId,
    shopId: input.shopId,
    after: input.set === "status" ? { status: input.status } : undefined,
  });
  return rows[0];
}

const router = Router();
router.use(requireMerchantAuth);

router.get("/shops/:shopId/coupons", requirePermission("pricing:read"), async (req: Request, res: Response) => {
  res.status(200).json({ coupons: await listShopCoupons(pool, pathParam(req, "shopId")) });
});

router.post(
  "/shops/:shopId/coupons",
  requirePermission("pricing:write"),
  validate(CreateShopCouponSchema),
  async (req: Request, res: Response) => {
    const coupon = await createCoupon(pool, { type: "MERCHANT", id: req.merchantUserId! }, {
      ...(req.body as CouponInput),
      fundedBy: "SHOP",
      shopIds: [pathParam(req, "shopId")],
    });
    res.status(201).json(coupon);
  },
);

router.patch(
  "/shops/:shopId/coupons/:couponId",
  requirePermission("pricing:write"),
  validate(SetCouponStatusSchema),
  async (req: Request, res: Response) => {
    const coupon = await updateShopCoupon(pool, {
      couponId: pathParam(req, "couponId"),
      shopId: pathParam(req, "shopId"),
      merchantUserId: req.merchantUserId!,
      set: "status",
      status: req.body.status,
    });
    res.status(200).json(coupon);
  },
);

router.delete(
  "/shops/:shopId/coupons/:couponId",
  requirePermission("pricing:write"),
  async (req: Request, res: Response) => {
    await updateShopCoupon(pool, {
      couponId: pathParam(req, "couponId"),
      shopId: pathParam(req, "shopId"),
      merchantUserId: req.merchantUserId!,
      set: "delete",
    });
    res.status(204).send();
  },
);

export default router;
