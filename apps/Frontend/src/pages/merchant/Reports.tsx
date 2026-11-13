import type { ReactNode } from "react";
import { BarChart3, Bike, CalendarDays, IndianRupee, TrendingUp, Users } from "lucide-react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { rupees } from "../../lib/format";
import { useT, type TKey } from "../../i18n";
import { useMerchantQuery, useUrlParam } from "./query";
import { BarChart, Button, Card, EmptyState, ErrorNote, LoadingRows, PageHeader, SERIES, TONE } from "./ui/ui";
import { RangeChips, previousRange, rangeDates } from "./money/RangeChips";
import { RunningTotalChart } from "./money/RunningTotalChart";
import { VehicleReport } from "./money/VehicleReport";
import {
  best,
  bucketize,
  compare,
  fromSummary,
  moneyOf,
  ridesOf,
  runningTotals,
  share,
  totals,
  weekdayAverages,
  type Bucket,
  type ReportData,
  type Summary,
} from "./money/reportMath";

const RANGES = ["7d", "month", "last", "12m", "all"] as const;
export type ReportRange = (typeof RANGES)[number];

export const summaryPath = (shopId: string, r: { from: string | null; to: string }) =>
  `/shops/${shopId}/summary?${r.from ? `from=${r.from}&` : ""}to=${r.to}`;

/** Rupees in short form for chart axes: ₹25K, ₹1.2L (Hindi: ₹1.2 लाख). */
function useCompactRupees() {
  const { lang } = useT();
  const fmt = new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return (paise: number) => fmt.format(paise / 100);
}

function ReportsBody() {
  const { shopId, can } = useMerchantShop();
  const { t } = useT();
  const [range, setRange] = useUrlParam("range", RANGES, "month");

  if (!can("payouts:read")) {
    return (
      <>
        <PageHeader title={t("money.reportsTitle")} />
        <Card><p className="text-base text-ink-2">{t("money.ownerOnly")}</p></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("money.reportsTitle")} subtitle={t("money.reportsSubtitle")} />
      <RangeChips options={RANGES} value={range} onChange={(k) => setRange(k === "month" ? null : k)} />
      {shopId && <ShopReport shopId={shopId} range={range} onAllTime={() => setRange("all")} />}
    </>
  );
}

