import { useState } from "react";
import { useLocation } from "wouter";
import { usePortalSession, portalFetch, PortalApiError } from "../../lib/portal";

type Step = "phone" | "otp" | "signup";

export function MerchantLogin() {
  const { setTokens, deviceId } = usePortalSession("merchant");
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+91");
  const [code, setCode] = useState("");
  const [signupTicket, setSignupTicket] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await portalFetch("merchant", "/auth/otp/send", { method: "POST", body: { phone } });
      setStep("otp");
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await portalFetch<any>("merchant", "/auth/otp/verify", {
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
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function completeSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await portalFetch<any>("merchant", "/auth/signup/complete", {
        method: "POST",
        body: { signupTicket, deviceId, name },
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      navigate("/merchant");
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "Couldn't finish signing up.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-surface-2">
      <div className="w-full max-w-sm bg-surface rounded-panel border border-line p-7">
        <p className="text-xs font-medium text-ink-3 tracking-wide uppercase">RetroMobi for shops</p>
        <h1 className="text-xl font-semibold text-ink mt-1 mb-6">Merchant sign-in</h1>

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
            <p className="text-sm text-ink-3">
              Code sent to {phone}. In dev, check the backend log for the <code>[dev-fallback]</code> line.
            </p>
            <Field label="6-digit code">
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-row border border-line-strong px-3 py-2 text-sm outline-none focus:border-ink tnum"
              />
            </Field>
            <SubmitButton busy={busy}>Verify</SubmitButton>
          </form>
        )}

        {step === "signup" && (
          <form onSubmit={completeSignup} className="flex flex-col gap-3">
            <p className="text-sm text-ink-3">New number — tell us your name to finish setting up.</p>
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
