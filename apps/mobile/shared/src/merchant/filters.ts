import type { Row } from "../lib/row";
import { bookingStage, type BookingStage } from "../lib/bookingStage";
import { istDay } from "../lib/format";

export const TAB_KEYS = ["today", "upcoming", "onride", "late", "finished", "all"] as const;
export type Tab = (typeof TAB_KEYS)[number];

export type Staged = { b: Row; stage: BookingStage };

const LATE: BookingStage[] = ["PICKUP_LATE", "OVERDUE"];
const OUT: BookingStage[] = ["ON_RIDE", "RETURN_TODAY", "OVERDUE"];
const DONE: BookingStage[] = ["RETURNED", "DEPOSIT_CLAIMED"];

/** Which stages each tab shows. HOLD (AWAITING_PAYMENT) is never shown. */
export const TAB_STAGES: Record<Tab, BookingStage[]> = {
  today: ["PICKUP_LATE", "OVERDUE", "PICKUP_TODAY", "RETURN_TODAY"],
  upcoming: ["UPCOMING"],
  onride: OUT,
  late: LATE,
  finished: DONE,
  all: ["UPCOMING", "PICKUP_TODAY", "PICKUP_LATE", ...OUT, ...DONE],
};

export const pickupIso = (b: Row) => String(b.scheduled_pickup_at);
export const returnIso = (b: Row) => String(b.actual_return_at ?? b.scheduled_return_at);

/** The moment this booking is waiting on: its pickup, or its return once out. */
const dueIso = (x: Staged) => (nextIsPickup(x.stage) ? pickupIso(x.b) : returnIso(x.b));
const nextIsPickup = (s: BookingStage) => s === "UPCOMING" || s === "PICKUP_TODAY" || s === "PICKUP_LATE";

const asc = (f: (x: Staged) => string) => (p: Staged, q: Staged) => f(p).localeCompare(f(q));

/** Staged rows of one tab, in that tab's order. */
export function rowsForTab(rows: Row[], tab: Tab, now: Date): Staged[] {
  const keep = TAB_STAGES[tab];
  const out = rows.map((b) => ({ b, stage: bookingStage(b, now) })).filter((x) => keep.includes(x.stage));
  switch (tab) {
    case "today":
      return out.sort((p, q) => Number(LATE.includes(q.stage)) - Number(LATE.includes(p.stage)) || asc(dueIso)(p, q));
    case "upcoming":
      return out.sort(asc((x) => pickupIso(x.b)));
    case "onride":
      return out.sort(asc((x) => returnIso(x.b)));
    case "late":
      return out.sort(asc(dueIso));
    case "finished":
      return out.sort((p, q) => returnIso(q.b).localeCompare(returnIso(p.b)));
    case "all":
      return out.sort((p, q) => pickupIso(q.b).localeCompare(pickupIso(p.b)));
  }
}

/** Items grouped by IST day of `isoOf`, in order of first appearance. */
export function groupByDay<T>(items: T[], isoOf: (x: T) => string): { day: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const x of items) {
    const day = istDay(new Date(isoOf(x)));
    const g = groups.get(day);
    if (g) g.push(x);
    else groups.set(day, [x]);
  }
  return [...groups].map(([day, rows]) => ({ day, rows }));
}

/** Every IST day from pickup to return, inclusive. */
export function daysCovered(b: Row): string[] {
  const first = istDay(new Date(pickupIso(b)));
  const last = istDay(new Date(returnIso(b)));
  const days = [first];
  for (let d = first; d < last; ) {
    d = istDay(new Date(Date.parse(`${d}T12:00:00+05:30`) + 86_400_000));
    days.push(d);
  }
  return days;
}

/** One booking's bar within one calendar week. */
export type Segment = Staged & {
  /** Column it starts in (0 = the week's first day) and how many it covers. */
  start: number;
  span: number;
  /** Row inside the week; one booking keeps one row all week. */
  lane: number;
  /** It began before this week / runs on after it, so that end is flat. */
  contLeft: boolean;
  contRight: boolean;
};

/** Bars for `week` (consecutive day strings), stacked into the fewest rows:
 *  earliest first, longer first on a tie, each into the first row free. */
export function weekSegments(items: Staged[], week: string[]): Segment[] {
  const first = week[0]!;
  const last = week[week.length - 1]!;
  const segs: Segment[] = items
    .flatMap((x) => {
      const days = daysCovered(x.b);
      const a = days[0]!;
      const z = days[days.length - 1]!;
      if (z < first || a > last) return [];
      const start = a < first ? 0 : week.indexOf(a);
      const end = z > last ? week.length - 1 : week.indexOf(z);
      return [{ ...x, start, span: end - start + 1, lane: 0, contLeft: a < first, contRight: z > last }];
    })
    .sort((p, q) => p.start - q.start || q.span - p.span || pickupIso(p.b).localeCompare(pickupIso(q.b)));
  const laneEnd: number[] = [];
  for (const s of segs) {
    const free = laneEnd.findIndex((end) => end < s.start);
    s.lane = free === -1 ? laneEnd.length : free;
    laneEnd[s.lane] = s.start + s.span - 1;
  }
  return segs;
}

export interface Filters {
  q: string;
  source: "" | "ONLINE" | "OFFLINE";
  vehicleId: string;
}

export const hasFilters = (f: Filters) => f.q !== "" || f.source !== "" || f.vehicleId !== "";

/** Appends the active filters to `params` (the server takes q, source, vehicleId). */
export function withFilters(params: URLSearchParams, f: Filters): URLSearchParams {
  if (f.q.trim()) params.set("q", f.q.trim());
  if (f.source) params.set("source", f.source);
  if (f.vehicleId) params.set("vehicleId", f.vehicleId);
  return params;
}
