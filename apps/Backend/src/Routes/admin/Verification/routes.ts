import { Router } from "express";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { DecisionSchema, LicenceDecisionSchema, QueueQuerySchema } from "./schema.ts";

const router = Router();

router.use(requireAdminAuth, requireAdminRole("ADMIN", "SUPER_ADMIN"));

router.get("/queue", validate(QueueQuerySchema, "query"), controller.queue);
router.post("/shops/:shopId", validate(DecisionSchema), controller.shop);
router.post("/vehicles/:vehicleId", validate(DecisionSchema), controller.vehicle);
router.post("/vehicle-documents/:documentId", validate(DecisionSchema), controller.vehicleDocument);
router.post("/merchant-documents/:documentId", validate(DecisionSchema), controller.merchantDocument);
router.post("/shop-licences/:licenceId", validate(LicenceDecisionSchema), controller.shopLicence);

export default router;
