/**
 * The arithmetic behind the Reports page, kept pure so it can be tested. The
 * server hands over one row per IST day; everything a card shows (months,
 * running totals, weekdays, comparisons, all branches added up) is built here.
 */

export interface Day {
  date: string;
  online: number;
  walkin: number;
  onlineEarnings?: number;
  walkinCash?: number;
}

export interface ReportVehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  busyDays: number;
  rides: number;
  earnings?: number;
  /** Set in the all-shops view, where each vehicle is tagged with the one shop it belongs to. */
  shopName?: string;
}

/** What `GET /shops/:id/summary` returns (the parts Reports reads). */
export interface Summary {
  from: string;
  to: string;
  rangeDays: number;
  days: Day[];
  vehicles: ReportVehicle[];
}

/** Everything one report needs, for a single shop or every branch added up. */
export interface ReportData {
  from: string;
  rangeDays: number;
  days: Day[];
  /** The comparison period's days, or null when there's nothing to compare (all time). */
  prevDays: Day[] | null;
  vehicles: ReportVehicle[];
}

export const moneyOf = (d: Pick<Day, "onlineEarnings" | "walkinCash">) => (d.onlineEarnings ?? 0) + (d.walkinCash ?? 0);
export const ridesOf = (d: Pick<Day, "online" | "walkin">) => d.online + d.walkin;

export function totals(days: Day[]) {
  let online = 0, walkin = 0, onlineEarnings = 0, walkinCash = 0;
  for (const d of days) {
    online += d.online;
    walkin += d.walkin;
    onlineEarnings += d.onlineEarnings ?? 0;
    walkinCash += d.walkinCash ?? 0;
  }
  return { online, walkin, onlineEarnings, walkinCash, rides: online + walkin, money: onlineEarnings + walkinCash };
}

export interface Bucket {
  /** "YYYY-MM-DD" for a day, "YYYY-MM" for a month. */
  key: string;
  online: number;
  walkin: number;
  onlineEarnings: number;
  walkinCash: number;
}

/** Days as they are, or added up per calendar month, in order. */
export function bucketize(days: Day[], by: "day" | "month"): Bucket[] {
  const out: Bucket[] = [];
  for (const d of days) {
    const key = by === "day" ? d.date : d.date.slice(0, 7);
    let b = out[out.length - 1];
    if (!b || b.key !== key) out.push((b = { key, online: 0, walkin: 0, onlineEarnings: 0, walkinCash: 0 }));
    b.online += d.online;
    b.walkin += d.walkin;
    b.onlineEarnings += d.onlineEarnings ?? 0;
    b.walkinCash += d.walkinCash ?? 0;
  }
  return out;
}

export function runningTotals(values: number[]): number[] {
  let sum = 0;
  return values.map((v) => (sum += v));
}

/** Monday = 0 for an IST calendar day "YYYY-MM-DD". */
export const weekdayOf = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Average rides starting on each weekday, Monday first. A weekday not in the range averages 0. */
export function weekdayAverages(days: Day[]): number[] {
  const sum = Array(7).fill(0) as number[];
  const count = Array(7).fill(0) as number[];
  for (const d of days) {
    const w = weekdayOf(d.date);
    sum[w]! += ridesOf(d);
    count[w]! += 1;
  }
  return sum.map((s, i) => (count[i] ? s / count[i]! : 0));
}

/** This period against the last one. `pct` is null when there was nothing before to compare with. */
export function compare(current: number, previous: number) {
  const diff = current - previous;
  return {
    diff,
    pct: previous > 0 ? Math.round((diff / previous) * 100) : null,
    direction: diff > 0 ? ("up" as const) : diff < 0 ? ("down" as const) : ("same" as const),
  };
}

/** The item with the highest value, or null when every value is zero. */
export function best<T>(items: T[], value: (t: T) => number): T | null {
  let top: T | null = null;
  for (const it of items) if (value(it) > 0 && (top === null || value(it) > value(top))) top = it;
  return top;
}

/** Whole-number percentages that add up to 100, or null when both are zero. */
export function share(online: number, walkin: number): { online: number; walkin: number } | null {
  const total = online + walkin;
  if (total <= 0) return null;
  const o = Math.round((online / total) * 100);
  return { online: o, walkin: 100 - o };
}

/** Days from several shops added together by date (shops can start on different days). */
export function mergeDays(lists: Day[][]): Day[] {
  const byDate = new Map<string, Day>();
  for (const list of lists) {
    for (const d of list) {
      const m = byDate.get(d.date) ?? { date: d.date, online: 0, walkin: 0, onlineEarnings: 0, walkinCash: 0 };
      m.online += d.online;
      m.walkin += d.walkin;
      m.onlineEarnings = (m.onlineEarnings ?? 0) + (d.onlineEarnings ?? 0);
      m.walkinCash = (m.walkinCash ?? 0) + (d.walkinCash ?? 0);
      byDate.set(d.date, m);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** One report from a single shop's summaries. */
export function fromSummary(current: Summary, previous: Summary | null): ReportData {
  return { from: current.from, rangeDays: current.rangeDays, days: current.days, prevDays: previous?.days ?? null, vehicles: current.vehicles };
}

/** Every branch added up: days merged by date, each vehicle kept once with its shop's name. */
export function mergeReports(parts: { shopName: string; current: Summary; previous: Summary | null }[]): ReportData {
  const days = mergeDays(parts.map((p) => p.current.days));
  const hasPrev = parts.some((p) => p.previous);
  return {
    from: days[0]?.date ?? parts[0]?.current.from ?? "",
    rangeDays: days.length,
    days,
    prevDays: hasPrev ? mergeDays(parts.map((p) => p.previous?.days ?? [])) : null,
    vehicles: parts.flatMap((p) => p.current.vehicles.map((v) => ({ ...v, shopName: p.shopName }))),
  };
}
