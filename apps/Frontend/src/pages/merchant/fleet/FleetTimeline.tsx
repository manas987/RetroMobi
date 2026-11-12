import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Row } from "../../../lib/portal";
import { istDay } from "../../../lib/format";
import { bookingStage, STAGE_TONE as BOOKING_TONE, type Tone } from "../../../lib/bookingStage";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { useMerchantQuery } from "../query";
import { renterName } from "../bookingActions";
import { Button, Card, ErrorNote, LoadingRows, TONE } from "../ui/ui";
import { NoVehicles } from "./FleetList";
import { useVehicles } from "./SetupBoard";
import { dayRange, spanFor } from "./timeline";

const DAY_MS = 86_400_000;
const at = (day: string) => `${day}T00:00:00+05:30`;

export function FleetTimeline({ onAdd, onBook }: { onAdd: () => void; onBook: (vehicleId: string, startDay: string) => void }) {
  const { token, shopId, can } = useMerchantShop();
  const { t, date } = useT();
  const [n, setN] = useState<14 | 30>(14);
  const [start, setStart] = useState(() => istDay(new Date()));
  const days = dayRange(start, n);
  const today = istDay(new Date());
  const to = istDay(new Date(Date.parse(at(start)) + n * DAY_MS)); // first day after the range

  const vehicles = useVehicles();
  const params = new URLSearchParams({ from: at(start), to: at(to) });
  const bookings = useMerchantQuery<{ bookings: Row[] }>(`/shops/${shopId}/bookings?${params}`, token);

  const shift = (d: number) => setStart(istDay(new Date(Date.parse(at(start)) + d * DAY_MS)));
  const dayLabel = (d: string) => date(`${d}T12:00:00+05:30`, { day: "numeric", month: "short" });

  if (vehicles.isPending) return <LoadingRows rows={4} />;
  if (vehicles.isError) return <ErrorNote onRetry={() => vehicles.refetch()} />;
  if (vehicles.data.vehicles.length === 0) return <NoVehicles onAdd={onAdd} />;

  const real = (bookings.data?.bookings ?? []).filter((b) => b.status !== "HOLD");
  const cols = `var(--nc) repeat(${n}, minmax(44px, 1fr))`;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" className="inline-flex rounded-2xl bg-surface-3 p-1">
          {([14, 30] as const).map((k) => (
            <button key={k} type="button" aria-pressed={n === k} onClick={() => setN(k)}
              className={`min-h-10 rounded-xl px-3 text-sm font-medium ${n === k ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}>
              {t("fleet.daysN", { n: k })}
            </button>
          ))}
        </div>
        <Button aria-label={t("common.previous")} onClick={() => shift(-7)}><ChevronLeft className="h-5 w-5" aria-hidden /></Button>
        <Button aria-label={t("common.next")} onClick={() => shift(7)}><ChevronRight className="h-5 w-5" aria-hidden /></Button>
        <Button onClick={() => setStart(today)}>{t("common.today")}</Button>
        <span className="tnum text-sm font-medium text-ink-2">{dayLabel(days[0]!)} – {dayLabel(days[n - 1]!)}</span>
      </div>

      {bookings.isError && <div className="mb-3"><ErrorNote onRetry={() => bookings.refetch()} /></div>}

      <div className="overflow-x-auto">
        <div className="[--nc:7rem] sm:[--nc:10rem]" style={{ minWidth: `calc(var(--nc) + ${n} * 44px)` }}>
          <div className="grid" style={{ gridTemplateColumns: cols }}>
            <div className="sticky left-0 z-10 bg-surface" />
            {days.map((d) => (
              <div key={d} className={`border-l border-line py-1 text-center ${d === today ? "bg-amber/15" : ""}`}>
                <p className="text-[11px] text-ink-3">{date(`${d}T12:00:00+05:30`, { weekday: "narrow" })}</p>
                <p className="tnum text-sm font-semibold text-ink">{Number(d.slice(8))}</p>
              </div>
            ))}
          </div>
          {vehicles.data.vehicles.map((v) => (
            <TimelineRow key={String(v.id)} v={v} days={days} today={today} cols={cols}
              bookings={real.filter((b) => b.vehicle_id === v.id)}
              onBook={can("bookings:write") ? onBook : undefined} />
          ))}
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {([["fleet.legendPickup", "attention"], ["fleet.legendOut", "info"], ["fleet.legendLate", "bad"], ["fleet.legendDone", "good"], ["fleet.legendBlocked", "muted"]] as const).map(([k, tone]) => (
          <li key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${TONE[tone].dot}`} aria-hidden />{t(k)}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-3">{t("fleet.blockHint")}</p>
    </Card>
  );
}

function TimelineRow({ v, days, today, cols, bookings, onBook }: {
  v: Row; days: string[]; today: string; cols: string; bookings: Row[];
  onBook?: (vehicleId: string, startDay: string) => void;
}) {
  const { token } = useMerchantShop();
  const { t, date } = useT();
  const blocks = useMerchantQuery<{ blocks: Row[] }>(`/vehicles/${v.id}/unavailability`, token);

  const bars: { key: string; start: number; span: number; tone: Tone; label: string; href?: string }[] = [];
  for (const b of bookings) {
    const s = spanFor(String(b.scheduled_pickup_at), String(b.actual_return_at ?? b.scheduled_return_at), days);
    if (!s) continue;
    const name = b.walkin_name ?? b.rider_name ?? b.customer_name;
    bars.push({ key: String(b.id), ...s, tone: BOOKING_TONE[bookingStage(b)], href: `/merchant/bookings?booking=${b.id}`,
      label: name ? renterName(b).split(" ")[0]! : t("common.walkin") });
  }
  for (const k of blocks.data?.blocks ?? []) {
    const s = spanFor(String(k.start_at), String(k.end_at), days);
    if (!s) continue;
    bars.push({ key: `block-${k.id}`, ...s, tone: "muted", label: k.reason ? `${t("fleet.blocked")}: ${String(k.reason)}` : t("fleet.blocked") });
  }
  const covered = new Set(bars.flatMap((b) => days.slice(b.start, b.start + b.span)));
  const plate = String(v.registration_number ?? "");

  return (
    <div className="grid border-t border-line" style={{ gridTemplateColumns: cols }}>
      <div className="sticky left-0 z-10 flex min-w-0 flex-col justify-center bg-surface pr-2" style={{ gridRow: 1, gridColumn: 1 }}>
        <Link href={`/merchant/fleet/${v.id}`} className="truncate text-sm font-semibold text-ink hover:underline">{String(v.make ?? "")} {String(v.model ?? "")}</Link>
        <span className="tnum truncate text-xs text-ink-3">{plate}</span>
      </div>
      {days.map((d, i) => {
        const cls = `h-12 border-l border-line ${d === today ? "bg-amber/15" : ""}`;
        return covered.has(d) || !onBook ? (
          <div key={d} className={cls} style={{ gridRow: 1, gridColumn: i + 2 }} />
        ) : (
          <button key={d} type="button" className={`${cls} hover:bg-amber/25 focus-visible:outline-2 focus-visible:outline-ink`}
            style={{ gridRow: 1, gridColumn: i + 2 }}
            aria-label={t("fleet.bookCell", { vehicle: plate, day: date(`${d}T12:00:00+05:30`, { weekday: "short", day: "numeric" }) })}
            onClick={() => onBook(String(v.id), d)} />
        );
      })}
      {bars.map((b) => {
        const style = { gridRow: 1, gridColumn: `${b.start + 2} / span ${b.span}` };
        const cls = `z-[1] m-1 flex min-w-0 items-center self-center rounded-lg px-2 py-1.5 text-xs font-semibold ${TONE[b.tone].chip}`;
        return b.href ? (
          <Link key={b.key} href={b.href} className={`${cls} hover:opacity-80`} style={style}><span className="truncate">{b.label}</span></Link>
        ) : (
          <div key={b.key} className={cls} style={style}><span className="truncate">{b.label}</span></div>
        );
      })}
    </div>
  );
}
