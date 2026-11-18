import { istDay } from "../../../lib/format";
import { useT, type TKey } from "../../../i18n";

export type RangeKey = "month" | "last" | "3m" | "7d" | "30d" | "12m" | "all";

const LABEL: Record<RangeKey, TKey> = {
  month: "money.rangeMonth",
  last: "money.rangeLast",
  "3m": "money.range3m",
  "7d": "money.range7d",
  "30d": "money.range30d",
  "12m": "money.range12m",
  all: "money.rangeAll",
};

// Calendar maths on "YYYY-MM-DD" strings, in UTC so no timezone can shift a day.
const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => iso(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));
/** First of month `m` (1-based) of year `y`; months outside 1-12 roll over. */
const monthStart = (y: number, m: number) => iso(new Date(Date.UTC(y, m - 1, 1)));
const monthEnd = (y: number, m: number) => iso(new Date(Date.UTC(y, m, 0)));
/** Day `d` of month `m`, or that month's last day if it's shorter (31 Mar -> 28/29 Feb). */
const sameDay = (y: number, m: number, d: number) => {
  const end = monthEnd(y, m);
  return Number(end.slice(8)) < d ? end : `${end.slice(0, 8)}${String(d).padStart(2, "0")}`;
};

/** IST calendar dates for a range key. `to` is today, except for "last month". `from` is null for all time. */
export function rangeDates(key: "all", now?: Date): { from: null; to: string };
export function rangeDates(key: Exclude<RangeKey, "all">, now?: Date): { from: string; to: string };
export function rangeDates(key: RangeKey, now?: Date): { from: string | null; to: string };
export function rangeDates(key: RangeKey, now = new Date()): { from: string | null; to: string } {
  const today = istDay(now);
  const [y, m] = today.split("-").map(Number) as [number, number];
  switch (key) {
    case "month": return { from: monthStart(y, m), to: today };
    case "last": return { from: monthStart(y, m - 1), to: monthEnd(y, m - 1) };
    case "3m": return { from: monthStart(y, m - 2), to: today };
    case "7d": return { from: addDays(today, -6), to: today };
    case "30d": return { from: addDays(today, -29), to: today };
    // Whole months, so the month-by-month chart has twelve complete-looking bars.
    case "12m": return { from: monthStart(y, m - 11), to: today };
    case "all": return { from: null, to: today };
  }
}

/**
 * The period to compare against, so "this month so far" meets "last month by
 * the same date", never a whole month. Null when there's nothing fair to compare.
 */
export function previousRange(key: RangeKey, now = new Date()): { from: string; to: string } | null {
  const today = istDay(now);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  switch (key) {
    case "7d": return { from: addDays(today, -13), to: addDays(today, -7) };
    case "30d": return { from: addDays(today, -59), to: addDays(today, -30) };
    case "month": return { from: monthStart(y, m - 1), to: sameDay(y, m - 1, d) };
    case "last": return { from: monthStart(y, m - 2), to: monthEnd(y, m - 2) };
    case "12m": return { from: monthStart(y, m - 23), to: sameDay(y, m - 12, d) };
    default: return null;
  }
}

export function RangeChips<K extends RangeKey>({
  options,
  value,
  onChange,
  compact = false,
}: {
  options: readonly K[];
  value: K;
  onChange: (k: K) => void;
  /** Shorter chips with no gap below, for a page header. */
  compact?: boolean;
}) {
  const { t } = useT();
  return (
    <div role="group" className={`flex flex-wrap gap-2 ${compact ? "" : "mb-5"}`}>
      {options.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={k === value}
          onClick={() => onChange(k)}
          className={`${compact ? "min-h-10 px-3.5" : "min-h-11 px-4"} rounded-full text-sm font-medium ${k === value ? "bg-ink text-surface" : "bg-surface border border-line-strong text-ink-2 hover:bg-surface-3"}`}
        >
          {t(LABEL[k])}
        </button>
      ))}
    </div>
  );
}
