import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import * as controller from "./controller.ts";

// Read-only: the model catalog is shared across the whole marketplace and
// only admins create entries (see admin/Models), but a merchant adding a
// vehicle to their fleet needs to pick one of those existing models.
const router = Router();

router.use(requireMerchantAuth);
router.get("/", controller.list);

export default router;
