import type { SearchCriteria, SortKey } from "./types";

const SORTS: SortKey[] = ["price", "distance", "rating"];

/** Default window: Rishikesh demand is same-day, so today 10:00 -> tomorrow 10:00. */
export function defaultWindow(): { pickupAt: string; returnAt: string } {
  const base = new Date();
  base.setHours(10, 0, 0, 0);
  const next = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  return { pickupAt: toIsoWithOffset(base), returnAt: toIsoWithOffset(next) };
}

/** Always emit an explicit offset. A naked local datetime prices a different
 *  calendar day for anyone whose device clock is not on IST. */
export function toIsoWithOffset(d: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  );
}

function num(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const MAX_RENTAL_DAYS = 10;

export function parseSearchParams(search: string): SearchCriteria {
  const p = new URLSearchParams(search);
  const win = defaultWindow();
  const sort = p.get("sort") as SortKey | null;

  return {
    city: p.get("city") ?? "",
    pickupAt: p.get("pickupAt") ?? win.pickupAt,
    returnAt: p.get("returnAt") ?? win.returnAt,
    lat: num(p.get("lat")),
    lng: num(p.get("lng")),
    minPrice: num(p.get("minPrice")),
    maxPrice: num(p.get("maxPrice")),
    modelId: p.get("modelId") ?? undefined,
    minRating: num(p.get("minRating")),
    maxDistanceKm: num(p.get("maxDistanceKm")),
    fuelType: (p.get("fuelType") as "PETROL" | "ELECTRIC" | null) ?? undefined,
    minEngineCc: num(p.get("minEngineCc")),
    maxEngineCc: num(p.get("maxEngineCc")),
    seatingCapacity: num(p.get("seatingCapacity")),
    // Only ever written as "true" — "false" would be parsed as truthy upstream.
    fullyVerified: p.get("fullyVerified") === "true" ? true : undefined,
    sort: sort && SORTS.includes(sort) ? sort : "price",
    page: num(p.get("page")) ?? 1,
  };
}

export function toSearchParams(c: Partial<SearchCriteria>): string {
  const p = new URLSearchParams();
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === "" || v === false) return;
    p.set(k, String(v));
  };
  put("city", c.city);
  put("pickupAt", c.pickupAt);
  put("returnAt", c.returnAt);
  put("lat", c.lat);
  put("lng", c.lng);
  put("minPrice", c.minPrice);
  put("maxPrice", c.maxPrice);
  put("modelId", c.modelId);
  put("minRating", c.minRating);
  put("maxDistanceKm", c.maxDistanceKm);
  put("fuelType", c.fuelType);
  put("minEngineCc", c.minEngineCc);
  put("maxEngineCc", c.maxEngineCc);
  put("seatingCapacity", c.seatingCapacity);
  put("fullyVerified", c.fullyVerified);
  if (c.sort && c.sort !== "price") p.set("sort", c.sort);
  if (c.page && c.page > 1) p.set("page", String(c.page));
  return p.toString();
}

/** Which filters are active, for the removable chip row. */
export function activeFilters(c: SearchCriteria): { key: keyof SearchCriteria; label: string }[] {
  const out: { key: keyof SearchCriteria; label: string }[] = [];
  if (c.fuelType) out.push({ key: "fuelType", label: c.fuelType === "ELECTRIC" ? "Electric" : "Petrol" });
  if (c.maxPrice) out.push({ key: "maxPrice", label: `Under ₹${Math.round(c.maxPrice / 100).toLocaleString("en-IN")}` });
  if (c.maxDistanceKm) out.push({ key: "maxDistanceKm", label: `Within ${c.maxDistanceKm} km` });
  if (c.minRating) out.push({ key: "minRating", label: `${c.minRating}★ and up` });
  if (c.seatingCapacity) out.push({ key: "seatingCapacity", label: `${c.seatingCapacity} seats` });
  if (c.minEngineCc || c.maxEngineCc)
    out.push({ key: "minEngineCc", label: `${c.minEngineCc ?? 0}–${c.maxEngineCc ?? "∞"} cc` });
  if (c.fullyVerified) out.push({ key: "fullyVerified", label: "Fully verified only" });
  return out;
}
