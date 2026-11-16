import type { Row } from "@retromobi/mobile-shared";

type Slot = { opensAt: string; closesAt: string } | null;
/** Keyed by dayOfWeek, 0 = Sunday. */
export type Hours = Record<number, Slot>;

/** Monday first. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DEFAULT_SLOT = { opensAt: "09:00", closesAt: "19:00" };
export const HALF_HOURS = Array.from({ length: 38 }, (_, i) => `${String(5 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** From `GET /shops/:id`. A shop with no hours yet starts open 09:00-19:00 every day. */
export function hoursFromShop(shop: Row | undefined): Hours {
  const rows = (shop && Array.isArray(shop.hours) ? shop.hours : []) as { dayOfWeek: number; opensAt: string; closesAt: string }[];
  const out: Hours = {};
  for (const d of DAY_ORDER) {
    const r = rows.find((x) => Number(x.dayOfWeek) === d);
    // The server sends Postgres time ("09:00:00"); the PUT wants "HH:MM".
    out[d] = rows.length === 0 ? { ...DEFAULT_SLOT } : r ? { opensAt: String(r.opensAt).slice(0, 5), closesAt: String(r.closesAt).slice(0, 5) } : null;
  }
  return out;
}

export const hoursPayload = (h: Hours) =>
  DAY_ORDER.flatMap((d) => (h[d] ? [{ dayOfWeek: d, ...h[d]! }] : []));

export const hoursInvalid = (h: Hours) => {
  const open = hoursPayload(h);
  return open.length === 0 || open.some((x) => x.closesAt <= x.opensAt);
};

/** Monday's hours copied to every day. */
export const sameEveryDay = (value: Hours): Hours => Object.fromEntries(DAY_ORDER.map((d) => [d, value[1] ?? { ...DEFAULT_SLOT }]));

