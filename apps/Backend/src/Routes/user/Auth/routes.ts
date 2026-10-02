import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  EmailOtpSendSchema,
  EmailOtpVerifySchema,
  GoogleAuthSchema,
  LogoutSchema,
  RefreshSchema,
  SendOtpSchema,
  SignupCompleteSchema,
  VerifyOtpSchema,
} from "./schema.ts";

const router = Router();

router.post("/otp/send", validate(SendOtpSchema), controller.sendOtp);
router.post("/otp/verify", validate(VerifyOtpSchema), controller.verifyOtp);
router.post("/email-otp/send", validate(EmailOtpSendSchema), controller.sendEmailOtp);
router.post("/email-otp/verify", validate(EmailOtpVerifySchema), controller.verifyEmailOtp);
router.post("/google", validate(GoogleAuthSchema), controller.googleAuth);
router.post("/signup/complete", validate(SignupCompleteSchema), controller.completeSignup);
router.post("/refresh", validate(RefreshSchema), controller.refresh);
router.post("/logout", requireAuth, validate(LogoutSchema), controller.logout);
router.delete("/sessions/:id", requireAuth, controller.revokeSession);

export default router;
