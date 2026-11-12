import { Link } from "wouter";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useT } from "../../../i18n";
import { Button, Card } from "../ui/ui";
import { StageChip } from "./VehiclesStep";
import type { SetupData } from "./GetListedChip";

export function StatusScreen({ setup, canFix, onFix }: { setup: SetupData; canFix: boolean; onFix: () => void }) {
  const { t } = useT();
  const s = setup.shop.verificationStatus;
  const view =
    s === "VERIFIED" ? { Icon: CheckCircle2, cls: "bg-verified-soft text-verified", title: t("setup.statusApproved") }
    : s === "REJECTED" ? { Icon: XCircle, cls: "bg-danger-soft text-danger", title: t("setup.statusRejected") }
    : { Icon: Clock, cls: "bg-info-soft text-info", title: t("setup.statusChecking") };
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className={`flex items-start gap-3 rounded-card p-5 ${view.cls}`}>
        <view.Icon className="h-8 w-8 shrink-0" aria-hidden />
        <div>
          <h2 className="text-xl font-semibold">{view.title}</h2>
          {s === "REJECTED" && setup.shop.rejectionNote && <p className="mt-1 text-sm">{setup.shop.rejectionNote}</p>}
          {s === "REJECTED" && canFix && <Button variant="primary" className="mt-3" onClick={onFix}>{t("setup.fixAndSend")}</Button>}
        </div>
      </div>
      <Card title={t("setup.vehiclesReady", { n: setup.completeVehicles })}>
        <ul className="mb-4 flex flex-col gap-2">
          {setup.vehicles.map((v) => (
            <li key={v.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{v.make} {v.model} <span className="tnum font-normal text-ink-3">{v.registrationNumber}</span></span>
              <StageChip stage={v.stage} />
            </li>
          ))}
        </ul>
        <Link href="/merchant/fleet?view=setup"><Button variant="secondary" className="w-full">{t("setup.openFleet")}</Button></Link>
      </Card>
    </div>
  );
}
