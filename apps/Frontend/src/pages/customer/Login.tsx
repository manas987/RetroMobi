import { useState } from "react";
import { Link, useLocation } from "wouter";
import { usePortalSession, portalFetch, PortalApiError } from "../../lib/portal";

type Step = "phone" | "otp" | "email" | "emailOtp" | "name";

export function CustomerLogin() {
  const { setTokens, deviceId } = usePortalSession("user");
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+91");
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

  const sendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await portalFetch("user", "/auth/otp/send", { method: "POST", body: { phone } });
      setStep("otp");
    });
  };

  const verifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
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
        navigate("/");
      }
    });
  };

  const sendEmailOtp = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await portalFetch("user", "/auth/email-otp/send", { method: "POST", body: { signupTicket, email } });
      setStep("emailOtp");
    });
  };

  const verifyEmailOtp = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const result = await portalFetch<any>("user", "/auth/email-otp/verify", {
        method: "POST",
        body: { signupTicket, email, code: emailCode },
      });
      setEmailVerificationTicket(result.emailVerificationTicket);
      setStep("name");
    });
  };

  const completeSignup = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const result = await portalFetch<any>("user", "/auth/signup/complete", {
        method: "POST",
        body: { signupTicket, deviceId, name, emailVerificationTicket },
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      navigate("/");
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-surface-2">
      <div className="w-full max-w-sm bg-surface rounded-panel border border-line p-7">
        <Link href="/" className="text-sm text-ink-3 hover:text-ink transition-colors">
          ← Back to retromobi
        </Link>
        <h1 className="text-xl font-semibold text-ink mt-4 mb-6">Sign in</h1>

          {error && <p className="mb-4 text-sm text-danger bg-danger-soft rounded-row px-3 py-2">{error}</p>}

          {step === "phone" && (
            <form onSubmit={sendOtp} className="flex flex-col gap-3">
              <Field label="Phone number">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+919812345678"
                  className="w-full rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </Field>
              <SubmitButton busy={busy}>Send code</SubmitButton>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verifyOtp} className="flex flex-col gap-3">
              <p className="text-sm text-ink-3">Code sent to {phone}.</p>
              <Field label="6-digit code">
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink tnum"
                />
              </Field>
              <SubmitButton busy={busy}>Verify</SubmitButton>
            </form>
          )}

          {step === "email" && (
            <form onSubmit={sendEmailOtp} className="flex flex-col gap-3">
              <p className="text-sm text-ink-3">New number — we also verify an email before you can book.</p>
              <Field label="Email address">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </Field>
              <SubmitButton busy={busy}>Send email code</SubmitButton>
            </form>
          )}

          {step === "emailOtp" && (
            <form onSubmit={verifyEmailOtp} className="flex flex-col gap-3">
              <p className="text-sm text-ink-3">Code sent to {email}.</p>
              <Field label="6-digit code">
                <input
                  type="text"
                  inputMode="numeric"
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value)}
                  className="w-full rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink tnum"
                />
              </Field>
              <SubmitButton busy={busy}>Verify</SubmitButton>
            </form>
          )}

          {step === "name" && (
            <form onSubmit={completeSignup} className="flex flex-col gap-3">
              <Field label="Your name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </Field>
              <SubmitButton busy={busy}>Create account</SubmitButton>
            </form>
          )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-2 h-10 rounded-row bg-ink text-surface font-medium text-sm disabled:opacity-60"
    >
      {busy ? "Working…" : children}
    </button>
  );
}
