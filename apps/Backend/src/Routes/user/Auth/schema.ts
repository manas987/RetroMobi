import { z } from "zod";

const phoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, "phone must be a valid +91 mobile number");

export const SendOtpSchema = z.object({
  phone: phoneSchema,
});

export const VerifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, "code must be a 6-digit number"),
  deviceId: z.string().min(1),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().min(1),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1),
});

export const EmailOtpSendSchema = z.object({
  signupTicket: z.string().min(1),
  email: z.string().email(),
});

export const EmailOtpVerifySchema = z.object({
  signupTicket: z.string().min(1),
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, "code must be a 6-digit number"),
});

export const GoogleAuthSchema = z.object({
  idToken: z.string().min(1),
});

export const SignupCompleteSchema = z
  .object({
    signupTicket: z.string().min(1),
    deviceId: z.string().min(1),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    emailVerificationTicket: z.string().min(1).optional(),
    googlePrefillTicket: z.string().min(1).optional(),
  })
  .refine((body) => Boolean(body.googlePrefillTicket || body.emailVerificationTicket), {
    message: "either emailVerificationTicket or googlePrefillTicket is required",
  });
