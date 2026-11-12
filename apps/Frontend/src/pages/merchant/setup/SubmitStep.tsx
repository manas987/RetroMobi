import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { portalFetch } from "../../../lib/portal";
import { useT, type TKey } from "../../../i18n";
import { errorText, useInvalidateMerchant } from "../query";
import { StepCard, type StepKey } from "./Stepper";
import type { SetupData } from "./GetListedChip";
import type { StepProps } from "./ShopStep";

const CHECKS = ["shop", "licence", "vehicles", "payout"] as const;

export function SubmitStep({ setup, goStep, ...p }: StepProps & { setup: SetupData; goStep: (k: StepKey) => void }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = CHECKS.every((k) => setup.steps[k]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${p.shopId}/verification`, { method: "POST", token: p.token });
      for (const v of setup.vehicles.filter((x) => x.canSubmit)) {
        await portalFetch("merchant", `/vehicles/${v.id}/verification`, { method: "POST", token: p.token });
      }
      await invalidate();
      p.advance();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepCard step="submit" title={t("setup.submitTitle")} why={t("setup.submitWhy")} gated={!p.can} onBack={p.back} onNext={p.next} onSave={send} saveLabel={t("setup.sendShop")} busy={busy} disabled={!ready || setup.steps.submitted} error={error}>
      <ul className="mb-4 flex flex-col gap-2">
        {CHECKS.map((k) => {
          const ok = setup.steps[k];
          const Icon = ok ? CheckCircle2 : XCircle;
          return (
            <li key={k}>
              <button type="button" onClick={() => goStep(k)} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface-2 px-3 text-left text-sm font-medium text-ink">
                <Icon className={`h-5 w-5 shrink-0 ${ok ? "text-verified" : "text-danger"}`} aria-hidden />
                {t(`setup.step_${k}` as TKey)}
                {k === "vehicles" && <span className="ml-auto text-xs text-ink-3">{t("setup.vehiclesReady", { n: setup.completeVehicles })}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {setup.steps.submitted && <p className="mb-4 text-sm font-semibold text-verified">{t("setup.alreadySent")}</p>}
    </StepCard>
  );
}
