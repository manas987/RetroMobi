import { Router } from "express";
import { requireAuth } from "../../../middleware/requireAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  AccountEmailSendSchema,
  AccountEmailVerifySchema,
  UpdateAccountSchema,
  EmailOtpSendSchema,
  EmailOtpVerifySchema,
  LogoutSchema,
  RefreshSchema,
  SendOtpSchema,
  SignupCompleteSchema,
  VerifyFirebaseOtpSchema,
  VerifyOtpSchema,
} from "./schema.ts";

const router = Router();

router.post("/otp/send", validate(SendOtpSchema), controller.sendOtp);
router.post("/otp/verify", validate(VerifyOtpSchema), controller.verifyOtp);
router.post("/otp/verify-firebase", validate(VerifyFirebaseOtpSchema), controller.verifyFirebaseOtp);
router.post("/email-otp/send", validate(EmailOtpSendSchema), controller.sendEmailOtp);
router.post("/email-otp/verify", validate(EmailOtpVerifySchema), controller.verifyEmailOtp);
router.post("/signup/complete", validate(SignupCompleteSchema), controller.completeSignup);
router.post("/refresh", validate(RefreshSchema), controller.refresh);
router.post("/logout", requireAuth, validate(LogoutSchema), controller.logout);
router.get("/sessions", requireAuth, controller.listSessions);
// The signed-in customer's own account (Profile page).
router.get("/me", requireAuth, controller.getAccount);
router.patch("/me", requireAuth, validate(UpdateAccountSchema), controller.updateAccount);
router.post("/me/email/send", requireAuth, validate(AccountEmailSendSchema), controller.sendAccountEmailOtp);
router.post("/me/email/verify", requireAuth, validate(AccountEmailVerifySchema), controller.verifyAccountEmail);
router.delete("/sessions/:id", requireAuth, controller.revokeSession);

export default router;
