import { useState } from "react";
import { useLocation, useSearch as useLocationSearch } from "wouter";
import { AuthLayout } from "../../components/AuthLayout";
import loginForest from "../../assets/login-forest.png";
import { PhoneInput, DEFAULT_COUNTRY } from "../../components/PhoneInput";
import type { Country } from "../../lib/countries";
import { OtpInput } from "../../components/OtpInput";
import { BackRow, ErrorBox, ResendRow, SmsInsteadRow, SubmitButton, TextField } from "../../components/AuthFormBits";
import { useCountdown } from "../../lib/useCountdown";
import { usePortalSession, portalFetch, PortalApiError } from "../../lib/portal";
import { usePhoneOtp } from "../../lib/phoneOtp";

// Email is optional: "skipEmail" is the confirmation shown when someone skips it.
type Step = "phone" | "otp" | "email" | "emailOtp" | "skipEmail" | "name";

export function CustomerLogin() {
  const { setTokens, deviceId } = usePortalSession("user");
  const [, navigate] = useLocation();
  const next = new URLSearchParams(useLocationSearch()).get("next") || "/";
  const resend = useCountdown(30);
  const otp = usePhoneOtp("user");

  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const phone = `${country.dial}${localPhone}`;
  const [code, setCode] = useState("");
  const [signupTicket, setSignupTicket] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailVerificationTicket, setEmailVerificationTicket] = useState("");
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
      await otp.send(phone);
      resend.start();
      setStep("otp");
    });

  const sendBySms = () =>
    run(async () => {
      await otp.sendBySms(phone);
      setCode("");
      resend.start();
    });

  const verifyOtp = () =>
    run(async () => {
      const result = await otp.verify<any>(phone, code, deviceId);
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
          ...(emailVerificationTicket ? { emailVerificationTicket } : {}),
        },
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      navigate(next);
    });

  const skipEmail = () => {
    setError(null);
    setEmailVerificationTicket("");
    setStep("skipEmail");
  };

  return (
    <AuthLayout
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
            We sent a 6-digit code {otp.via === "sms" ? "by SMS" : "on WhatsApp"} to{" "}
            <span className="text-ink font-medium">{phone}</span>.
          </p>
          {error && <ErrorBox text={error} />}
          <OtpInput value={code} onChange={setCode} />
          <SubmitButton busy={busy} onClick={verifyOtp} disabled={code.length < 6}>
            Verify
          </SubmitButton>
          <ResendRow resend={resend} onResend={otp.via === "sms" ? sendBySms : sendOtp} />
          {otp.via === "whatsapp" && <SmsInsteadRow onClick={sendBySms} />}
        </div>
      )}

      {step === "email" && (
        <div>
          <BackRow onBack={() => setStep("otp")} />
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Add your email</h1>
          <p className="text-sm text-ink-3 mb-6">Optional. We send booking confirmations and invoices here.</p>
          {error && <ErrorBox text={error} />}
          <TextField label="Email address" type="email" value={email} onChange={setEmail} autoFocus />
          <SubmitButton busy={busy} onClick={sendEmailOtp} disabled={!email}>
            Send code
          </SubmitButton>
          <button
            type="button"
            onClick={skipEmail}
            className="mt-4 w-full text-center text-sm font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            Skip for now
          </button>
        </div>
      )}

      {step === "skipEmail" && (
        <div>
          <BackRow onBack={() => setStep("email")} />
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Continue without email?</h1>
          <div role="alert" className="mt-4 mb-6 rounded-row border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
            <p>You can still book. Booking updates and your pickup code come on WhatsApp.</p>
            <p className="mt-2">Without an email you won't get booking confirmations or invoices by email.</p>
          </div>
          <SubmitButton busy={false} onClick={() => setStep("name")}>
            Continue without email
          </SubmitButton>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="mt-4 w-full text-center text-sm font-medium text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            Add an email instead
          </button>
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
          <BackRow onBack={() => setStep(emailVerificationTicket ? "emailOtp" : "skipEmail")} />
          <h1 className="text-2xl font-semibold text-ink mt-3 mb-1">Almost there</h1>
          <p className="text-sm text-ink-3 mb-6">What should we call you?</p>
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
