import { Link } from "wouter";
import { Bike, ChevronLeft, Plus } from "lucide-react";
import { useT, type TKey } from "../../../i18n";
import type { Tone } from "../../../lib/bookingStage";
import { Button, Chip, EmptyState, TONE } from "../ui/ui";
import { StepCard } from "./Stepper";
import { VehicleSetup } from "./VehicleSetup";
import type { SetupData, VehicleStage } from "./GetListedChip";
import type { StepProps } from "./ShopStep";

export const STAGE_TONE: Record<VehicleStage, Tone> = { NEEDS_INFO: "muted", NEEDS_FIXING: "bad", CHECKING: "info", READY: "attention", SHOWING: "good" };

export function StageChip({ stage }: { stage: VehicleStage }) {
  const { t } = useT();
  return <Chip tone={STAGE_TONE[stage]}>{t(`setup.stage_${stage}` as TKey)}</Chip>;
}

export function VehiclesStep({ setup, vehicleId, setVehicle, ...p }: StepProps & { setup: SetupData; vehicleId: string | null; setVehicle: (id: string | null) => void }) {
  const { t } = useT();
  const open = setup.vehicles.find((v) => v.id === vehicleId);
  const min = setup.minVehiclesForShop;

  return (
    <StepCard step="vehicles" title={t("setup.vehiclesTitle")} why={t("setup.vehiclesWhy")} gated={!p.can} onBack={p.back} onNext={p.next} onSave={p.next} saveLabel={t("common.continue")} disabled={!setup.steps.vehicles} missing={[t("setup.need_vehicle")]}>
      {open ? (
        <>
          <button type="button" onClick={() => setVehicle(null)} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink-2">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t("setup.allVehicles")}
          </button>
          <p className="mb-3 text-base font-semibold text-ink">{open.make} {open.model} <span className="tnum font-normal text-ink-3">{open.registrationNumber}</span></p>
          <VehicleSetup key={open.id} vehicle={open} token={p.token} />
        </>
      ) : setup.vehicles.length === 0 ? (
        <EmptyState icon={Bike} text={t("setup.noVehicles")} action={<Link href="/merchant/fleet?add=1"><Button variant="primary" icon={Plus}>{t("setup.addVehicle")}</Button></Link>} />
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-2">{t("setup.vehiclesTop", { n: setup.completeVehicles, min })}</p>
          <div className="mb-4 h-2 rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={min} aria-valuenow={Math.min(setup.completeVehicles, min)}>
            <div className={`h-2 rounded-full ${TONE.good.dot}`} style={{ width: `${Math.min(1, setup.completeVehicles / min) * 100}%` }} />
          </div>
          <ul className="mb-3 flex flex-col gap-2">
            {setup.vehicles.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-surface-2 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{v.make} {v.model}</span>
                  <span className="tnum block text-xs text-ink-3">{v.registrationNumber} · {t("setup.doneOf", { n: 5 - v.missing.length })}</span>
                </span>
                <StageChip stage={v.stage} />
                <Button onClick={() => setVehicle(v.id)}>{t("setup.setUp")}</Button>
              </li>
            ))}
          </ul>
          <Link href="/merchant/fleet?add=1" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink underline underline-offset-2">
            <Plus className="h-4 w-4" aria-hidden />{t("setup.addVehicle")}
          </Link>
        </>
      )}
    </StepCard>
  );
}
