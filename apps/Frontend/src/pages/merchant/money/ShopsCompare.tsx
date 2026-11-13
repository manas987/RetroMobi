import { ChevronRight, Store } from "lucide-react";
import { rupees } from "../../../lib/format";
import { useT } from "../../../i18n";
import { Card, SERIES, TONE } from "../ui/ui";
import { best, compare, ridesOf, totals, type Summary } from "./reportMath";

export interface ShopResult {
  id: string;
  name: string;
  city: string;
  current: Summary;
  previous: Summary | null;
}

/** "Which shop earns the most?" Each branch's money as a bar, with rides, vehicles and how busy they were. */
export function ShopsCompare({ shops, onOpen }: { shops: ShopResult[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const rows = shops
    .map((s) => {
      const tot = totals(s.current.days);
      const prev = s.previous ? totals(s.previous.days) : null;
      // Busy share from the branch's own first ride, like the vehicle list.
      const first = s.current.days.findIndex((d) => ridesOf(d) > 0);
      const active = first < 0 ? s.current.days.length : s.current.days.length - first;
      const vehicles = s.current.vehicles.length;
      const busy = s.current.vehicles.reduce((n, v) => n + v.busyDays, 0);
      return {
        ...s,
        money: tot.money,
        rides: tot.rides,
        vehicles,
        busyPct: vehicles && active ? Math.round((busy / (vehicles * active)) * 100) : 0,
        change: prev ? compare(tot.money, prev.money) : null,
      };
    })
    .sort((a, b) => b.money - a.money);
  const max = Math.max(1, ...rows.map((r) => r.money));
  const top = best(rows, (r) => r.money);

  return (
    <Card title={t("money.q_shops")} icon={Store}>
      {top && <p className="mb-4 text-base text-ink-2">{t("money.topShop", { shop: top.name, amount: rupees(top.money) })}</p>}
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onOpen(r.id)} className="group w-full py-3 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink group-hover:underline">{r.name}</p>
                  <p className="truncate text-xs text-ink-3">
                    {[r.city, t("money.shopLine", { rides: t(r.rides === 1 ? "money.rides_one" : "money.rides_other", { n: r.rides }), vehicles: r.vehicles, pct: r.busyPct })]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.change && r.change.pct !== null && r.change.direction !== "same" && (
                    <span className={`tnum rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[r.change.direction === "up" ? "good" : "bad"].chip}`}>
                      {r.change.direction === "up" ? "▲" : "▼"} {Math.abs(r.change.pct)}%
                    </span>
                  )}
                  <span className="tnum text-base font-semibold text-ink">{rupees(r.money)}</span>
                  <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden />
                </div>
              </div>
              <div className="mt-2 h-2.5 rounded-full bg-surface-3">
                <div className="h-2.5 rounded-full" style={{ width: `${(r.money / max) * 100}%`, background: SERIES[0] }} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
