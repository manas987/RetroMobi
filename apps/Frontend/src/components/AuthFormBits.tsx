import type { useCountdown } from "../lib/useCountdown";
import { SMS_FALLBACK_ENABLED } from "../lib/phoneOtp";

/** Offered even when WhatsApp delivered: not every rider uses WhatsApp. Absent
 *  entirely when this deployment has no Firebase config. */
export function SmsInsteadRow({ onClick }: { onClick: () => void }) {
  if (!SMS_FALLBACK_ENABLED) return null;
  return (
    <p className="mt-2 text-sm text-ink-3">
      No WhatsApp?{" "}
      <button type="button" onClick={onClick} className="text-ink font-medium hover:underline">
        Send by SMS instead
      </button>
    </p>
  );
}

export function BackRow({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  );
}

export function ResendRow({ resend, onResend }: { resend: ReturnType<typeof useCountdown>; onResend: () => void }) {
  return (
    <p className="mt-4 text-sm text-ink-3">
      Didn't get it?{" "}
      {resend.remaining > 0 ? (
        <span className="text-ink-4">Resend in 00:{String(resend.remaining).padStart(2, "0")}</span>
      ) : (
        <button type="button" onClick={onResend} className="text-ink font-medium hover:underline">
          Resend code
        </button>
      )}
    </p>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 mb-4">
      <span className="text-xs font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}

export function ErrorBox({ text }: { text: string }) {
  return <p className="mb-4 text-sm text-danger bg-danger-soft rounded-row px-3 py-2">{text}</p>;
}

/** A sign-in step: Enter submits it. The browser skips Enter while the submit button is disabled. */
export function AuthForm({ onSubmit, children }: { onSubmit: () => void; children: React.ReactNode }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** Without `onClick` it submits the surrounding form (see AuthForm). */
export function SubmitButton({
  busy,
  disabled,
  onClick,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      disabled={busy || disabled}
      onClick={onClick}
      className="mt-2 w-full h-11 rounded-row bg-ink text-surface font-semibold text-sm disabled:opacity-40 hover:bg-ink-2 transition-colors"
    >
      {busy ? "Working…" : children}
    </button>
  );
}

export function TextField({
  label,
  type = "text",
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full border border-line-strong px-3.5 py-2.5 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink transition-colors"
      />
    </Field>
  );
}
