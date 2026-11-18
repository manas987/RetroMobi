import { Link } from "wouter";
import { Bike, ChevronRight } from "lucide-react";
import { rupees } from "../../../lib/format";
import { useT } from "../../../i18n";
import { SERIES } from "../ui/ui";
import { best, type ReportVehicle } from "./reportMath";

/** "Which vehicles earn the most?" Money first, then how often each one was out, with a nudge for the idle ones. */
export function VehicleReport({ vehicles, rangeDays }: { vehicles: ReportVehicle[]; rangeDays: number }) {
  const { t } = useT();
  const sorted = [...vehicles].sort((a, b) => (b.earnings ?? 0) - (a.earnings ?? 0) || b.busyDays - a.busyDays);
  const top = best(sorted, (v) => v.earnings ?? 0);
  const name = (v: ReportVehicle) => `${v.make} ${v.model} · ${v.registrationNumber}`;
  // A tip only means something over a couple of weeks; a quiet Tuesday isn't a problem.
  const judge = rangeDays >= 14;

  return (
    <>
      {top && <p className="mb-4 text-base text-ink-2">{t("money.topVehicle", { vehicle: name(top), amount: rupees(top.earnings ?? 0) })}</p>}
      <ul className="flex flex-col divide-y divide-line">
        {sorted.map((v) => {
          const pct = rangeDays > 0 ? Math.round((v.busyDays / rangeDays) * 100) : 0;
          return (
            <li key={v.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Bike className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate">{v.make} {v.model}</span>
                  </p>
                  <p className="tnum truncate text-xs text-ink-3">
                    {v.registrationNumber}
                    {v.shopName && <> · {v.shopName}</>}
                    {" · "}
                    {t(v.rides === 1 ? "money.rides_one" : "money.rides_other", { n: v.rides })}
                  </p>
                </div>
                {v.earnings !== undefined && <p className="tnum shrink-0 text-base font-semibold text-ink">{rupees(v.earnings)}</p>}
              </div>
              <div className="mt-2 h-2 rounded-full bg-surface-3">
                <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: SERIES[0] }} />
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="tnum text-xs text-ink-3">{t("money.busyDays", { busy: v.busyDays, days: rangeDays, pct })}</p>
                {judge && pct < 20 && (
                  <Link href={`/merchant/fleet/${v.id}?tab=price`} className="inline-flex items-center gap-0.5 text-xs font-semibold text-ink underline underline-offset-2">
                    {t("money.idleTip")}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-ink-3">{t("money.busyCaption")}</p>
    </>
  );
}
