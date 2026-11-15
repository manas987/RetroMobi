import { istDay } from "./format";

export type Month = { y: number; m: number };
export type DateWindow = { pickupAt: string; returnAt: string };

export function monthOf(day: string): Month {
  return { y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)) };
}

export function shiftMonth({ y, m }: Month, delta: number): Month {
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

export function monthDays({ y, m }: Month): string[] {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((lead + length) / 7) * 7 }, (_, i) =>
    new Date(Date.UTC(y, m - 1, 1 + i - lead)).toISOString().slice(0, 10),
  );
}

export function istBookingTime(day: string, time: string): string {
  return `${day}T${time}:00+05:30`;
}

export function splitIstBookingTime(iso: string) {
  const date = new Date(iso);
  return { day: istDay(date), time: new Date(date.getTime() + 330 * 60_000).toISOString().slice(11, 16) };
}
