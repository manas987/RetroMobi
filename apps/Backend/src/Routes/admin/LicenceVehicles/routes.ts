import { Router } from "express";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { LinkVehicleSchema } from "./schema.ts";

const router = Router();

// requireAdminAuth only rejects with 401 (no/invalid token), so a blanket
// router.use() here is safe. requireAdminRole can reject with 403, and this
// router is mounted at the admin tree's root alongside sibling routers
// (Models, Coupons, Tickets, ...) -- a blanket role gate here would 403 every
// later-mounted sibling's requests too, before Express ever reaches them. It
// must be per-route instead.
router.use(requireAdminAuth);

const canLink = requireAdminRole("ADMIN", "SUPER_ADMIN");

router.get("/licences/:licenceId/vehicles", canLink, controller.list);
router.post("/licences/:licenceId/vehicles", canLink, validate(LinkVehicleSchema), controller.link);
router.delete("/licence-vehicles/:linkId", canLink, controller.unlink);

export default router;
