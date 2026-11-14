import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Row } from "../../../lib/portal";
import { istDay } from "../../../lib/format";
import { bookingStage, type BookingStage, type Tone } from "../../../lib/bookingStage";
import { useT } from "../../../i18n";
import { renterName } from "../bookingActions";
import { useMerchantShop } from "../Layout";
import { useMerchantQuery } from "../query";
import { Button, Card, ErrorNote, LoadingRows, TONE } from "../ui/ui";
import { BookingRow, type RowActions } from "./BookingRow";
import { daysCovered, pickupIso, weekSegments, withFilters, type Filters, type Staged } from "./filters";

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const noon = (day: string) => `${day}T12:00:00+05:30`;
/** Bars shown per week row; the rest of a day's bookings read "+N more". */
const LANES = 3;

/** Bar colours: the solid dot colour as a thin line on a phone, a soft tint
 *  with a label when wide. Pickup isn't the solid amber chip: a week of
 *  bright yellow bars drowns the rest. */
const BAR: Record<Tone, string> = {
  attention: "bg-amber-edge @3xl:bg-amber-soft @3xl:text-ink-2 @3xl:ring-1 @3xl:ring-inset @3xl:ring-amber-edge/40",
  info: "bg-info @3xl:bg-info-soft @3xl:text-info",
  bad: "bg-danger @3xl:bg-danger-soft @3xl:text-danger",
  good: "bg-verified @3xl:bg-verified-soft @3xl:text-verified",
  muted: "bg-ink-4 @3xl:bg-surface-3 @3xl:text-ink-2",
};

/** Four tones only: pickup, with customer, late, finished. */
function calTone(stage: BookingStage): Tone {
  if (stage === "PICKUP_LATE" || stage === "OVERDUE") return "bad";
  if (stage === "ON_RIDE" || stage === "RETURN_TODAY") return "info";
  if (stage === "RETURNED" || stage === "DEPOSIT_CLAIMED") return "good";
  return "attention";
}

