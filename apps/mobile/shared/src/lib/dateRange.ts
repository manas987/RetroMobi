import { formatIstDate } from "./format";

/**
 * Decides what a tap in the pick-up → return calendar means.
 *
 * The web version (apps/Frontend/src/lib/dateRange.ts) adapts react-day-picker's
 * range object; the app draws its own month grid, so this takes the tapped day
 * directly. Same rule, Airbnb's: first tap is the pick-up, second tap on or
 * after it is the return, a tap before it starts over.
 */
export interface SelectionResult {
  /** The in-progress pick-up day, or null when there isn't one. */
  pending: Date | null;
  /** A finished range to hand to the parent, or null to commit nothing yet. */
  commit: { from: Date; to: Date } | null;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function tapDay(pending: Date | null, day: Date): SelectionResult {
  // Nothing pending: this tap starts a fresh range, even over a finished one.
  if (!pending) return { pending: day, commit: null };
  // Earlier than the pick-up: treat it as a new pick-up, not a backwards range.
  if (startOfDay(day) < startOfDay(pending)) return { pending: day, commit: null };
  // Same day or later completes it (same day = a same-day rental).
  return { pending: null, commit: { from: pending, to: day } };
}

export function formatDateSummary(from: Date | null, to: Date | null): string {
  if (!from || !to) return "Add dates";
  const short = (d: Date) => formatIstDate(d, { day: "numeric", month: "short" });
  const start = short(from);
  if (isSameDay(from, to)) return start;
  const end = short(to);
  if (from.getFullYear() !== to.getFullYear()) return `${start} ${from.getFullYear()}–${end} ${to.getFullYear()}`;
  return from.getMonth() === to.getMonth() ? `${from.getDate()}–${end}` : `${start}–${end}`;
}

/** "12 hrs", "2d", "2d 4h" — the rental window's length, for a badge. */
export function formatDuration(from: Date, to: Date): string {
  const hrs = Math.max(1, Math.round((to.getTime() - from.getTime()) / 3_600_000));
  if (hrs < 24) return `${hrs} hrs`;
  const days = Math.floor(hrs / 24);
  const rem = hrs % 24;
  return rem ? `${days}d ${rem}h` : `${days}d`;
}

/** A Date as { date, "HH:MM" } and back -- the calendar and the time pickers work on these halves. */
export function splitIso(iso: string): { date: Date; time: string } {
  const d = new Date(iso);
  return { date: d, time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
}

export function combine(date: Date, time: string): Date {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const out = new Date(date);
  out.setHours(h, m, 0, 0);
  return out;
}
