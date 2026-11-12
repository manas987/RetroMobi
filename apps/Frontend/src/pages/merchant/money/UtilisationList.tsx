import { Bike } from "lucide-react";
import { useT } from "../../../i18n";
import { SERIES } from "../ui/ui";

export interface Util { id: string; registrationNumber: string; make: string; model: string; busyDays: number }

export function UtilisationList({ vehicles, rangeDays }: { vehicles: Util[]; rangeDays: number }) {
  const { t } = useT();
  const sorted = [...vehicles].sort((a, b) => b.busyDays - a.busyDays);
  const name = (v: Util) => `${v.make} ${v.model} · ${v.registrationNumber}`;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return (
    <>
      {sorted.length > 1 && first && last && (
        <div className="grid gap-3 @md:grid-cols-2 mb-5">
          <p className="rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">{t("money.busiest", { vehicle: name(first) })}</p>
          <p className="rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">{t("money.leastUsed", { vehicle: name(last) })}</p>
        </div>
      )}
      <ul className="flex flex-col gap-4">
        {sorted.map((v) => {
          const pct = rangeDays > 0 ? Math.round((v.busyDays / rangeDays) * 100) : 0;
          return (
            <li key={v.id}>
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <Bike className="h-4 w-4 text-ink-3 shrink-0" aria-hidden />
                <span className="truncate">{v.make} {v.model}</span>
                <span className="tnum text-ink-3 font-normal">{v.registrationNumber}</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-surface-3">
                <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: SERIES[0] }} />
              </div>
              <p className="tnum mt-1 text-xs text-ink-3">{t("money.busyDays", { busy: v.busyDays, days: rangeDays, pct })}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-xs text-ink-3">{t("money.busyCaption")}</p>
    </>
  );
}
