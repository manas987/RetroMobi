import { useT } from "../../../i18n";
import { PayoutAccountSection } from "../money/PayoutAccount";
import { useInvalidateMerchant } from "../query";
import { StepCard } from "./Stepper";
import type { SetupData } from "./GetListedChip";
import type { StepProps } from "./ShopStep";

export function PayoutStep({ setup, ...p }: StepProps & { setup: SetupData }) {
  const { t } = useT();
  const invalidate = useInvalidateMerchant();
  return (
    <StepCard step="payout" title={t("setup.payoutTitle")} why={t("setup.payoutWhy")} gated={!p.can} onBack={p.back} onNext={p.next} onSave={p.next} saveLabel={t("common.continue")} disabled={!setup.steps.payout}>
      <div className="mb-4"><PayoutAccountSection onChanged={() => void invalidate()} /></div>
    </StepCard>
  );
}
