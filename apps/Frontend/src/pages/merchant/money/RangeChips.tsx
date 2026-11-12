import { istDay } from "../../../lib/format";
import { useT, type TKey } from "../../../i18n";

export type RangeKey = "month" | "last" | "3m" | "7d" | "30d";

const LABEL: Record<RangeKey, TKey> = {
  month: "money.rangeMonth",
  last: "money.rangeLast",
  "3m": "money.range3m",
  "7d": "money.range7d",
  "30d": "money.range30d",
};

const DAY_MS = 86_400_000;

/** IST calendar dates ("YYYY-MM-DD") for a range key. `to` is today, except for "last month". */
export function rangeDates(key: RangeKey, now = new Date()): { from: string; to: string } {
  const today = istDay(now);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const first = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
  switch (key) {
    case "month": return { from: first(y, m), to: today };
    case "last": return { from: first(y, m - 1), to: new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10) };
    case "3m": return { from: first(y, m - 2), to: today };
    case "7d": return { from: istDay(new Date(now.getTime() - 6 * DAY_MS)), to: today };
    case "30d": return { from: istDay(new Date(now.getTime() - 29 * DAY_MS)), to: today };
  }
}

export function RangeChips<K extends RangeKey>({ options, value, onChange }: { options: readonly K[]; value: K; onChange: (k: K) => void }) {
  const { t } = useT();
  return (
    <div role="group" className="flex flex-wrap gap-2 mb-5">
      {options.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={k === value}
          onClick={() => onChange(k)}
          className={`min-h-11 rounded-full px-4 text-sm font-medium ${k === value ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2 hover:bg-surface-3"}`}
        >
          {t(LABEL[k])}
        </button>
      ))}
    </div>
  );
}
