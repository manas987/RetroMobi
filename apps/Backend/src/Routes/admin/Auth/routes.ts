import { Router } from "express";
import { requireAdminAuth } from "../../../middleware/requireAdminAuth.ts";
import { validate } from "../../../middleware/validate.ts";
import * as controller from "./controller.ts";
import { LogoutSchema, RefreshSchema, SendOtpSchema, VerifyOtpSchema } from "./schema.ts";

const router = Router();

// No /signup/complete -- an unknown phone is rejected, never routed into signup.
router.post("/otp/send", validate(SendOtpSchema), controller.sendOtp);
router.post("/otp/verify", validate(VerifyOtpSchema), controller.verifyOtp);
router.post("/refresh", validate(RefreshSchema), controller.refresh);
router.post("/logout", requireAdminAuth, validate(LogoutSchema), controller.logout);

export default router;
