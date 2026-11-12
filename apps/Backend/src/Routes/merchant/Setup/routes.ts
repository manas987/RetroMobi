import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { requirePermission } from "../../../middleware/requirePermission.ts";
import * as controller from "./controller.ts";

const router = Router();

router.use(requireMerchantAuth);

// The "Get listed" checklist and the fleet setup board. Statuses only, no money.
router.get("/shops/:shopId/setup", requirePermission("fleet:read"), controller.setup);

export default router;
