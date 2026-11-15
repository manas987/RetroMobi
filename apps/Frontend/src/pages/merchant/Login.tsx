import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AuthLayout } from "../../components/AuthLayout";
import { PhoneInput, DEFAULT_COUNTRY } from "../../components/PhoneInput";
import type { Country } from "../../lib/countries";
import { OtpInput } from "../../components/OtpInput";
import { AuthForm, BackRow, ErrorBox, ResendRow, SubmitButton, TextField } from "../../components/AuthFormBits";
import { useCountdown } from "../../lib/useCountdown";
import { usePortalSession, portalFetch, PortalApiError } from "../../lib/portal";

type Step = "phone" | "otp" | "signup";

/** Mirrors MerchantLoginResult / MerchantSignupRequiredResult in
 *  merchant/Auth/merchantAuthService.ts — a discriminated union on `status`. */
type VerifyResult =
  | {
      status: "LOGIN";
      accessToken: string;
      refreshToken: string;
      merchant: { id: string; phone: string; name: string | null; email: string | null };
    }
  | { status: "SIGNUP_REQUIRED"; signupTicket: string; ticketExpiresInSeconds: number };

export function MerchantLogin() {
  const { session, setTokens, deviceId } = usePortalSession("merchant");
  const [, navigate] = useLocation();
  const resend = useCountdown(30);

  // Signing in while already signed in otherwise re-renders the form over a
  // live session.
  useEffect(() => {
    if (session) navigate("/merchant", { replace: true });
  }, [session, navigate]);

  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const phone = `${country.dial}${localPhone}`;
  const [code, setCode] = useState("");
  const [signupTicket, setSignupTicket] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // An error belongs to the step it happened on.
  useEffect(() => setError(null), [step]);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const sendOtp = () =>
    run(async () => {
      await portalFetch("merchant", "/auth/otp/send", { method: "POST", body: { phone } });
      setCode("");
      resend.start();
      setStep("otp");
    });

  const verifyOtp = () =>
    run(async () => {
      const result = await portalFetch<VerifyResult>("merchant", "/auth/otp/verify", {
        method: "POST",
        body: { phone, code, deviceId },
      });
      if (result.status === "SIGNUP_REQUIRED") {
        setSignupTicket(result.signupTicket);
        setStep("signup");
      } else {
        setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
        navigate("/merchant");
      }
    });

  const completeSignup = () =>
    run(async () => {
      const result = await portalFetch<Extract<VerifyResult, { status: "LOGIN" }>>("merchant", "/auth/signup/complete", {
        method: "POST",
        body: { signupTicket, deviceId, name: name.trim() },
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      navigate("/merchant");
    });

  return (
    <AuthLayout
      eyebrow="RetroMobi for shops"
      title="List your fleet, lawfully."
      tagline="Every vehicle you list is named on your Rent-a-Motorcycle licence, visible to riders before they book."
    >
      {step === "phone" && (
        <AuthForm onSubmit={sendOtp}>
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Merchant sign-in</h1>
          <p className="text-sm text-ink-3 mb-6">Sign in or set up your shop with your phone number.</p>
          {error && <ErrorBox text={error} />}
          <PhoneInput value={localPhone} onChange={setLocalPhone} country={country} onCountryChange={setCountry} autoFocus />
          <SubmitButton busy={busy} disabled={localPhone.length < 10}>
            Continue
          </SubmitButton>
        </AuthForm>
      )}

      {step === "otp" && (
        <AuthForm onSubmit={verifyOtp}>
          <BackRow onBack={() => setStep("phone")} />
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Verify your number</h1>
          <p className="text-sm text-ink-3 mb-6">
            We sent a 6-digit code to <span className="text-ink font-medium">{phone}</span>.
          </p>
          {error && <ErrorBox text={error} />}
          <OtpInput value={code} onChange={setCode} />
          <SubmitButton busy={busy} disabled={code.length < 6}>
            Verify
          </SubmitButton>
          <ResendRow resend={resend} onResend={sendOtp} />
        </AuthForm>
      )}

      {step === "signup" && (
        <AuthForm onSubmit={completeSignup}>
          <BackRow onBack={() => setStep("phone")} />
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Almost there</h1>
          <p className="text-sm text-ink-3 mb-6">New number — tell us your name to finish setting up.</p>
          {error && <ErrorBox text={error} />}
          <TextField label="Your name" value={name} onChange={setName} autoFocus />
          <SubmitButton busy={busy} disabled={!name.trim()}>
            Create account
          </SubmitButton>
        </AuthForm>
      )}
    </AuthLayout>
  );
}
