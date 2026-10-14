import { Router } from "express";
import { requireMerchantAuth } from "../../../middleware/requireMerchantAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import {
  LogoutSchema,
  RefreshSchema,
  SendOtpSchema,
  SignupCompleteSchema,
  VerifyOtpSchema,
} from "./schema.ts";

const router = Router();

router.post("/otp/send", validate(SendOtpSchema), controller.sendOtp);
router.post("/otp/verify", validate(VerifyOtpSchema), controller.verifyOtp);
router.post("/signup/complete", validate(SignupCompleteSchema), controller.completeSignup);
router.post("/refresh", validate(RefreshSchema), controller.refresh);
router.post("/logout", requireMerchantAuth, validate(LogoutSchema), controller.logout);

export default router;
