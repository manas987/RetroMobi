import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../../../DB/client.ts";
import { pathParam } from "../../../lib/pathParam.ts";
import { listWithdrawals, payWithdrawal, rejectWithdrawal } from "../../../lib/wallet.ts";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";

// Merchants' wallet withdrawals (lib/wallet.ts). Money, so SUPER_ADMIN only,
// like the payments and payouts views in Oversight.

const ListSchema = z.object({
  status: z.enum(["REQUESTED", "PROCESSING", "PAID", "REJECTED", "FAILED"]).optional(),
});

export const PaySchema = z
  .object({
    method: z.enum(["CASHFREE_PAYOUT", "BANK_TRANSFER", "UPI", "CASH", "OTHER"]),
    reference: z.string().trim().min(3).max(100).optional(),
    note: z.string().trim().max(500).optional(),
    proofStorageKey: z.string().min(1).optional(),
  })
  .refine((b) => b.method === "CASHFREE_PAYOUT" || !!b.reference, {
    message: "an offline payment needs a reference (UTR, UPI ref or receipt number)",
    path: ["reference"],
  });

const RejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });

const router = Router();
router.use(requireAdminAuth, requireAdminRole("SUPER_ADMIN"));

router.get("/", validate(ListSchema, "query"), async (req: Request, res: Response) => {
  const query = req.validatedQuery as z.infer<typeof ListSchema>;
  res.status(200).json({ withdrawals: await listWithdrawals(pool, query) });
});

router.post("/:withdrawalId/pay", validate(PaySchema), async (req: Request, res: Response) => {
  const withdrawal = await payWithdrawal(pool, {
    withdrawalId: pathParam(req, "withdrawalId"),
    adminId: req.adminId!,
    ...(req.body as z.infer<typeof PaySchema>),
  });
  res.status(200).json(withdrawal);
});

router.post("/:withdrawalId/reject", validate(RejectSchema), async (req: Request, res: Response) => {
  const withdrawal = await rejectWithdrawal(pool, {
    withdrawalId: pathParam(req, "withdrawalId"),
    adminId: req.adminId!,
    reason: req.body.reason,
  });
  res.status(200).json(withdrawal);
});

export default router;
