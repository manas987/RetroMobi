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

export const SignupCompleteSchema = z.object({
  signupTicket: z.string().min(1),
  deviceId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().min(1),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1),
});
