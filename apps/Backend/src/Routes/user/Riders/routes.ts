import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { rateLimit } from "../../../middleware/rateLimit.ts";
import {
  CreateRiderSchema,
  DigilockerCallbackSchema,
  DigilockerInitSchema,
  ManualLicenceSchema,
  PhotoUploadSchema,
  RetryVerificationSchema,
  StartVerificationSchema,
  UpdateRiderSchema,
  VerifyDlNumberSchema,
} from "./schema.ts";

const router = Router();

router.use(requireAuth);
router.get("/", controller.list);
router.post("/", validate(CreateRiderSchema), controller.create);
router.patch("/:id", validate(UpdateRiderSchema), controller.update);
router.delete("/:id", controller.remove);
router.post("/:id/licence/digilocker/init", validate(DigilockerInitSchema), controller.digilockerInit);
router.post(
  "/:id/licence/digilocker/callback",
  validate(DigilockerCallbackSchema),
  controller.digilockerCallback,
);
router.post("/:id/licence/manual", validate(ManualLicenceSchema), controller.manualLicence);

// --- verification sessions (docs/dl-verification.md) ---------------------
//
// rateLimit has only been applied to public GETs until now. These need it
// most: without it, POST /verification/:sid/dl-number is an oracle for testing
// whether an arbitrary driving licence number and date of birth go together.
router.get("/verification/consent", controller.consentText);
router.get("/:id/licence", controller.licence);
router.post(
  "/:id/verification",
  rateLimit,
  validate(StartVerificationSchema),
  controller.startVerification,
);
router.get("/:id/verification/:sessionId", controller.verificationStatus);
router.post(
  "/:id/verification/:sessionId/digilocker/complete",
  rateLimit,
  controller.completeDigilocker,
);
router.post(
  "/:id/verification/:sessionId/dl-number",
  rateLimit,
  validate(VerifyDlNumberSchema),
  controller.verifyDlNumber,
);
router.post(
  "/:id/verification/:sessionId/photo",
  rateLimit,
  validate(PhotoUploadSchema),
  controller.photoUpload,
);
router.post(
  "/:id/verification/:sessionId/photo/confirm",
  rateLimit,
  validate(PhotoUploadSchema),
  controller.photoConfirm,
);
router.post(
  "/:id/verification/:sessionId/retry",
  rateLimit,
  validate(RetryVerificationSchema),
  controller.retryVerification,
);
router.post("/:id/verification/:sessionId/cancel", controller.cancelVerification);

export default router;
