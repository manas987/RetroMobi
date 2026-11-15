import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AuthLayout } from "../../components/AuthLayout";
import { PhoneInput, DEFAULT_COUNTRY } from "../../components/PhoneInput";
import type { Country } from "../../lib/countries";
import { OtpInput } from "../../components/OtpInput";
import { AuthForm, BackRow, ErrorBox, ResendRow, SubmitButton } from "../../components/AuthFormBits";
import { useCountdown } from "../../lib/useCountdown";
import { usePortalSession, portalFetch, PortalApiError } from "../../lib/portal";

export function AdminLogin() {
  const { setTokens, deviceId } = usePortalSession("admin");
  const [, navigate] = useLocation();
  const resend = useCountdown(30);

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const phone = `${country.dial}${localPhone}`;
  const [code, setCode] = useState("");
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
      await portalFetch("admin", "/auth/otp/send", { method: "POST", body: { phone } });
      setCode("");
      resend.start();
      setStep("otp");
    });

  const verifyOtp = () =>
    run(async () => {
      const result = await portalFetch<any>("admin", "/auth/otp/verify", {
        method: "POST",
        body: { phone, code, deviceId },
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken, role: result.admin?.role });
      navigate("/admin");
    });

  return (
    <AuthLayout
      eyebrow="RetroMobi internal"
      title="Control room."
      tagline="Licensing, verification and dispute oversight for the whole marketplace."
    >
      {step === "phone" && (
        <AuthForm onSubmit={sendOtp}>
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Internal sign-in</h1>
          <p className="text-sm text-ink-3 mb-1">Admin accounts are provisioned ahead of time.</p>
          <p className="text-sm text-ink-3 mb-6">There's no self-serve signup here.</p>
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
    </AuthLayout>
  );
}
