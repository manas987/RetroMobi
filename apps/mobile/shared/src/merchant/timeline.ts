import { istDay } from "../lib/format";

const DAY_MS = 86_400_000;

/** `n` consecutive IST days ("YYYY-MM-DD") starting at `startDay`. IST has no DST, so 24h steps are exact. */
export function dayRange(startDay: string, n: number): string[] {
  const base = Date.parse(`${startDay}T00:00:00+05:30`);
  return Array.from({ length: n }, (_, i) => istDay(new Date(base + i * DAY_MS)));
}

/**
 * Where a booking or block sits in the visible `days`: zero-based first column
 * and how many columns it covers, clamped to the range. Null when it is wholly outside.
 */
export function spanFor(fromIso: string, toIso: string, days: string[]): { start: number; span: number } | null {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return null;
  const a = istDay(new Date(fromIso));
  const b = istDay(new Date(toIso));
  if (b < first || a > last) return null;
  const start = days.indexOf(a < first ? first : a);
  const end = days.indexOf(b > last ? last : b);
  return { start, span: end - start + 1 };
}