function ShopReport({ shopId, range, onAllTime }: { shopId: string; range: ReportRange; onAllTime: () => void }) {
  const { token } = useMerchantShop();
  const prevRange = previousRange(range);
  const q = useMerchantQuery<Summary>(summaryPath(shopId, rangeDates(range)), token, { keepPrevious: true });
  const p = useMerchantQuery<Summary>(prevRange ? summaryPath(shopId, prevRange) : null, token, { keepPrevious: true });

  if (q.isPending) return <LoadingRows rows={4} />;
  if (q.isError) return <ErrorNote onRetry={() => q.refetch()} />;
  return (
    // Switching ranges keeps the last numbers on screen, dimmed, until the new ones arrive.
    <div className={`transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
      <ReportCards data={fromSummary(q.data, prevRange ? (p.data ?? null) : null)} range={range} onAllTime={onAllTime} />
    </div>
  );
}

/** The six question cards. Same for one shop or every branch added up; `extra` slots in second. */
export function ReportCards({
  data,
  range,
  onAllTime,
  extra,
}: {
  data: ReportData;
  range: ReportRange;
  onAllTime: () => void;
  extra?: ReactNode;
}) {
  const { t, date } = useT();
  const compact = useCompactRupees();
  const tot = totals(data.days);
  const prev = range !== "all" && data.prevDays ? totals(data.prevDays) : null;
  const prevLabel = range !== "all" ? t(`money.prev_${range}` as TKey) : "";

  if (tot.rides === 0 && tot.money === 0) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          text={t("money.emptyRange")}
          action={range !== "all" ? <Button onClick={onAllTime}>{t("money.seeAllTime")}</Button> : undefined}
        />
      </Card>
    );
  }

  const byMonth = range === "12m" || range === "all";
  const buckets = bucketize(data.days, byMonth ? "month" : "day");
  const prevBuckets = data.prevDays ? bucketize(data.prevDays, byMonth ? "month" : "day") : [];
  // Month bars say just the month; the year appears on the first bar and on each January.
  const label = (b: Bucket, i = 1) =>
    byMonth
      ? date(`${b.key}-15T12:00:00+05:30`, i === 0 || b.key.endsWith("-01") ? { month: "short", year: "2-digit" } : { month: "short" })
      : range === "7d"
        ? date(`${b.key}T12:00:00+05:30`, { weekday: "short" })
        : String(Number(b.key.slice(8)));

  const topBucket = best(buckets, moneyOf);
  const firstRide = data.days.findIndex((d) => ridesOf(d) > 0);
  // Averages, like busy days, only count from the shop's first ride.
  const weekdays = weekdayAverages(firstRide < 0 ? data.days : data.days.slice(firstRide));
  const busiest = best(weekdays.map((v, i) => ({ v, i })), (x) => x.v);
  // "Monday is your busiest day" is only true if Monday clearly beats the rest.
  const tiedTop = busiest !== null && weekdays.filter((v) => Math.abs(v - busiest.v) < 0.05).length > 1;
  const oneDecimal = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  const weekdayName = (i: number, style: "short" | "long") => date(`2024-01-0${i + 1}T12:00:00+05:30`, { weekday: style });
  const split = share(tot.onlineEarnings, tot.walkinCash);
  // Judge how busy vehicles were only from the shop's first ride: a shop that
  // started two weeks ago shouldn't read "out 4 of 348 days".
  const activeDays = firstRide < 0 ? data.rangeDays : data.days.length - firstRide;
  const showWeekdays = range !== "7d" && busiest !== null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 1. The headline: how much, and more or less than before. */}
      <Card title={t(`money.q_earn_${range}` as TKey)} icon={IndianRupee} className="lg:col-span-2">
        <p className="tnum text-5xl font-semibold leading-tight text-ink">{rupees(tot.money)}</p>
        {prev ? (
          <DeltaPill current={tot.money} previous={prev.money} prevLabel={prevLabel} format={rupees} />
        ) : (
          range === "all" && data.days[0] && (
            <p className="mt-2 text-sm text-ink-3">{t("money.sinceFirst", { date: date(`${data.from}T12:00:00+05:30`, { day: "numeric", month: "long", year: "numeric" }) })}</p>
          )
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-ink-2">
          <span className="inline-flex items-center gap-2">
            <span className="tnum font-semibold text-ink">{t(tot.rides === 1 ? "money.rides_one" : "money.rides_other", { n: tot.rides })}</span>
            {prev && prev.rides !== tot.rides && (
              <span className={`tnum rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[tot.rides > prev.rides ? "good" : "bad"].chip}`}>
                {t(tot.rides > prev.rides ? "money.ridesMore" : "money.ridesLess", { n: Math.abs(tot.rides - prev.rides) })}
              </span>
            )}
          </span>
          {tot.rides > 0 && <span className="tnum">{t("money.perRide", { amount: rupees(Math.round(tot.money / tot.rides)) })}</span>}
        </div>
      </Card>

      {extra && <div className="lg:col-span-2">{extra}</div>}

      {/* 2. Progress: running totals, this period against the same stretch before. */}
      {prev && range !== "all" && (
        <Card title={t(`money.q_ahead_${range}` as TKey)} icon={TrendingUp} className="lg:col-span-2">
          <AheadLine
            current={runningTotals(buckets.map(moneyOf))}
            previous={runningTotals(prevBuckets.map(moneyOf))}
            prevLabel={prevLabel}
            format={rupees}
          />
          <RunningTotalChart
            labels={(buckets.length >= prevBuckets.length ? buckets : prevBuckets).map((b, i) => label(b, i))}
            series={[
              { name: t(`money.line_cur_${range}` as TKey), values: runningTotals(buckets.map(moneyOf)), color: SERIES[0] },
              { name: t(`money.line_prev_${range}` as TKey), values: runningTotals(prevBuckets.map(moneyOf)), color: "var(--color-ink-4)" },
            ]}
            format={rupees}
            compact={compact}
            tableLabel={t("money.showNumbers")}
          />
          <p className="mt-3 text-xs text-ink-3">{t("money.runningCaption")}</p>
        </Card>
      )}

      {/* 3. Money each day / month, online and walk-in stacked. */}
      <Card title={t(byMonth ? "money.q_moneyMonth" : "money.q_moneyDay")} icon={BarChart3} className="lg:col-span-2">
        {topBucket && (
          <p className="mb-4 text-base text-ink-2">
            {t(byMonth ? "money.bestMonth" : "money.bestDay", {
              when: byMonth
                ? date(`${topBucket.key}-15T12:00:00+05:30`, { month: "long", year: "numeric" })
                : date(`${topBucket.key}T12:00:00+05:30`, { weekday: "short", day: "numeric", month: "short" }),
              amount: rupees(moneyOf(topBucket)),
            })}
          </p>
        )}
        <BarChart
          data={buckets.map((b, i) => ({ label: label(b, i), values: [b.onlineEarnings, b.walkinCash] }))}
          series={[t("money.fromOnline"), t("money.walkinShort")]}
          format={rupees}
          tableLabel={t("money.showNumbers")}
        />
        <p className="mt-3 text-xs text-ink-3">{t("money.moneyCaption")}</p>
      </Card>

      {/* 4. Busy weekdays. */}
      {showWeekdays && (
        <Card title={t("money.q_weekdays")} icon={CalendarDays}>
          <p className="mb-4 text-base text-ink-2">
            {tiedTop ? t("money.noBusiestDay") : t("money.busiestDay", { day: weekdayName(busiest.i, "long"), n: oneDecimal(busiest.v) })}
          </p>
          <BarChart
            data={weekdays.map((v, i) => ({ label: weekdayName(i, "short"), values: [v] }))}
            series={[t("money.avgRides")]}
            format={oneDecimal}
            tableLabel={t("money.showNumbers")}
          />
          <p className="mt-3 text-xs text-ink-3">{t("money.weekdaysCaption")}</p>
        </Card>
      )}

      {/* 6. Where the money comes from (before vehicles so it pairs with weekdays). */}
      {split && (
        <Card title={t("money.q_source")} icon={Users} className={showWeekdays ? "" : "lg:col-span-2"}>
          <p className="mb-4 text-base text-ink-2">{t("money.srcTakeaway", { pct: split.online })}</p>
          <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {split.online > 0 && <span style={{ width: `${split.online}%`, background: SERIES[0] }} />}
            {split.walkin > 0 && <span style={{ width: `${split.walkin}%`, background: SERIES[1] }} />}
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {[
              { name: t("money.fromOnline"), pct: split.online, money: tot.onlineEarnings, rides: tot.online, color: SERIES[0] },
              { name: t("money.walkinShort"), pct: split.walkin, money: tot.walkinCash, rides: tot.walkin, color: SERIES[1] },
            ].map((row) => (
              <li key={row.name} className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-ink-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: row.color }} aria-hidden />
                  {row.name}
                </span>
                <span className="tnum text-right text-sm">
                  <span className="font-semibold text-ink">{row.pct}% · {rupees(row.money)}</span>
                  <span className="block text-xs text-ink-3">{t(row.rides === 1 ? "money.rides_one" : "money.rides_other", { n: row.rides })}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 5. Vehicles: what each earned and how often it was out. */}
      {data.vehicles.length > 0 && (
        <Card title={t("money.q_vehicles")} icon={Bike} className="lg:col-span-2">
          <VehicleReport vehicles={data.vehicles} rangeDays={activeDays} />
        </Card>
      )}
    </div>
  );
}

/** "▲ ₹6,100 (18%) more than last month by this date", toned by direction. Wraps on a phone. */
function DeltaPill({ current, previous, prevLabel, format }: { current: number; previous: number; prevLabel: string; format: (n: number) => string }) {
  const { t } = useT();
  const c = compare(current, previous);
  const tone = c.direction === "up" ? "good" : c.direction === "down" ? "bad" : "muted";
  const text =
    c.direction === "same"
      ? t("money.same", { prev: prevLabel })
      : `${t(c.direction === "up" ? "money.more" : "money.less", { amount: format(Math.abs(c.diff)), prev: prevLabel })}${c.pct !== null ? ` ${t("money.pct", { pct: Math.abs(c.pct) })}` : ""}`;
  return <p className={`mt-3 self-start rounded-2xl px-3 py-1.5 text-sm font-semibold ${TONE[tone].chip}`}>{text}</p>;
}

/** The takeaway above the running-total chart: ahead, behind or level at the same point in time. */
function AheadLine({ current, previous, prevLabel, format }: { current: number[]; previous: number[]; prevLabel: string; format: (n: number) => string }) {
  const { t } = useT();
  const i = current.length - 1;
  if (i < 0) return null;
  const then = previous[Math.min(i, previous.length - 1)] ?? 0;
  const diff = current[i]! - then;
  const key = diff > 0 ? "money.ahead" : diff < 0 ? "money.behind" : "money.level";
  return <p className="mb-4 text-base text-ink-2">{t(key, { amount: format(Math.abs(diff)), prev: prevLabel })}</p>;
}

export function MerchantReports() {
  return <MerchantLayout><ReportsBody /></MerchantLayout>;
}
