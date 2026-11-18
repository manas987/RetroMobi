import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View, type ListRenderItem } from "react-native";
import Animated, { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { Bike, CalendarClock, ChevronRight, FileText, KeyRound, Landmark, MessageCircle, Plus, Rocket, Star, Undo2, type LucideIcon } from "lucide-react-native";
import {
  Button, Card, EmptyState, ErrorNote, LoadingRows, Screen, Text, colors,
  dateLabel, errorText, istDay, radius, rupees, space, tone, useT, type BookingStage, type Row, type Tone,
} from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../state/query";
import { useMerchantShop } from "../../state/shop";
import { HandoverSheet } from "../bookings/HandoverSheet";
import { ReturnSheet } from "../bookings/ReturnSheet";
import { WalkinSheet } from "../bookings/WalkinSheet";
import { vehicleLabel } from "../bookings/common";
import { useSetup } from "../fleet/listing";
import { vehicleNow, AVAIL_ORDER, AVAIL_TONE } from "../fleet/vehicleNow";
import { LanguageButton, ShopSwitcher } from "../shop/ShopHeader";
import { HeroCard, StatChip, StatusBadge, counter, counterStyles } from "../../ui/Counter";
import { Disclosure } from "../../ui/Disclosure";
import { overviewSchedule } from "./schedule";
import { CounterRow } from "./CounterRow";
import { BarChart } from "./BarChart";

type Summary = {
  days: { date: string; online: number; walkin: number; onlineEarnings?: number; walkinCash?: number }[];
  totals: { online: number; walkin: number }; money?: { paid: number; pending: number; walkinCash: number };
};
type Reviews = { rating: number | null; reviewCount: number; reviews: Row[] };
type Need = { id: string; text: string; tone: Tone; icon: LucideIcon; open: () => void };
type Entry = { kind: "overdue" | "today" | "upcoming"; id: string; b: Row; stage: BookingStage } | { kind: "sections" | "todayEmpty" | "attention"; id: string };

const LIVE = { refetchInterval: 30_000 };
const DAY = 86_400_000;

export function Overview({ shopId }: { shopId: string }) {
  const router = useRouter();
  const { t, tMaybe, date, time, lang } = useT();
  const { can, myName, reloadShops } = useMerchantShop();
  const [handover, setHandover] = useState<Row | null>(null);
  const [returning, setReturning] = useState<Row | null>(null);
  const [walkin, setWalkin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllNeeds, setShowAllNeeds] = useState(false);
  // Walk-in hides while scrolling down (so it never sits on a row) and returns on the way up or at the top.
  const [fab, setFab] = useState(true);
  const lastY = useRef(0);

  const now = new Date();
  const today = istDay(now);
  const from = istDay(new Date(now.getTime() - 6 * DAY));
  const soon = istDay(new Date(now.getTime() + 30 * DAY));
  const root = `/shops/${shopId}`;
  const active = useMerchantQuery<{ bookings: Row[] }>(`${root}/bookings?status=CONFIRMED`, LIVE);
  const vehicles = useMerchantQuery<{ vehicles: Row[] }>(`${root}/vehicles`);
  const reviews = useMerchantQuery<Reviews>(`${root}/reviews`);
  const summary = useMerchantQuery<Summary>(`${root}/summary?from=${from}&to=${today}`);
  const tickets = useMerchantQuery<{ tickets: Row[] }>("/tickets", LIVE);
  const licences = useMerchantQuery<{ licences: Row[] }>("/licences");
  const payout = useMerchantQuery<Row | null>(can("payouts:read") ? "/payout-account" : null);
  const setup = useSetup(can("fleet:read") ? shopId : null);
  const queries = [active, vehicles, reviews, summary, tickets, licences, ...(can("payouts:read") ? [payout] : []), ...(can("fleet:read") ? [setup] : [])];

  async function refresh() {
    setRefreshing(true);
    try { await Promise.all([reloadShops(), ...queries.map((q) => q.refetch())]); }
    finally { setRefreshing(false); }
  }

  const { staged, overdue, today: todayRows, upcoming } = overviewSchedule(active.data?.bookings ?? [], now);
  const count = (...stages: BookingStage[]) => staged.filter(({ stage }) => stages.includes(stage)).length;
  const needs: Need[] = [];
  for (const vehicle of vehicles.data?.vehicles ?? []) {
    if (vehicle.verification_status === "REJECTED") needs.push({ id: `veh-${vehicle.id}`, tone: "attention", icon: Bike, open: () => router.push({ pathname: "/vehicle/[id]", params: { id: String(vehicle.id), shopId, tab: "documents" } }),
      text: t("overview.needVehicleRejected", { vehicle: String(vehicle.registration_number) }) });
  }
  for (const licence of licences.data?.licences ?? []) {
    const number = String(licence.licence_number ?? "");
    const expiry = String(licence.expires_at ?? "").slice(0, 10);
    if (licence.status !== "ACTIVE") needs.push({ id: `lic-${licence.id}`, tone: "attention", icon: FileText, open: () => router.push("/papers"),
      text: t("overview.needLicence", { number, status: tMaybe(`overview.licence_${licence.status}`) ?? String(licence.status) }) });
    else if (expiry && expiry <= soon) needs.push({ id: `lic-${licence.id}`, tone: "attention", icon: FileText, open: () => router.push("/papers"),
      text: t("overview.needLicenceExpiring", { number, date: dateLabel(expiry, lang) }) });
  }
  if (payout.isSuccess && payout.data?.status !== "VERIFIED") needs.push({ id: "bank", tone: "attention", icon: Landmark, open: () => router.push("/earnings"),
    text: t(payout.data == null ? "overview.needPayoutAccount" : "overview.needPayoutUnverified") });
  for (const ticket of tickets.data?.tickets ?? []) {
    if (ticket.status !== "RESOLVED") needs.push({ id: `tk-${ticket.id}`, tone: "info", icon: MessageCircle, open: () => router.push({ pathname: "/chat/[ticketId]", params: { ticketId: String(ticket.id) } }),
      text: t("overview.needChat", { subject: String(ticket.subject ?? t("overview.chatNoSubject")) }) });
  }

  const stats = [
    { title: t("overview.statPickups"), value: count("PICKUP_TODAY"), icon: KeyRound, tone: "attention", tab: "today" },
    { title: t("overview.statOnRide"), value: count("ON_RIDE", "RETURN_TODAY", "OVERDUE"), icon: Bike, tone: "info", tab: "onride" },
    { title: t("overview.statDueBack"), value: count("RETURN_TODAY"), icon: Undo2, tone: "good", tab: "today" },
  ];
  const values: Entry[] = [
    ...overdue.map(({ b, stage }): Entry => ({ kind: "overdue", id: String(b.id), b, stage })),
    ...(needs.length ? [{ kind: "attention" as const, id: "attention" }] : []),
    ...todayRows.map(({ b, stage }): Entry => ({ kind: "today", id: String(b.id), b, stage })),
    ...(!todayRows.length && active.isSuccess ? [{ kind: "todayEmpty" as const, id: "todayEmpty" }] : []),
    ...upcoming.map(({ b, stage }): Entry => ({ kind: "upcoming", id: String(b.id), b, stage })),
    { kind: "sections", id: "sections" },
  ];

  const heading = (label: string) => <Text size="lg" weight="bold" accessibilityRole="header">{label}</Text>;
  function loadError(error: Error, retry: () => unknown) {
    return <ErrorNote text={errorText(lang, error)} retryLabel={t("common.retry")} onRetry={() => void retry()} />;
  }

  const attentionError = [tickets, licences, ...(can("payouts:read") ? [payout] : [])].find((q) => q.isError);

  const renderItem: ListRenderItem<Entry> = ({ item, index }) => {
    if (item.kind === "attention") return <View style={styles.attention}>
          <View style={styles.sectionTitle}>
            <Text weight="bold" style={{ flex: 1 }}>{t("overview.needsTitle")}</Text>
            <Text size="sm" weight="bold" tnum>{needs.length}</Text>
          </View>
          {(showAllNeeds ? needs : needs.slice(0, 3)).map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={item.open}
            style={({ pressed }) => [styles.need, { opacity: pressed ? 0.6 : 1 }]}>
            <View style={[styles.needIcon, { backgroundColor: item.tone === "attention" ? colors.amberSoft : tone[item.tone].bg }]}>
              <item.icon size={18} color={item.tone === "attention" ? colors.amberText : tone[item.tone].fg} />
            </View>
            <Text size="sm" style={{ flex: 1 }}>{item.text}</Text>
            <ChevronRight size={16} color={colors.ink2} />
          </Pressable>)}
          {needs.length > 3 && <Button variant="ghost" label={t(showAllNeeds ? "overview.showFewer" : "common.seeAll")}
            onPress={() => setShowAllNeeds(!showAllNeeds)} />}
        </View>;
    if (item.kind === "todayEmpty") return <View style={{ gap: space[2], paddingVertical: space[2] }}>
      {heading(t("overview.todayTitle"))}
      <Text size="sm" color="ink2">{t("overview.todayEmpty")}</Text>
    </View>;
    if (item.kind === "overdue" || item.kind === "today" || item.kind === "upcoming") return <View style={{ gap: space[2] }}>
      {(index === 0 || values[index - 1]?.kind !== item.kind) && <View style={styles.sectionTitle}>
        <Text size="lg" weight="bold" accessibilityRole="header" style={{ flex: 1 }}>{t(item.kind === "overdue" ? "overview.overdueTitle" : item.kind === "today" ? "overview.todayTitle" : "overview.comingUp")}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.seeAll")} style={styles.seeAll}
          onPress={() => router.push({ pathname: "/bookings", params: { tab: item.kind === "overdue" ? "late" : item.kind === "today" ? "today" : "upcoming", view: "list" } })}>
          <ChevronRight size={20} color={colors.ink2} />
        </Pressable>
      </View>}
      <CounterRow b={item.b} stage={item.stage} onHandover={setHandover} onReturn={setReturning}
        onDetails={() => router.push({ pathname: "/booking/[id]", params: { id: String(item.b.id), shopId } })} />
    </View>;

    const vRows = (vehicles.data?.vehicles ?? []).map((v) => ({ v, ...vehicleNow(v, staged) }))
      .sort((a, b) => AVAIL_ORDER[a.avail] - AVAIL_ORDER[b.avail]);
    const when = (at: unknown) => istDay(new Date(String(at))) === today ? time(at) : date(at, { weekday: "short", day: "numeric" });
    return <View style={{ gap: space[4] }}>
      <Card title={t("overview.fleetNow")} icon={Bike} style={counterStyles.panel} action={<Button label={t("common.seeAll")} accessibilityLabel={t("overview.manageFleet")} variant="ghost" onPress={() => router.push("/vehicles")} />}>
        {vehicles.isPending ? <LoadingRows rows={2} label={t("common.loading")} /> : vehicles.isError ? loadError(vehicles.error, vehicles.refetch)
          : active.isError ? loadError(active.error, active.refetch) : active.isPending ? <LoadingRows rows={2} label={t("common.loading")} />
          : !vRows.length ? <EmptyState text={t("overview.fleetEmpty")} /> : <View style={{ gap: space[3] }}>
            <View style={{ flexDirection: "row", gap: space[1], borderRadius: radius.full, overflow: "hidden" }} accessible={false}>
              {(["FREE", "TODAY", "OUT", "BLOCKED"] as const).map((key) => {
                const n = vRows.filter((row) => row.avail === key).length;
                return n ? <View key={key} style={{ height: space[2], flex: n, backgroundColor: tone[AVAIL_TONE[key]].dot }} /> : null;
              })}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
              {(["FREE", "TODAY", "OUT", "BLOCKED"] as const).map((key) => <StatusBadge key={key} tone={AVAIL_TONE[key]}
                label={`${vRows.filter((row) => row.avail === key).length} · ${t(`overview.avail_${key}`)}`} />)}
            </View>
            <Disclosure label={t("overview.vehicleDetails")} >
            {vRows.slice(0, 12).map(({ v, avail, out, goes, next, missed, late, blockedUntil }) => {
              const price = v.amount == null ? t("overview.noPrice") : t("common.perDay", { amount: rupees(Number(v.amount)) });
              const detail = avail === "OUT" ? t("overview.backAt", { when: when(out!.b.scheduled_return_at) })
                : avail === "BLOCKED" ? t("overview.blockedTill", { when: when(blockedUntil) })
                : missed ? t("overview.missedAt", { when: when(goes!.b.scheduled_pickup_at) })
                : avail === "TODAY" ? t("overview.goesAt", { when: when(goes!.b.scheduled_pickup_at) })
                : next ? `${price} · ${t("overview.nextBooking", { when: when(next.b.scheduled_pickup_at) })}` : price;
              return <View key={String(v.id)} style={{ gap: space[1] }}>
                <Text weight="medium">{vehicleLabel(v)}</Text>
                <Text color={late || missed ? "danger" : "ink2"} size="sm">{detail}</Text>
                <StatusBadge tone={late || missed ? "bad" : AVAIL_TONE[avail]}
                  label={late ? t("status.stage_OVERDUE") : missed ? t("status.stage_PICKUP_LATE") : t(`overview.avail_${avail}`)} />
              </View>;
            })}
            </Disclosure>
          </View>}
      </Card>
      <Card title={t("overview.reviewsTitle")} icon={Star} style={counterStyles.panel}>
        {reviews.isPending ? <LoadingRows rows={2} label={t("common.loading")} /> : reviews.isError ? loadError(reviews.error, reviews.refetch)
          : !reviews.data.reviewCount ? <EmptyState text={t("overview.reviewsEmpty")} />
          : <View style={{ gap: space[3] }}>
            <View style={{ ...counterStyles.row, gap: space[2] }}>
              <Text size="display" weight="bold" tnum style={{ color: counter.navy }}>{(reviews.data.rating ?? 0).toFixed(1)}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", gap: 2 }} accessible={false}>
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={18} color={colors.amberEdge} fill={n <= Math.round(reviews.data.rating ?? 0) ? colors.amber : "transparent"} />)}
                </View>
                <Text size="sm" color="ink2">{t(reviews.data.reviewCount === 1 ? "overview.reviewsSummary_one" : "overview.reviewsSummary",
                  { rating: (reviews.data.rating ?? 0).toFixed(1), count: reviews.data.reviewCount })}</Text>
              </View>
            </View>
            {reviews.data.reviews.slice(0, 5).map((r) => <View key={String(r.id)} style={{ backgroundColor: colors.surface2, padding: space[3], borderRadius: radius.panel, gap: space[1] }}>
              <Text weight="medium">{Number(r.rating)} / 5 · {date(r.created_at)}</Text>
              {r.comment != null && <Text>{String(r.comment)}</Text>}
              <Text size="sm" color="ink2">{String(r.reviewer_name ?? t("overview.anonymous"))} · {String(r.registration_number ?? "")}</Text>
            </View>)}
          </View>}
      </Card>
    </View>;
  };

    const report = summary.data;
    const isMoney = can("payouts:read") && !!report?.money;
    const sourceKeys = isMoney ? [t("overview.earningsOnline"), t("overview.earningsWalkin")] : [t("common.online"), t("common.walkin")];
    const series = report?.days.map((d) => ({
      label: date(`${d.date}T12:00:00+05:30`, { weekday: "short" }),
      values: isMoney ? [d.onlineEarnings ?? 0, d.walkinCash ?? 0] : [d.online, d.walkin],
    })) ?? [];
    const sums = series.reduce(([online, cash], d) => [online! + d.values[0]!, cash! + d.values[1]!], [0, 0]);

  return <Screen scroll={false} padded={false} background="canvas">
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={values} keyExtractor={(item) => item.id} renderItem={renderItem}
      contentContainerStyle={{ padding: space[4], paddingBottom: can("bookings:write") ? 88 : space[4], gap: space[4] }} refreshing={refreshing} onRefresh={() => void refresh()}
      scrollEventThrottle={100} onScroll={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        if (Math.abs(y - lastY.current) < 12) return;
        const show = y < 40 || y < lastY.current;
        if (show !== fab) setFab(show);
        lastY.current = y;
      }}
      ListHeaderComponent={<View style={{ gap: space[4] }}>
        <View style={styles.sectionTitle}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text size="sm" color="ink2">{myName ? t("overview.greeting", { name: myName.split(" ")[0]! }) : t("overview.greetingNoName")}</Text>
            <Text size="xl" weight="bold" style={{ color: counter.navy }}>{date(now, { weekday: "long", day: "numeric", month: "short" })}</Text>
          </View>
          <LanguageButton />
        </View>
        <ShopSwitcher compact />
        <View style={styles.summary}>
          {stats.map((stat) => <StatChip key={stat.title} icon={stat.icon} tone={stat.tone as Tone} label={stat.title}
            value={active.isSuccess ? String(stat.value) : "—"}
            onPress={() => router.push({ pathname: "/bookings", params: { tab: stat.tab, view: "list" } })} />)}
        </View>
      {summary.isPending ? <LoadingRows rows={1} height={180} label={t("common.loading")} /> : summary.isError ? loadError(summary.error, summary.refetch)
        : <HeroCard label={t(isMoney ? "overview.earningsTitle" : "overview.ridesTitle")} icon={isMoney ? undefined : CalendarClock}
          value={isMoney ? rupees(sums[0]! + sums[1]!) : t("overview.ridesTotal", { count: report!.totals.online + report!.totals.walkin })}>
          {isMoney && <Text color="ink4" size="sm">{sourceKeys[0]}: {rupees(sums[0]!)} · {sourceKeys[1]}: {rupees(sums[1]!)}</Text>}
          <BarChart dark data={series} series={sourceKeys} format={isMoney ? rupees : undefined} />
          {isMoney && <Text color="ink4" size="xs">{t("overview.earningsCaption")}</Text>}
        </HeroCard>}
        {setup.data && !setup.data.done && <Card title={t("setup.chipTitle")} icon={Rocket} style={{ backgroundColor: colors.amberSoft }}>
          <Text>{t("setup.chipProgress", { n: Object.values(setup.data.steps).filter(Boolean).length })}</Text>
          <Button label={t("shop.getListed")} variant="primary" onPress={() => router.push("/setup")} />
        </Card>}
        {attentionError?.error && loadError(attentionError.error, attentionError.refetch)}

        {active.isPending ? <LoadingRows label={t("common.loading")} /> : active.isError ? loadError(active.error, active.refetch) : null}
      </View>}
    />
    {can("bookings:write") && fab && <Animated.View style={styles.walkin} entering={FadeIn.duration(150).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}>
      <Button icon={Plus} variant="primary" label={t("overview.walkinShort")} accessibilityLabel={t("overview.newWalkin")}
        style={styles.walkinButton} onPress={() => setWalkin(true)} />
    </Animated.View>}
    <WalkinSheet open={walkin} onClose={() => setWalkin(false)} />
    <HandoverSheet booking={handover} onClose={() => setHandover(null)} />
    <ReturnSheet booking={returning} onClose={() => setReturning(null)} />
  </Screen>;
}

const styles = StyleSheet.create({
  walkin: { position: "absolute", right: space[4], bottom: space[4] },
  walkinButton: { minHeight: 52, borderRadius: radius.full, elevation: 3, shadowColor: colors.ink, shadowOpacity: 0.12, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8 },
  sectionTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] },
  seeAll: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  summary: { flexDirection: "row", gap: space[1], padding: space[1], backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  attention: { backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[1], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  need: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  needIcon: { width: 36, height: 36, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
});