/** Monday-first grid of whole weeks covering month `m` (1-12) of year `y`, as day strings. */
function gridDays(y: number, m: number): string[] {
  const first = Date.UTC(y, m - 1, 1);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((lead + inMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => ymd(first + (i - lead) * DAY_MS));
}

export function BookingCalendar({ filters, actions, onNewWalkin }: {
  filters: Filters;
  actions: RowActions;
  onNewWalkin: (day: string) => void;
}) {
  const { token, shopId, can } = useMerchantShop();
  const { t, date } = useT();
  const today = istDay(new Date());
  const [month, setMonth] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
  const [picked, setPicked] = useState(today);

  const days = gridDays(month.y, month.m);
  const monthKey = `${month.y}-${pad(month.m)}`;
  // The whole grid, not just the month, so the faded edge days are filled too.
  const range = new URLSearchParams({
    from: new Date(`${days[0]}T00:00:00+05:30`).toISOString(),
    to: new Date(`${days[days.length - 1]}T23:59:59+05:30`).toISOString(),
  });
  const q = useMerchantQuery<{ bookings: Row[] }>(`/shops/${shopId}/bookings?${withFilters(range, filters)}`, token);

  const byDay = new Map<string, Staged[]>();
  const now = new Date();
  const staged: Staged[] = [];
  for (const b of q.data?.bookings ?? []) {
    const stage = bookingStage(b, now);
    if (stage === "AWAITING_PAYMENT") continue;
    staged.push({ b, stage });
    for (const d of daysCovered(b)) byDay.set(d, [...(byDay.get(d) ?? []), { b, stage }]);
  }
  for (const list of byDay.values()) list.sort((x, y) => pickupIso(x.b).localeCompare(pickupIso(y.b)));
  const inMonth = days.some((d) => d.startsWith(monthKey) && byDay.has(d));

  const selected = days.includes(picked) ? picked : `${monthKey}-01`;
  const dayList = byDay.get(selected) ?? [];
  const go = (delta: number) => {
    const d = new Date(Date.UTC(month.y, month.m - 1 + delta, 1));
    const next = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    setMonth(next);
    setPicked(today.startsWith(`${next.y}-${pad(next.m)}`) ? today : `${next.y}-${pad(next.m)}-01`);
  };
  const showToday = () => { setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }); setPicked(today); };

  const legend: [Tone, string][] = [
    ["attention", t("bookings.legendPickup")], ["info", t("bookings.legendOnride")],
    ["bad", t("bookings.legendLate")], ["good", t("bookings.legendFinished")],
  ];

  return (
    <Card className="@container">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" aria-label={t("bookings.prevMonth")} onClick={() => go(-1)} className="px-3!"><ChevronLeft className="h-5 w-5" /></Button>
        <h2 className="min-w-36 text-center text-lg font-semibold text-ink">
          {date(noon(`${monthKey}-15`), { month: "long", year: "numeric" })}
        </h2>
        <Button variant="secondary" aria-label={t("bookings.nextMonth")} onClick={() => go(1)} className="px-3!"><ChevronRight className="h-5 w-5" /></Button>
        <Button variant="ghost" onClick={showToday}>{t("common.today")}</Button>
        <ul className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {legend.map(([tone, label]) => (
            <li key={tone} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${TONE[tone].dot}`} aria-hidden />{label}</li>
          ))}
        </ul>
      </div>

      {q.isPending ? <LoadingRows /> : q.isError ? <ErrorNote onRetry={() => q.refetch()} /> : (
        <>
          {!inMonth && <p className="mb-3 rounded-2xl bg-surface-2 px-4 py-2 text-sm text-ink-3">{t("bookings.noMonth")}</p>}
          <div className="flex flex-col gap-4 @3xl:flex-row">
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="flex min-w-[17rem] flex-col gap-1">
                <div className="grid grid-cols-7 gap-1">
                  {days.slice(0, 7).map((d) => (
                    <div key={d} className="pb-1 text-center text-xs font-medium text-ink-3">{date(noon(d), { weekday: "short" })}</div>
                  ))}
                </div>
                {Array.from({ length: days.length / 7 }, (_, w) => {
                  const week = days.slice(w * 7, w * 7 + 7);
                  const segs = weekSegments(staged, week);
                  // Bookings per day that didn't get one of the visible rows.
                  const hidden = week.map((_, col) => segs.filter((s) => s.lane >= LANES && s.start <= col && col < s.start + s.span).length);
                  return (
                    // Day buttons fill every row of their column; bars sit on top in rows 2..LANES+1.
                    <div key={week[0]} className="grid grid-cols-7 gap-x-1" style={{ gridTemplateRows: `1.75rem repeat(${LANES}, auto) 1fr` }}>
                      {week.map((d, col) => {
                        const isToday = d === today;
                        const here = d.startsWith(monthKey);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setPicked(d)}
                            aria-pressed={d === selected}
                            aria-label={date(noon(d), { weekday: "long", day: "numeric", month: "long" })}
                            style={{ gridColumn: col + 1, gridRow: "1 / -1" }}
                            className={`flex min-h-14 flex-col items-start rounded-xl border p-1 @3xl:min-h-24 @3xl:p-1.5 ${d === selected ? "border-ink" : "border-line"} ${here ? "bg-surface" : "bg-surface-2 opacity-50"}`}
                          >
                            <span className={`tnum inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-amber text-on-amber" : "text-ink-2"}`}>
                              {Number(d.slice(8))}
                            </span>
                          </button>
                        );
                      })}
                      {segs.filter((s) => s.lane < LANES).map((s) => (
                        <span
                          key={String(s.b.id)}
                          aria-hidden
                          style={{ gridColumn: `${s.start + 1} / span ${s.span}`, gridRow: s.lane + 2 }}
                          // One bar per booking per week: rounded only where the ride really
                          // starts or ends, flat where it carries on into the next/previous row.
                          className={`pointer-events-none z-10 mb-0.5 flex h-1.5 min-w-0 items-center gap-1 @3xl:h-auto @3xl:px-1.5 @3xl:py-0.5 ${BAR[calTone(s.stage)]} ${
                            s.contLeft ? "rounded-l-none" : "ml-1 rounded-l-md"
                          } ${s.contRight ? "rounded-r-none" : "mr-1 rounded-r-md"}`}
                        >
                          <span className={`hidden h-1.5 w-1.5 shrink-0 rounded-full @3xl:block ${TONE[calTone(s.stage)].dot}`} />
                          {/* Every local plate starts "UK..", so the last four digits are what tells them apart. */}
                          <span className="hidden truncate text-[11px] leading-tight @3xl:block">
                            {renterName(s.b).split(" ")[0]} · {String(s.b.registration_number ?? "").replace(/\s/g, "").slice(-4)}
                          </span>
                        </span>
                      ))}
                      {hidden.map((n, col) => n > 0 && (
                        <span key={col} aria-hidden style={{ gridColumn: col + 1, gridRow: LANES + 2 }} className="pointer-events-none z-10 self-start px-1.5 text-[10px] leading-tight text-ink-3 @3xl:text-[11px]">
                          {t("bookings.more", { count: n })}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="@container flex flex-col gap-3 @3xl:w-80 @3xl:shrink-0 @3xl:border-l @3xl:border-line @3xl:pl-4">
              <h3 className="text-sm font-semibold text-ink">{date(noon(selected), { weekday: "long", day: "numeric", month: "long" })}</h3>
              {dayList.length === 0 ? (
                <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-3">{t("bookings.noDay")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dayList.map(({ b, stage }) => <BookingRow key={String(b.id)} b={b} stage={stage} actions={actions} />)}
                </ul>
              )}
              {can("bookings:write") && (
                <Button variant="primary" icon={Plus} onClick={() => onNewWalkin(selected)}>
                  {t("bookings.newWalkinOn", { date: date(noon(selected)) })}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
