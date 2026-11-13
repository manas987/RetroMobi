import { useState } from "react";
import type { Row } from "../../../lib/portal";
import { portalFetch } from "../../../lib/portal";
import { useT } from "../../../i18n";
import { Button, ErrorNote, LoadingRows, Select, Sheet } from "../ui/ui";
import { Toggle } from "../../../components/Toggle";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";

type Slot = { opensAt: string; closesAt: string } | null;
/** Keyed by dayOfWeek, 0 = Sunday. */
export type Hours = Record<number, Slot>;

/** Monday first. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_SLOT = { opensAt: "09:00", closesAt: "19:00" };
const HALF_HOURS = Array.from({ length: 38 }, (_, i) => `${String(5 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

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

export function HoursEditor({
  value,
  onChange,
  heading = true,
}: {
  value: Hours;
  onChange: (h: Hours) => void;
  /** Off inside the hours popup, whose title already says "Opening hours". */
  heading?: boolean;
}) {
  const { t, date, time } = useT();
  const set = (d: number, s: Slot) => onChange({ ...value, [d]: s });
  // Every half hour from 5 am to 11:30 pm, plus a saved time that's off that grid.
  const timeOptions = (current: string) =>
    [...new Set([...HALF_HOURS, current])].sort().map((v) => ({ value: v, label: time(`2024-01-01T${v}:00+05:30`) }));
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        {heading ? <span className="text-sm font-medium text-ink">{t("setup.hoursTitle")}</span> : <span />}
        <Button variant="ghost" onClick={() => onChange(Object.fromEntries(DAY_ORDER.map((d) => [d, value[1] ?? { ...DEFAULT_SLOT }])))}>
          {t("setup.sameEveryDay")}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {DAY_ORDER.map((d) => {
          const s = value[d];
          const name = date(`2024-01-0${d === 0 ? 7 : d}T12:00:00+05:30`, { weekday: "long" });
          return (
            <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface-2 px-3 py-2">
              <span className="flex w-36 items-center gap-2 text-sm font-medium text-ink">
                <Toggle checked={!!s} onChange={(on) => set(d, on ? { ...DEFAULT_SLOT } : null)} label={name} />
                {name}
              </span>
              {s ? (
                <span className="flex w-full items-center gap-2 sm:w-auto sm:flex-1">
                  <Select compact className="flex-1 px-3" ariaLabel={t("setup.opensAt")} value={s.opensAt} onChange={(v) => set(d, { ...s, opensAt: v })} options={timeOptions(s.opensAt)} />
                  <span className="text-ink-3">{t("setup.timeTo")}</span>
                  <Select compact className="flex-1 px-3" ariaLabel={t("setup.closesAt")} value={s.closesAt} onChange={(v) => set(d, { ...s, closesAt: v })} options={timeOptions(s.closesAt)} />
                </span>
              ) : (
                <span className="text-sm text-ink-3">{t("setup.closedDay")}</span>
              )}
            </div>
          );
        })}
      </div>
      {hoursInvalid(value) && <p className="mt-2 text-xs text-danger">{t("setup.hoursInvalid")}</p>}
    </div>
  );
}

export function HoursSheet({ open, onClose, shopId, token }: { open: boolean; onClose: () => void; shopId: string; token: string }) {
  const { t } = useT();
  const q = useMerchantQuery<Row>(open ? `/shops/${shopId}` : null, token);
  return (
    <Sheet open={open} onClose={onClose} title={t("shop.hoursTitle")}>
      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : <HoursForm shop={q.data} shopId={shopId} token={token} onClose={onClose} />}
    </Sheet>
  );
}

function HoursForm({ shop, shopId, token, onClose }: { shop: Row; shopId: string; token: string; onClose: () => void }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [hours, setHours] = useState(() => hoursFromShop(shop));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/shops/${shopId}/hours`, { method: "PUT", token, body: { hours: hoursPayload(hours) } });
      await invalidate();
      onClose();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <HoursEditor value={hours} onChange={setHours} heading={false} />
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      <Button variant="primary" size="lg" className="w-full" disabled={busy || hoursInvalid(hours)} onClick={save}>
        {busy ? t("common.saving") : t("common.save")}
      </Button>
    </>
  );
}
