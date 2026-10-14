import { useState } from "react";
import { useLocation } from "wouter";
import { usePortalSession, portalFetch, PortalApiError } from "../../lib/portal";

export function AdminLogin() {
  const { setTokens, deviceId } = usePortalSession("admin");
  const [, navigate] = useLocation();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("+91");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await portalFetch("admin", "/auth/otp/send", { method: "POST", body: { phone } });
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
      const result = await portalFetch<any>("admin", "/auth/otp/verify", {
        method: "POST",
        body: { phone, code, deviceId },
      });
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken, role: result.admin?.role });
      navigate("/admin");
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-ink">
      <div className="w-full max-w-sm bg-surface rounded-panel p-7">
        <p className="text-xs font-medium text-ink-3 tracking-wide uppercase">RetroMobi internal</p>
        <h1 className="text-xl font-semibold text-ink mt-1 mb-6">Control room sign-in</h1>

        {error && <p className="mb-4 text-sm text-danger bg-danger-soft rounded-row px-3 py-2">{error}</p>}

        {step === "phone" && (
          <form onSubmit={sendOtp} className="flex flex-col gap-3">
            <p className="text-xs text-ink-3">
              Admin accounts are provisioned ahead of time — there's no self-serve signup here.
            </p>
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
