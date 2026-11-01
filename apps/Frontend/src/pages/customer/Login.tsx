import { useState } from "react";
import { useLocation, useSearch as useLocationSearch } from "wouter";
import { AuthLayout } from "../../components/AuthLayout";
import loginForest from "../../assets/login-forest.png";
import { PhoneInput, DEFAULT_COUNTRY } from "../../components/PhoneInput";
import type { Country } from "../../lib/countries";
import { OtpInput } from "../../components/OtpInput";
import { BackRow, ErrorBox, ResendRow, SubmitButton, TextField } from "../../components/AuthFormBits";
import { useCountdown } from "../../lib/useCountdown";
import { usePortalSession, portalFetch, PortalApiError } from "../../lib/portal";
import { GOOGLE_CLIENT_ID, renderGoogleButton } from "../../lib/google";
import { useEffect, useRef } from "react";

type Step = "phone" | "otp" | "email" | "emailOtp" | "name";

/** Google insists on rendering its own button, so this hands it a mount point. */
function GoogleButton({
  onToken,
  onError,
}: {
  onToken: (idToken: string) => void;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) renderGoogleButton(ref.current, onToken, onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="flex justify-center" />;
}

export function CustomerLogin() {
  const { setTokens, deviceId } = usePortalSession("user");
  const [, navigate] = useLocation();
  const next = new URLSearchParams(useLocationSearch()).get("next") || "/";
  const resend = useCountdown(30);

  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const phone = `${country.dial}${localPhone}`;
  const [code, setCode] = useState("");
  const [signupTicket, setSignupTicket] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailVerificationTicket, setEmailVerificationTicket] = useState("");
  // Google's ticket substitutes for the email one — the backend's signup
  // schema requires exactly one of the two, and takes the verified email from
  // whichever arrives. So choosing Google skips both email steps rather than
  // merely pre-filling them.
  const [googlePrefillTicket, setGooglePrefillTicket] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      await portalFetch("user", "/auth/otp/send", { method: "POST", body: { phone } });
      resend.start();
      setStep("otp");
    });

  const verifyOtp = () =>
    run(async () => {
      const result = await portalFetch<any>("user", "/auth/otp/verify", {
        method: "POST",
        body: { phone, code, deviceId },
      });
      if (result.status === "SIGNUP_REQUIRED") {
        setSignupTicket(result.signupTicket);
        setStep("email");
      } else {
        setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
        navigate(next);
      }
    });

  const sendEmailOtp = () =>
    run(async () => {
      await portalFetch("user", "/auth/email-otp/send", { method: "POST", body: { signupTicket, email } });
      resend.start();
      setStep("emailOtp");
    });

  const verifyEmailOtp = () =>
    run(async () => {
      const result = await portalFetch<any>("user", "/auth/email-otp/verify", {
        method: "POST",
        body: { signupTicket, email, code: emailCode },
      });
      setEmailVerificationTicket(result.emailVerificationTicket);
      setStep("name");
    });

  const completeSignup = () =>
    run(async () => {
      const result = await portalFetch<any>("user", "/auth/signup/complete", {
        method: "POST",
        body: {
          signupTicket,
          deviceId,
          name,
          ...(googlePrefillTicket ? { googlePrefillTicket } : { emailVerificationTicket }),
        },
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      navigate(next);
    });

  /** Exchanges Google's ID token for a prefill ticket and jumps to the name
   *  step with the name Google gave us already filled in. */
  const useGoogle = (idToken: string) =>
    run(async () => {
      const result = await portalFetch<{ googlePrefillTicket: string; name?: string; email?: string }>(
        "user",
        "/auth/google",
        { method: "POST", body: { idToken } },
      );
      setGooglePrefillTicket(result.googlePrefillTicket);
      if (result.email) setEmail(result.email);
      if (result.name) setName(result.name);
      setStep("name");
    });

  return (
    <AuthLayout
      eyebrow="RetroMobi"
      title="Ride the road less ordinary."
      tagline="Licensed scooters and motorcycles across Dehradun, Haridwar and Rishikesh."
      backgroundImage={loginForest}
    >
      {step === "phone" && (
        <div>
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Welcome to RetroMobi</h1>
          <p className="text-sm text-ink-3 mb-6">Sign in or create an account with your phone number.</p>
          {error && <ErrorBox text={error} />}
          <PhoneInput value={localPhone} onChange={setLocalPhone} country={country} onCountryChange={setCountry} autoFocus />
          <SubmitButton busy={busy} onClick={sendOtp} disabled={localPhone.length < 10}>
            Continue
          </SubmitButton>
          <p className="mt-5 text-xs text-ink-4 text-center">
            By continuing, you agree to RetroMobi's Terms and Privacy notice.
          </p>
        </div>
      )}

      {step === "otp" && (
        <div>
          <BackRow onBack={() => setStep("phone")} />
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Verify your number</h1>
          <p className="text-sm text-ink-3 mb-6">
            We sent a 6-digit code to <span className="text-ink font-medium">{phone}</span>.
          </p>
          {error && <ErrorBox text={error} />}
          <OtpInput value={code} onChange={setCode} />
          <SubmitButton busy={busy} onClick={verifyOtp} disabled={code.length < 6}>
            Verify
          </SubmitButton>
          <ResendRow resend={resend} onResend={sendOtp} />
        </div>
      )}

      {step === "email" && (
        <div>
          <BackRow onBack={() => setStep("otp")} />
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Verify your email</h1>
          <p className="text-sm text-ink-3 mb-6">New number — we also verify an email before you can book.</p>
          {error && <ErrorBox text={error} />}
          <TextField label="Email address" type="email" value={email} onChange={setEmail} autoFocus />
          <SubmitButton busy={busy} onClick={sendEmailOtp} disabled={!email}>
            Send code
          </SubmitButton>

          {/* Only when Google is configured for this deployment — otherwise
              there is no button and the email path is the only path. */}
          {GOOGLE_CLIENT_ID && (
            <>
              <div className="flex items-center gap-3 my-5">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs text-ink-4">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <GoogleButton onToken={useGoogle} onError={setError} />
              <p className="mt-3 text-xs text-ink-4 text-center">
                Google confirms your email, so there's no code to enter.
              </p>
            </>
          )}
        </div>
      )}

      {step === "emailOtp" && (
        <div>
          <BackRow onBack={() => setStep("email")} />
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Verify your email</h1>
          <p className="text-sm text-ink-3 mb-6">Code sent to {email}.</p>
          {error && <ErrorBox text={error} />}
          <OtpInput value={emailCode} onChange={setEmailCode} />
          <SubmitButton busy={busy} onClick={verifyEmailOtp} disabled={emailCode.length < 6}>
            Verify
          </SubmitButton>
          <ResendRow resend={resend} onResend={sendEmailOtp} />
        </div>
      )}

      {step === "name" && (
        <div>
          <BackRow onBack={() => setStep(googlePrefillTicket ? "email" : "emailOtp")} />
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Almost there</h1>
          <p className="text-sm text-ink-3 mb-6">
            {googlePrefillTicket && email ? `Signing up with ${email}.` : "What should we call you?"}
          </p>
          {error && <ErrorBox text={error} />}
          <TextField label="Your name" value={name} onChange={setName} autoFocus />
          <SubmitButton busy={busy} onClick={completeSignup} disabled={!name}>
            Create account
          </SubmitButton>
        </div>
      )}
    </AuthLayout>
  );
}
