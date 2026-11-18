import { useState } from "react";
import { FlatList, View } from "react-native";
import { ChartNoAxesCombined, Store } from "lucide-react-native";
import { Stack, useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import {
  Button, Card, EmptyState, ErrorNote, LoadingRows, Screen, Segmented, Tabs, Text,
  api, can, colors, dateLabel, decodeJwtSubject, errorText, ranges, reportMath as math, radius, rupees, space, useSession, useT,
} from "@retromobi/mobile-shared";
import { CounterRowLink, HeroCard, PageTitle, StatusBadge, counter, counterStyles } from "../../ui/Counter";
import { VehicleThumb } from "../../features/fleet/VehicleThumb";
import { useMerchantShop } from "../../state/shop";
import { BarChart } from "../../features/overview/BarChart";
import { RunningTotalChart } from "../../features/money/RunningTotalChart";
import { Fields } from "../../features/fleet/tabs/Fields";

const RANGES = ["7d", "month", "last", "12m", "all"] as const;
type Range = typeof RANGES[number];
const rangeLabels = { "7d": "money.range7d", month: "money.rangeMonth", last: "money.rangeLast", "12m": "money.range12m", all: "money.rangeAll" } as const;
const path = (id: string, window: { from: string | null; to: string }) => `/shops/${id}/summary?${new URLSearchParams(window.from ? { from: window.from, to: window.to } : { to: window.to })}`;

export default function Reports() {
  const { t, lang, date } = useT();
  const router = useRouter();
  const session = useSession();
  const subject = session && decodeJwtSubject(session.accessToken);
  const { shopId, shops, setShopId } = useMerchantShop();
  const [range, setRange] = useState<Range>("month");
  const [scope, setScope] = useState<"shop" | "all">("shop");
  const owned = shops.filter((shop) => can(String(shop.role), "payouts:read"));
  const multi = owned.length > 1;
  const all = scope === "all" && multi;
  const branches = all ? owned : owned.filter((shop) => shop.id === shopId);
  const current = ranges.rangeDates(range);
  const previous = ranges.previousRange(range);
  const options = (path: string) => ({
    queryKey: ["merchant", path, subject],
    queryFn: ({ signal }: { signal: AbortSignal }) => api<math.Summary>(path, { signal }),
  });
  const now = useQueries({ queries: branches.map((branch) => options(path(String(branch.id), current))) });
  const before = useQueries({ queries: previous ? branches.map((branch) => options(path(String(branch.id), previous))) : [] });
  const queries = [...now, ...before];
  const refresh = () => { void Promise.all(queries.map((q) => q.refetch())); };
  const err = queries.find((q) => q.error)?.error;
  const ready = !!branches.length && now.every((q) => !!q.data);
  const parts = ready ? branches.map((branch, i) => ({ id: String(branch.id), shopName: String(branch.name), current: now[i]!.data!, previous: before[i]?.data ?? null })) : [];
  const data = parts.length ? all ? math.mergeReports(parts) : math.fromSummary(parts[0]!.current, parts[0]!.previous) : null;
  const totals = data ? math.totals(data.days) : null;
  const old = data?.prevDays ? math.totals(data.prevDays) : null;
  const validComparison = !!old && !!previous && range !== "all" && before.every((q) => q.isSuccess);
  const comparison = totals && validComparison ? math.compare(totals.money, old!.money) : null;
  const previousLabel = range !== "all" ? t(`money.prev_${range}`) : "";
  const source = totals ? math.share(totals.onlineEarnings, totals.walkinCash) : null;
  const monthly = range === "all" || range === "12m";
  const buckets = data ? math.bucketize(data.days, monthly ? "month" : "day") : [];
  const label = (key: string) => monthly ? date(`${key}-01T12:00:00+05:30`, { month: "short", year: "numeric" })
    : `${Number(key.slice(-2))}/${Number(key.slice(5, 7))}`;
  const best = math.best(buckets, math.moneyOf);
  const week = data ? math.weekdayAverages(data.days) : [];
  const weekdayLabels = week.map((_, i) => date(`2024-01-0${i + 1}T12:00:00+05:30`, { weekday: "short" }));
  const bestDay = Math.max(0, ...week);
  const hasBestDay = bestDay > 0 && week.filter((n) => n === bestDay).length === 1;
  const shopTotals = parts.map((part) => ({ ...part, totals: math.totals(part.current.days) })).sort((a, b) => b.totals.money - a.totals.money);
  const totalVehicles = data?.vehicles.slice().sort((a, b) => (b.earnings ?? 0) - (a.earnings ?? 0)) ?? [];

  return <Screen background="canvas" scroll={false} padded={false} edges={["bottom", "left", "right"]}>
    <Stack.Screen options={{ title: t("money.reportsTitle"), headerTitle: "" }} />
    {!branches.length ? <EmptyState text={t("money.ownerOnly")} /> : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={totals?.rides ? totalVehicles : []} keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: space[4], gap: space[3] }} refreshing={queries.some((q) => q.isRefetching)} onRefresh={refresh}
      ListHeaderComponent={<Fields>
        <PageTitle title={t("money.reportsTitle")} subtitle={t(all ? "money.reportsSubtitleAll" : "money.reportsSubtitle")} />
        {multi && <Segmented pill value={scope} onChange={setScope} options={[{ value: "shop", label: t("money.scopeShop") }, { value: "all", label: t("money.scopeAll") }]} />}
        <Tabs pill value={range} onChange={setRange} options={RANGES.map((value) => ({ value, label: t(rangeLabels[value]) }))} />
        {err && <ErrorNote text={errorText(lang, err)} retryLabel={t("common.retry")} onRetry={refresh} />}
        {data && totals && totals.rides > 0 && <>
          <HeroCard label={t(`money.q_earn_${range}`)} value={rupees(totals.money)} icon={ChartNoAxesCombined}>
            {comparison ? <Text size="sm" color={comparison.direction === "up" ? "verified" : comparison.direction === "down" ? "danger" : "ink2"}
              style={{ alignSelf: "flex-start", backgroundColor: comparison.direction === "up" ? colors.verifiedSoft : comparison.direction === "down" ? colors.dangerSoft : colors.surface3, borderRadius: radius.row, padding: space[2] }}>
              {t(comparison.direction === "up" ? "money.more" : comparison.direction === "down" ? "money.less" : "money.same",
                { amount: rupees(Math.abs(comparison.diff)), prev: previousLabel })} {comparison.pct != null && comparison.pct !== 0 ? t("money.pct", { pct: Math.abs(comparison.pct) }) : ""}
            </Text> : range === "all" && <Text style={{ color: counter.muted }}>{t("money.sinceFirst", { date: dateLabel(data.from, lang) })}</Text>}
            <Text style={{ color: counter.muted }}>{t(totals.rides === 1 ? "money.rides_one" : "money.rides_other", { n: totals.rides })} · {t("money.perRide", { amount: rupees(totals.money / totals.rides) })}</Text>
          </HeroCard>
          {comparison && range !== "all" && data.prevDays && <Card style={counterStyles.panel} title={t(`money.q_ahead_${range}`)}><Fields>
            <Text>{t(comparison.direction === "up" ? "money.ahead" : comparison.direction === "down" ? "money.behind" : "money.level",
              { amount: rupees(Math.abs(comparison.diff)), prev: previousLabel })}</Text>
            <RunningTotalChart current={math.runningTotals(data.days.map(math.moneyOf))} previous={math.runningTotals(data.prevDays.map(math.moneyOf))}
              labels={[t(`money.line_cur_${range}`), t(`money.line_prev_${range}`)]} />
          </Fields></Card>}
          <Card style={counterStyles.panel} title={t(monthly ? "money.q_moneyMonth" : "money.q_moneyDay")}><Fields>
            {best && <Text>{t(monthly ? "money.bestMonth" : "money.bestDay", { when: label(best.key), amount: rupees(math.moneyOf(best)) })}</Text>}
            <BarChart data={buckets.map((b) => ({ label: monthly ? `${date(`${b.key}-01T12:00:00+05:30`, { month: "short" })} ${b.key.slice(2, 4)}` : label(b.key), values: [b.onlineEarnings, b.walkinCash] }))}
              series={[t("money.fromOnline"), t("money.walkinShort")]} format={rupees} />
            <Text color="ink2" size="xs">{t("money.moneyCaption")}</Text>
          </Fields></Card>
          {range !== "7d" && <Card style={counterStyles.panel} title={t("money.q_weekdays")}><Fields>
            <Text>{hasBestDay ? t("money.busiestDay", { day: weekdayLabels[week.indexOf(bestDay)] ?? "", n: bestDay.toFixed(1) }) : t("money.noBusiestDay")}</Text>
            <BarChart data={week.map((n, i) => ({ label: weekdayLabels[i]!, values: [n] }))} series={[t("money.avgRides")]} format={(value) => value.toFixed(1)} />
            <Text size="xs" color="ink2">{t("money.weekdaysCaption")}</Text>
          </Fields></Card>}
          {source && <Card style={counterStyles.panel} title={t("money.q_source")}><Fields>
            <Text>{t("money.srcTakeaway", { pct: source.online })}</Text>
            <View style={{ flexDirection: "row", height: space[2], gap: space[1] }} accessible={false}>
              {source.online > 0 && <View style={{ flex: source.online, backgroundColor: colors.info }} />}
              {source.walkin > 0 && <View style={{ flex: source.walkin, backgroundColor: colors.verified }} />}
            </View>
            <Text size="sm" color="ink2">{t("money.tileSplit", { online: rupees(totals.onlineEarnings), walkin: rupees(totals.walkinCash) })}</Text>
          </Fields></Card>}
          {all && <Card style={counterStyles.panel} title={t("money.q_shops")}><Fields>
            {shopTotals[0] && <Text>{t("money.topShop", { shop: shopTotals[0].shopName, amount: rupees(shopTotals[0].totals.money) })}</Text>}
            {shopTotals.map((item) => <Fields key={item.id}>
              <CounterRowLink icon={Store} title={item.shopName} trailing={<Text weight="bold" tnum>{rupees(item.totals.money)}</Text>}
              onPress={() => { setShopId(item.id); setScope("shop"); }} detail={t("money.shopLine", {
                rides: t(item.totals.rides === 1 ? "money.rides_one" : "money.rides_other", { n: item.totals.rides }), vehicles: item.current.vehicles.length,
                pct: Math.round(100 * item.current.vehicles.reduce((n, v) => n + v.busyDays, 0) / Math.max(1, item.current.vehicles.length * item.current.rangeDays)),
              })} />
            </Fields>)}
          </Fields></Card>}
          <Text size="lg" weight="bold" accessibilityRole="header">{t("money.q_vehicles")}</Text>
          {totalVehicles[0] && <Text>{t("money.topVehicle", { vehicle: `${totalVehicles[0].make} ${totalVehicles[0].model}`, amount: rupees(totalVehicles[0].earnings ?? 0) })}</Text>}
          <Text size="xs" color="ink2">{t("money.busyCaption")}</Text>
        </>}
      </Fields>}
      ListEmptyComponent={!ready && !err ? <LoadingRows label={t("common.loading")} />
        : !err && !totals?.rides ? <EmptyState text={t("money.emptyRange")} action={range !== "all"
          ? <Button label={t("money.seeAllTime")} onPress={() => setRange("all")} /> : undefined} /> : <></>}
      renderItem={({ item }) => {
        const days = data?.rangeDays ?? 0;
        const pct = Math.round(100 * item.busyDays / Math.max(1, days));
        return <Card style={counterStyles.panel}><Fields>
          <View style={counterStyles.row}>
            <VehicleThumb vehicleId={item.id} vehicle={item} size={56} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text weight="bold" style={{ color: counter.navy }}>{item.make} {item.model}</Text>
              <Text size="sm" color="ink2" tnum>{item.registrationNumber}{item.shopName ? ` · ${item.shopName}` : ""}</Text>
            </View>
            <Text weight="bold" size="lg" tnum style={{ color: counter.navy }}>{rupees(item.earnings ?? 0)}</Text>
          </View>
          <View accessible={false} style={{ height: 5, borderRadius: radius.full, overflow: "hidden", backgroundColor: counter.pale }}>
            <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: 5, backgroundColor: colors.verified }} />
          </View>
          <StatusBadge tone={pct >= 50 ? "good" : "muted"} label={t("money.busyDays", { busy: item.busyDays, days, pct })} />
          {days >= 14 && pct < 20 && <Button variant="ghost" label={t("money.idleTip")}
            onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: item.id, tab: "price" } })} />}
        </Fields></Card>;
      }} />}
  </Screen>;
}
