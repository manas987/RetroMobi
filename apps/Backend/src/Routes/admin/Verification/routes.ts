import { Router } from "express";
import { requireAdminAuth, requireAdminRole } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  DecisionSchema,
  DocumentParamsSchema,
  LicenceDecisionSchema,
  QueueQuerySchema,
  RiderReviewSchema,
} from "./schema.ts";

const router = Router();

router.use(requireAdminAuth, requireAdminRole("ADMIN", "SUPER_ADMIN"));

router.get("/queue", validate(QueueQuerySchema, "query"), controller.queue);
// Before the POST decide routes so ":type/:id/document" is never swallowed
// by a two-segment decide path.
router.get("/:type/:id/document", validate(DocumentParamsSchema, "params"), controller.document);

// A customer's driving licence. Before the generic decide routes, like the
// document route above, so two-segment paths cannot swallow these.
router.get("/rider/:sessionId/photo", controller.riderVerificationPhoto);
router.get("/rider/:sessionId/events", controller.riderVerificationEvents);
router.post(
  "/rider/:sessionId/review",
  validate(RiderReviewSchema),
  controller.riderVerificationReview,
);

router.post("/shops/:shopId", validate(DecisionSchema), controller.shop);
router.post("/vehicles/:vehicleId", validate(DecisionSchema), controller.vehicle);
router.post("/vehicle-documents/:documentId", validate(DecisionSchema), controller.vehicleDocument);
router.post("/merchant-documents/:documentId", validate(DecisionSchema), controller.merchantDocument);
router.post("/shop-documents/:documentId", validate(DecisionSchema), controller.shopDocument);
router.post("/shop-licences/:licenceId", validate(LicenceDecisionSchema), controller.shopLicence);

export default router;
