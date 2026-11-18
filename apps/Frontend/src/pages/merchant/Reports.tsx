import type { ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { BarChart3, Bike, Building2, CalendarDays, IndianRupee, Store, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { rupees } from "../../lib/format";
import { useT, type TKey } from "../../i18n";
import { can as hasPermission } from "../../lib/permissions";
import { merchantQuery, useMerchantQuery, useUrlParam } from "./query";
import { BarChart, Button, Card, EmptyState, ErrorNote, LoadingRows, PageHeader, SERIES, ViewToggle } from "./ui/ui";
import { ShopsCompare, type ShopResult } from "./money/ShopsCompare";
import { RangeChips, previousRange, rangeDates } from "./money/RangeChips";
import { RunningTotalChart } from "./money/RunningTotalChart";
import { VehicleReport } from "./money/VehicleReport";
import {
  best,
  bucketize,
  compare,
  fromSummary,
  mergeReports,
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
const SCOPES = ["shop", "all"] as const;
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
  const { shopId, shops, setShopId, can } = useMerchantShop();
  const { t } = useT();
  const [range, setRange] = useUrlParam("range", RANGES, "month");
  const [scope, setScope] = useUrlParam("scope", SCOPES, "shop");
  // Every branch where this person may see money; the switch only matters with two or more.
  const owned = shops.filter((s) => hasPermission(String(s.role ?? ""), "payouts:read"));
  const multi = owned.length > 1;
  const allShops = multi && scope === "all";

  if (!can("payouts:read")) {
    return (
      <>
        <PageHeader title={t("money.reportsTitle")} />
        <Card><p className="text-base text-ink-2">{t("money.ownerOnly")}</p></Card>
      </>
    );
  }

  return (
    // Laptop (xl+): one screen, like Home. Below xl it stacks and scrolls.
    // Windows shorter than ~850px scroll the page a little rather than hide a chart's labels inside its card.
    <div className="flex flex-col xl:h-[calc(100dvh-3rem)] xl:min-h-[800px]">
      <PageHeader
        title={t("money.reportsTitle")}
        // On a laptop the chips and the shop switch say it; the line would only push the charts down.
        subtitle={<span className="xl:hidden">{t(allShops ? "money.reportsSubtitleAll" : "money.reportsSubtitle")}</span>}
        actions={
          <>
            <RangeChips compact options={RANGES} value={range} onChange={(k) => setRange(k === "month" ? null : k)} />
            {/* A wider gap than between the chips: the switch is a separate control. */}
            {multi && (
              <div className="sm:ml-2">
                <ViewToggle
                  value={allShops ? "all" : "shop"}
                  onChange={(k) => setScope(k === "shop" ? null : k)}
                  options={[
                    { key: "shop", label: t("money.scopeShop"), icon: Store },
                    { key: "all", label: t("money.scopeAll"), icon: Building2 },
                  ]}
                />
              </div>
            )}
          </>
        }
      />
      {allShops ? (
        <AllShopsReport
          shops={owned}
          range={range}
          onAllTime={() => setRange("all")}
          onOpen={(id) => {
            setShopId(id);
            setScope(null);
          }}
        />
      ) : (
        shopId && <ShopReport shopId={shopId} range={range} onAllTime={() => setRange("all")} />
      )}
    </div>
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
    <div className={`flex min-h-0 flex-1 flex-col transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
      <ReportCards data={fromSummary(q.data, prevRange ? (p.data ?? null) : null)} range={range} onAllTime={onAllTime} />
    </div>
  );
}

/** Every branch added up: one summary per shop (current and previous), merged by date. */
function AllShopsReport({
  shops,
  range,
  onAllTime,
  onOpen,
}: {
  shops: { id?: unknown; name?: unknown; city?: unknown }[];
  range: ReportRange;
  onAllTime: () => void;
  onOpen: (shopId: string) => void;
}) {
  const { token } = useMerchantShop();
  const cur = rangeDates(range);
  const prevRange = previousRange(range);
  const current = useQueries({ queries: shops.map((s) => merchantQuery<Summary>(summaryPath(String(s.id), cur), token, true)) });
  const previous = useQueries({
    queries: prevRange ? shops.map((s) => merchantQuery<Summary>(summaryPath(String(s.id), prevRange), token, true)) : [],
  });

  if (current.some((q) => q.isPending)) return <LoadingRows rows={4} />;
  if (current.some((q) => q.isError)) return <ErrorNote onRetry={() => current.forEach((q) => void q.refetch())} />;

  const results: ShopResult[] = shops.map((s, i) => ({
    id: String(s.id),
    name: String(s.name ?? ""),
    city: String(s.city ?? ""),
    current: current[i]!.data!,
    previous: previous[i]?.data ?? null,
  }));
  const data = mergeReports(results.map((r) => ({ shopName: r.name, current: r.current, previous: prevRange ? r.previous : null })));
  const dim = current.some((q) => q.isPlaceholderData);

  return (
    <div className={`flex min-h-0 flex-1 flex-col transition-opacity ${dim ? "opacity-60" : ""}`}>
      <ReportCards
        data={data}
        range={range}
        onAllTime={onAllTime}
        extra={<ShopsCompare shops={results} onOpen={onOpen} className="lg:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1" />}
      />
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

  const showRunning = prev !== null && range !== "all";
  const delta = prev ? compare(tot.money, prev.money) : null;

  return (
    <div className="flex flex-col gap-4 xl:min-h-0 xl:flex-1">
      {/* The headline numbers. */}
      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          className="sm:col-span-2"
          icon={IndianRupee}
          label={t(`money.q_earn_${range}` as TKey)}
          value={rupees(tot.money)}
          caption={
            delta ? (
              <DeltaText change={delta} prevLabel={prevLabel} />
            ) : (
              range === "all" && data.days[0] && t("money.sinceFirst", { date: date(`${data.from}T12:00:00+05:30`, { day: "numeric", month: "long", year: "numeric" }) })
            )
          }
        />
        <Tile
          icon={Bike}
          label={t("money.tileRides")}
          value={String(tot.rides)}
          caption={
            <>
              {prev && prev.rides !== tot.rides && (
                <span className={`mr-1.5 font-semibold ${tot.rides > prev.rides ? "text-verified" : "text-danger"}`}>
                  {t(tot.rides > prev.rides ? "money.ridesMore" : "money.ridesLess", { n: Math.abs(tot.rides - prev.rides) })}
                </span>
              )}
              {tot.rides > 0 && t("money.perRide", { amount: rupees(Math.round(tot.money / tot.rides)) })}
            </>
          }
        />
        <Tile
          icon={Users}
          label={t("money.tileOnline")}
          value={split ? `${split.online}%` : "—"}
          aside={
            split && (
              <span className="flex h-2 w-20 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {split.online > 0 && <span style={{ width: `${split.online}%`, background: SERIES[0] }} />}
                {split.walkin > 0 && <span style={{ width: `${split.walkin}%`, background: SERIES[1] }} />}
              </span>
            )
          }
          caption={split && t("money.tileSplit", { online: rupees(tot.onlineEarnings), walkin: rupees(tot.walkinCash) })}
        />
      </div>

      {/* Charts in two columns, vehicles (and branches) in a third. Cells fill one screen on a laptop. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-3 xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Progress: running totals, this period against the same stretch before. */}
        {showRunning && (
          <Question title={t(`money.q_ahead_${range}` as TKey)} icon={TrendingUp} className="lg:col-span-2">
            <AheadLine
              current={runningTotals(buckets.map(moneyOf))}
              previous={runningTotals(prevBuckets.map(moneyOf))}
              prevLabel={prevLabel}
              format={rupees}
            />
            <RunningTotalChart
              fill
              labels={(buckets.length >= prevBuckets.length ? buckets : prevBuckets).map((b, i) => label(b, i))}
              series={[
                { name: t(`money.line_cur_${range}` as TKey), values: runningTotals(buckets.map(moneyOf)), color: SERIES[0] },
                { name: t(`money.line_prev_${range}` as TKey), values: runningTotals(prevBuckets.map(moneyOf)), color: "var(--color-ink-4)" },
              ]}
              format={rupees}
              compact={compact}
              tableLabel={t("money.showNumbers")}
              note={t("money.runningCaption")}
            />
          </Question>
        )}

        {/* Money each day / month, online and walk-in stacked. */}
        <Question
          title={t(byMonth ? "money.q_moneyMonth" : "money.q_moneyDay")}
          icon={BarChart3}
          className={!showRunning || !showWeekdays ? "lg:col-span-2" : ""}
          takeaway={
            topBucket &&
            t(byMonth ? "money.bestMonth" : "money.bestDay", {
              when: byMonth
                ? date(`${topBucket.key}-15T12:00:00+05:30`, { month: "long", year: "numeric" })
                : date(`${topBucket.key}T12:00:00+05:30`, { weekday: "short", day: "numeric", month: "short" }),
              amount: rupees(moneyOf(topBucket)),
            })
          }
        >
          <BarChart
            fill
            data={buckets.map((b, i) => ({ label: label(b, i), values: [b.onlineEarnings, b.walkinCash] }))}
            series={[t("money.fromOnline"), t("money.walkinShort")]}
            format={rupees}
            tableLabel={t("money.showNumbers")}
            note={t("money.moneyCaption")}
          />
        </Question>

        {/* Busy weekdays. */}
        {showWeekdays && (
          <Question
            title={t("money.q_weekdays")}
            icon={CalendarDays}
            className={showRunning ? "" : "lg:col-span-2"}
            takeaway={tiedTop ? t("money.noBusiestDay") : t("money.busiestDay", { day: weekdayName(busiest.i, "long"), n: oneDecimal(busiest.v) })}
          >
            <BarChart
              fill
              data={weekdays.map((v, i) => ({ label: weekdayName(i, "short"), values: [v] }))}
              series={[t("money.avgRides")]}
              format={oneDecimal}
              tableLabel={t("money.showNumbers")}
              note={t("money.weekdaysCaption")}
            />
          </Question>
        )}

        {extra}

        {/* Vehicles: what each earned and how often it was out. */}
        {data.vehicles.length > 0 && (
          <Card
            scroll
            title={t("money.q_vehicles")}
            icon={Bike}
            className={`lg:col-span-2 xl:col-span-1 xl:col-start-3 ${extra ? "xl:row-start-2" : "xl:row-span-2 xl:row-start-1"}`}
          >
            <VehicleReport vehicles={data.vehicles} rangeDays={activeDays} />
          </Card>
        )}
      </div>
    </div>
  );
}

/** A headline number: a small label with its icon, the number, and one line under it. */
function Tile({
  icon: Icon,
  label,
  value,
  aside,
  caption,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Sits beside the number, e.g. a little share bar. */
  aside?: ReactNode;
  caption?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card bg-surface p-4 shadow-card ${className}`}>
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
        <Icon className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        {label}
      </p>
      <div className="mt-1 flex items-center gap-3">
        <p className="tnum text-3xl font-semibold leading-tight text-ink">{value}</p>
        {aside}
      </div>
      {caption && <p className="mt-1 text-xs text-ink-3">{caption}</p>}
    </div>
  );
}

/** A question card that fills its grid cell on a laptop. Once "See the numbers" opens, the card scrolls, never the page. */
function Question({
  title,
  icon,
  takeaway,
  className = "",
  children,
}: {
  title: string;
  icon: LucideIcon;
  takeaway?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card title={title} icon={icon} className={`min-h-0 ${className}`}>
      <div className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
        {takeaway && <p className="mb-3 shrink-0 text-base text-ink-2">{takeaway}</p>}
        {children}
      </div>
    </Card>
  );
}

/** "▲ ₹6,100 more than last month by this date (18%)", in the direction's colour. */
function DeltaText({ change, prevLabel }: { change: ReturnType<typeof compare>; prevLabel: string }) {
  const { t } = useT();
  const text =
    change.direction === "same"
      ? t("money.same", { prev: prevLabel })
      : `${t(change.direction === "up" ? "money.more" : "money.less", { amount: rupees(Math.abs(change.diff)), prev: prevLabel })}${change.pct !== null ? ` ${t("money.pct", { pct: Math.abs(change.pct) })}` : ""}`;
  return <span className={`font-semibold ${change.direction === "up" ? "text-verified" : change.direction === "down" ? "text-danger" : "text-ink-2"}`}>{text}</span>;
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
