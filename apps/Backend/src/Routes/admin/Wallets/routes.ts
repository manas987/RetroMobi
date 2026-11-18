import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../../../DB/client.ts";
import { pathParam } from "../../../lib/pathParam.ts";
import { adjustWallet, getWallet, listShopWallets, payShopDirectly } from "../../../lib/wallet.ts";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import { PaySchema } from "../Withdrawals/routes.ts";

// Every shop's wallet, for SUPER_ADMIN: see balances, pay a shop without it
// asking first, or correct a wallet with a reason. The list doubles as the
// shop picker for coupons.

const PayShopSchema = PaySchema.and(z.object({ amount: z.number().int().positive() }));
const AdjustSchema = z.object({
  /** Signed paise: positive credits the shop, negative takes back. */
  amount: z.number().int().refine((n) => n !== 0, "amount must not be zero"),
  reason: z.string().trim().min(3).max(500),
});

const router = Router();
router.use(requireAdminAuth, requireAdminRole("SUPER_ADMIN"));

router.get("/", async (_req: Request, res: Response) => {
  res.status(200).json({ wallets: await listShopWallets(pool) });
});

router.get("/:shopId", async (req: Request, res: Response) => {
  res.status(200).json(await getWallet(pool, pathParam(req, "shopId")));
});

router.post("/:shopId/payouts", validate(PayShopSchema), async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof PayShopSchema>;
  const withdrawal = await payShopDirectly(pool, { ...body, shopId: pathParam(req, "shopId"), adminId: req.adminId! });
  res.status(201).json(withdrawal);
});

router.post("/:shopId/adjustments", validate(AdjustSchema), async (req: Request, res: Response) => {
  const adjustment = await adjustWallet(pool, {
    shopId: pathParam(req, "shopId"),
    adminId: req.adminId!,
    amount: req.body.amount,
    reason: req.body.reason,
  });
  res.status(201).json(adjustment);
});

export default router;
