import { MerchantLayout, useMerchantShop } from "./Layout";
import { useT } from "../../i18n";
import { ErrorNote, LoadingRows, PageHeader } from "./ui/ui";
import { useMerchantQuery, useUrlParam, useUrlString } from "./query";
import type { Permission } from "../../lib/permissions";
import { STEPS, Stepper, type StepKey } from "./setup/Stepper";
import type { SetupData } from "./setup/GetListedChip";
import { ShopStep } from "./setup/ShopStep";
import { LicenceStep } from "./setup/LicenceStep";
import { VehiclesStep } from "./setup/VehiclesStep";
import { PayoutStep } from "./setup/PayoutStep";
import { SubmitStep } from "./setup/SubmitStep";
import { StatusScreen } from "./setup/StatusScreen";

const NEEDS: Record<StepKey, Permission> = { shop: "shop:write", licence: "shop:write", vehicles: "fleet:write", payout: "payouts:write", submit: "shop:write" };

export function MerchantSetup() {
  return (
    <MerchantLayout>
      <SetupBody />
    </MerchantLayout>
  );
}

function SetupBody() {
  const { token, shopId, can } = useMerchantShop();
  const { t } = useT();
  const q = useMerchantQuery<SetupData>(shopId ? `/shops/${shopId}/setup` : null, token);
  const [stepParam, setStep] = useUrlParam<StepKey | "">("step", [...STEPS, ""], "");
  const [vehicleId, setVehicle] = useUrlString("vehicle");

  const header = <PageHeader title={t("setup.title")} subtitle={t("setup.subtitle")} />;
  if (!shopId || q.isPending) return <>{header}<LoadingRows /></>;
  if (q.isError) return <>{header}<ErrorNote onRetry={() => q.refetch()} /></>;
  const setup = q.data;

  const done: Record<StepKey, boolean> = { shop: setup.steps.shop, licence: setup.steps.licence, vehicles: setup.steps.vehicles, payout: setup.steps.payout, submit: setup.steps.submitted };
  const firstOpen = STEPS.find((k) => !done[k]);
  const current = vehicleId ? "vehicles" : stepParam || firstOpen;
  const idx = current ? STEPS.indexOf(current) : -1;
  const go = (k: StepKey) => { setVehicle(null); setStep(k); };

  if (!current) return <>{header}<StatusScreen setup={setup} canFix={can("shop:write")} onFix={() => go("shop")} /></>;

  const status: Record<StepKey, string> = {
    shop: t(done.shop ? "setup.st_done" : "setup.st_todo"),
    // A licence that's in doesn't make the step done while other required papers are missing.
    licence: !setup.steps.licence && ["ACTIVE", "PENDING"].includes(setup.licence.status) ? t("setup.st_todo") : t(`setup.st_licence_${setup.licence.status}`),
    vehicles: t("setup.vehiclesReady", { n: setup.completeVehicles }),
    payout: t(`setup.st_payout_${setup.payoutAccount.status}`),
    submit: t(done.submit ? "setup.st_done" : "setup.st_todo"),
  };
  const props = {
    token,
    shopId,
    can: can(NEEDS[current]),
    back: () => go(STEPS[Math.max(0, idx - 1)]!),
    next: () => go(STEPS[Math.min(STEPS.length - 1, idx + 1)]!),
    advance: () => { setVehicle(null); setStep(null); },
  };

  return (
    <>
      {header}
      <div className="lg:flex lg:items-start lg:gap-8">
        <Stepper current={current} done={done} status={status} onPick={go} />
        {current === "shop" && <ShopStep {...props} />}
        {current === "licence" && <LicenceStep {...props} setup={setup} />}
        {current === "vehicles" && <VehiclesStep {...props} setup={setup} vehicleId={vehicleId} setVehicle={setVehicle} />}
        {current === "payout" && <PayoutStep {...props} setup={setup} />}
        {current === "submit" && <SubmitStep {...props} setup={setup} goStep={go} />}
      </div>
    </>
  );
}
