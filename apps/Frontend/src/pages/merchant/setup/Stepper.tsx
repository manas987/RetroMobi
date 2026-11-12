import type { ReactNode } from "react";
import { Check, Info } from "lucide-react";
import { useT, type TKey } from "../../../i18n";
import { Button, Card, ErrorNote } from "../ui/ui";

export const STEPS = ["shop", "licence", "vehicles", "payout", "submit"] as const;
export type StepKey = (typeof STEPS)[number];

/** Left rail on desktop; on a phone just "Step 2 of 5" and a bar. */
export function Stepper({ current, done, status, onPick }: { current: StepKey; done: Record<StepKey, boolean>; status: Record<StepKey, string>; onPick: (k: StepKey) => void }) {
  const { t } = useT();
  const idx = STEPS.indexOf(current);
  return (
    <>
      <div className="lg:hidden mb-4">
        <p className="text-sm font-semibold text-ink">{t("setup.stepOf", { n: idx + 1 })}</p>
        <div className="mt-2 h-2 rounded-full bg-surface-3">
          <div className="h-2 rounded-full bg-amber-edge" style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
      <nav className="hidden lg:flex w-64 shrink-0 flex-col gap-1" aria-label={t("setup.title")}>
        {STEPS.map((k, i) => (
          <button
            key={k}
            type="button"
            aria-current={k === current ? "step" : undefined}
            onClick={() => onPick(k)}
            className={`flex items-center gap-3 rounded-2xl p-3 text-left ${k === current ? "bg-surface shadow-card" : "hover:bg-surface-3"}`}
          >
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done[k] ? "bg-verified-soft text-verified" : "bg-surface-3 text-ink-2"}`}>
              {done[k] ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{t(`setup.step_${k}` as TKey)}</span>
              <span className="block text-xs text-ink-3">{status[k]}</span>
            </span>
          </button>
        ))}
      </nav>
    </>
  );
}

/** The frame every step shares: title, why box, inputs, Back and Save & continue. */
export function StepCard({
  title,
  why,
  children,
  step,
  gated,
  onBack,
  onNext,
  onSave,
  saveLabel,
  busy,
  disabled,
  error,
}: {
  title: ReactNode;
  why: ReactNode;
  children: ReactNode;
  step: StepKey;
  /** The role can't do this step: show askOwner and a Next button instead of inputs. */
  gated?: boolean;
  onBack: () => void;
  onNext: () => void;
  onSave?: () => void;
  saveLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
}) {
  const { t } = useT();
  return (
    <Card className="max-w-2xl w-full">
      <h2 className="text-2xl font-semibold text-ink mb-3">{title}</h2>
      <div className="mb-5 flex gap-2 rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-ink-3" aria-hidden />
        <p><span className="font-semibold text-ink">{t("common.whyNeeded")}. </span>{why}</p>
      </div>
      {gated ? <p className="mb-5 text-sm text-ink-2">{t("common.askOwner")}</p> : children}
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-4">
        {step !== "shop" ? <Button variant="ghost" size="lg" onClick={onBack}>{t("common.back")}</Button> : <span />}
        {gated || !onSave ? (
          step !== "submit" && <Button variant="primary" size="lg" onClick={onNext}>{t("setup.nextStep")}</Button>
        ) : (
          <Button variant="primary" size="lg" disabled={busy || disabled} onClick={onSave}>
            {busy ? t("common.saving") : (saveLabel ?? t("setup.saveContinue"))}
          </Button>
        )}
      </div>
    </Card>
  );
}
