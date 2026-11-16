import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, View, type ListRenderItem } from "react-native";
import { AlertTriangle, Bike, CalendarClock, Plus, Rocket, Star } from "lucide-react-native";
import {
  Button, Card, Chip, EmptyState, ErrorNote, LoadingRows, Screen, Text, bookingStage, colors,
  dateLabel, errorText, istDay, radius, rupees, space, tone, useT, type BookingStage, type Row, type Tone,
} from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../state/query";
import { useMerchantShop } from "../../state/shop";
import { HandoverSheet } from "../bookings/HandoverSheet";
import { ReturnSheet } from "../bookings/ReturnSheet";
import { WalkinSheet } from "../bookings/WalkinSheet";
import { renterName, vehicleLabel } from "../bookings/common";
import { useSetup } from "../fleet/listing";
import { vehicleNow, AVAIL_ORDER, AVAIL_TONE } from "../fleet/vehicleNow";
import { ShopHeader, ShopSwitcher } from "../shop/ShopHeader";
import { CounterRow } from "./CounterRow";
import { BarChart } from "./BarChart";

type Summary = {
  days: { date: string; online: number; walkin: number; onlineEarnings?: number; walkinCash?: number }[];
  totals: { online: number; walkin: number }; money?: { paid: number; pending: number; walkinCash: number };
};
type Reviews = { rating: number | null; reviewCount: number; reviews: Row[] };
type Need = { id: string; text: string; tone: Tone; booking?: Row; stage?: BookingStage; open?: () => void };
type Entry = { kind: "today" | "upcoming"; id: string; b: Row; stage: BookingStage } | { kind: "sections"; id: string };

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

  const staged = (active.data?.bookings ?? []).map((b) => ({ b, stage: bookingStage(b, now) }));
  const count = (...stages: BookingStage[]) => staged.filter(({ stage }) => stages.includes(stage)).length;
  const late = count("OVERDUE");
  const todayRows = staged.filter(({ stage }) => ["PICKUP_TODAY", "PICKUP_LATE", "RETURN_TODAY", "OVERDUE"].includes(stage));
  const isLate = (stage: BookingStage) => stage === "PICKUP_LATE" || stage === "OVERDUE";
  const due = (stage: BookingStage, b: Row) => String(stage.startsWith("PICKUP") ? b.scheduled_pickup_at : b.scheduled_return_at);
  todayRows.sort((a, b) => Number(isLate(b.stage)) - Number(isLate(a.stage)) || due(a.stage, a.b).localeCompare(due(b.stage, b.b)));
  const upcoming = staged.filter(({ stage }) => stage === "UPCOMING")
    .sort((a, b) => String(a.b.scheduled_pickup_at).localeCompare(String(b.b.scheduled_pickup_at))).slice(0, 12);

  const needs: Need[] = [];
  for (const { b, stage } of staged) {
    if (!isLate(stage)) continue;
    needs.push({ id: String(b.id), stage, booking: b, tone: "bad", text: t(stage === "OVERDUE" ? "overview.needOverdue" : "overview.needLatePickup",
      { name: renterName(b), vehicle: String(b.registration_number ?? "") }) });
  }
  for (const vehicle of vehicles.data?.vehicles ?? []) {
    if (vehicle.verification_status === "REJECTED") needs.push({ id: `veh-${vehicle.id}`, tone: "attention", open: () => router.push({ pathname: "/vehicle/[id]", params: { id: String(vehicle.id), shopId, tab: "documents" } }),
      text: t("overview.needVehicleRejected", { vehicle: String(vehicle.registration_number) }) });
  }
  for (const licence of licences.data?.licences ?? []) {
    const number = String(licence.licence_number ?? "");
    const expiry = String(licence.expires_at ?? "").slice(0, 10);
    if (licence.status !== "ACTIVE") needs.push({ id: `lic-${licence.id}`, tone: "attention", open: () => router.push("/papers"),
      text: t("overview.needLicence", { number, status: tMaybe(`overview.licence_${licence.status}`) ?? String(licence.status) }) });
    else if (expiry && expiry <= soon) needs.push({ id: `lic-${licence.id}`, tone: "attention", open: () => router.push("/papers"),
      text: t("overview.needLicenceExpiring", { number, date: dateLabel(expiry, lang) }) });
  }
  if (payout.isSuccess && payout.data?.status !== "VERIFIED") needs.push({ id: "bank", tone: "attention", open: () => router.push("/earnings"),
    text: t(payout.data == null ? "overview.needPayoutAccount" : "overview.needPayoutUnverified") });
  for (const ticket of tickets.data?.tickets ?? []) {
    if (ticket.status !== "RESOLVED") needs.push({ id: `tk-${ticket.id}`, tone: "info", open: () => router.push({ pathname: "/chat/[ticketId]", params: { ticketId: String(ticket.id) } }),
      text: t("overview.needChat", { subject: String(ticket.subject ?? t("overview.chatNoSubject")) }) });
  }

  const stats: { title: string; caption: string; value: number; tone: Tone }[] = [
    { title: t("overview.statPickups"), caption: t("overview.statPickupsCaption"), value: count("PICKUP_TODAY"), tone: "attention" },
    { title: t("overview.statOnRide"), caption: t("overview.statOnRideCaption"), value: count("ON_RIDE", "RETURN_TODAY", "OVERDUE"), tone: "info" },
    { title: t("overview.statDueBack"), caption: late ? t("overview.statDueBackLate", { count: late }) : t("overview.statDueBackCaption"), value: count("RETURN_TODAY", "OVERDUE"), tone: late ? "bad" : "good" },
    { title: t("overview.statNeedsYou"), caption: t("overview.statNeedsYouCaption"), value: needs.length, tone: needs.length ? "attention" : "good" },
  ];
  const values: Entry[] = [
    ...todayRows.map(({ b, stage }): Entry => ({ kind: "today", id: String(b.id), b, stage })),
    ...upcoming.map(({ b, stage }): Entry => ({ kind: "upcoming", id: String(b.id), b, stage })),
    { kind: "sections", id: "sections" },
  ];

  const heading = (label: string) => <Text size="lg" weight="bold" accessibilityRole="header">{label}</Text>;
  function loadError(error: Error, retry: () => unknown) {
    return <ErrorNote text={errorText(lang, error)} retryLabel={t("common.retry")} onRetry={() => void retry()} />;
  }

  const renderItem: ListRenderItem<Entry> = ({ item, index }) => {
    if (item.kind !== "sections") return <View style={{ gap: space[2] }}>
      {item.kind === "upcoming" && index === todayRows.length && heading(t("overview.comingUp"))}
      <CounterRow b={item.b} stage={item.stage} onHandover={setHandover} onReturn={setReturning}
        onDetails={() => router.push({ pathname: "/booking/[id]", params: { id: String(item.b.id), shopId } })} />
    </View>;

    const vRows = (vehicles.data?.vehicles ?? []).map((v) => ({ v, ...vehicleNow(v, staged) }))
      .sort((a, b) => AVAIL_ORDER[a.avail] - AVAIL_ORDER[b.avail]);
    const when = (at: unknown) => istDay(new Date(String(at))) === today ? time(at) : date(at, { weekday: "short", day: "numeric" });
    const report = summary.data;
    const isMoney = can("payouts:read") && !!report?.money;
    const sourceKeys = isMoney ? [t("overview.earningsOnline"), t("overview.earningsWalkin")] : [t("common.online"), t("common.walkin")];
    const series = report?.days.map((d) => ({
      label: date(`${d.date}T12:00:00+05:30`, { weekday: "short" }),
      values: isMoney ? [d.onlineEarnings ?? 0, d.walkinCash ?? 0] : [d.online, d.walkin],
    })) ?? [];
    const sums = series.reduce(([online, cash], d) => [online! + d.values[0]!, cash! + d.values[1]!], [0, 0]);
    const attentionError = [tickets, licences, ...(can("payouts:read") ? [payout] : [])].find((q) => q.isError);
    return <View style={{ gap: space[4] }}>
      {!upcoming.length && active.isSuccess && <Card title={t("overview.comingUp")}><Text color="ink2">{t("overview.comingUpEmpty")}</Text></Card>}
      <Card title={t("overview.needsTitle")} icon={AlertTriangle}>
        <View style={{ gap: space[3] }}>
          {attentionError?.error && loadError(attentionError.error, attentionError.refetch)}
          {needs.length === 0 && !attentionError && <Text color="ink2">{t("overview.needsEmpty")}</Text>}
          {needs.slice(0, 12).map((item) => <View key={item.id} style={{ gap: space[1], padding: space[2], borderRadius: radius.row, backgroundColor: tone[item.tone].bg }}>
            <Text>{item.text}</Text>
            {item.open && <Button variant="ghost" label={t("common.view")} onPress={item.open} />}
            {item.booking && item.stage === "OVERDUE" && can("bookings:return") && <Button label={t("actions.markReturned")} onPress={() => setReturning(item.booking!)} />}
            {item.booking && item.stage === "PICKUP_LATE" && can("bookings:write") && <Button label={t("actions.handover")} onPress={() => setHandover(item.booking!)} />}
          </View>)}
        </View>
      </Card>
      <Card title={t("overview.fleetNow")} icon={Bike}>
        <Button label={t("overview.manageFleet")} variant="ghost" onPress={() => router.push("/vehicles")} />
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
              {(["FREE", "TODAY", "OUT", "BLOCKED"] as const).map((key) => <Chip key={key} tone={AVAIL_TONE[key]}
                label={`${vRows.filter((row) => row.avail === key).length} · ${t(`overview.avail_${key}`)}`} />)}
            </View>
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
                <Chip tone={late || missed ? "bad" : AVAIL_TONE[avail]}
                  label={late ? t("status.stage_OVERDUE") : missed ? t("status.stage_PICKUP_LATE") : t(`overview.avail_${avail}`)} />
              </View>;
            })}
          </View>}
      </Card>
      <Card title={t(isMoney ? "overview.earningsTitle" : "overview.ridesTitle")}>
        {summary.isPending ? <LoadingRows rows={2} label={t("common.loading")} /> : summary.isError ? loadError(summary.error, summary.refetch)
          : <View style={{ gap: space[2] }}>
            <Text weight="bold" size="xl">{isMoney ? rupees(sums[0]! + sums[1]!) : t("overview.ridesTotal", { count: report!.totals.online + report!.totals.walkin })}</Text>
            {isMoney && <Text color="ink2" size="sm">{sourceKeys[0]}: {rupees(sums[0]!)} · {sourceKeys[1]}: {rupees(sums[1]!)}</Text>}
            <BarChart data={series} series={sourceKeys} format={isMoney ? rupees : undefined} />
            {isMoney && <Text color="ink2" size="xs">{t("overview.earningsCaption")}</Text>}
          </View>}
      </Card>
      <Card title={t("overview.reviewsTitle")} icon={Star}>
        {reviews.isPending ? <LoadingRows rows={2} label={t("common.loading")} /> : reviews.isError ? loadError(reviews.error, reviews.refetch)
          : !reviews.data.reviewCount ? <EmptyState text={t("overview.reviewsEmpty")} />
          : <View style={{ gap: space[3] }}>
            <Text weight="bold">{t(reviews.data.reviewCount === 1 ? "overview.reviewsSummary_one" : "overview.reviewsSummary",
              { rating: (reviews.data.rating ?? 0).toFixed(1), count: reviews.data.reviewCount })}</Text>
            {reviews.data.reviews.slice(0, 5).map((r) => <View key={String(r.id)} style={{ backgroundColor: colors.surface2, padding: space[3], borderRadius: radius.row, gap: space[1] }}>
              <Text weight="medium">{Number(r.rating)} / 5 · {date(r.created_at)}</Text>
              {r.comment != null && <Text>{String(r.comment)}</Text>}
              <Text size="sm" color="ink2">{String(r.reviewer_name ?? t("overview.anonymous"))} · {String(r.registration_number ?? "")}</Text>
            </View>)}
          </View>}
      </Card>
    </View>;
  };

  return <Screen scroll={false} padded={false} background="canvas">
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={values} keyExtractor={(item) => item.id} renderItem={renderItem}
      contentContainerStyle={{ padding: space[4], gap: space[4] }} refreshing={refreshing} onRefresh={() => void refresh()}
      ListHeaderComponent={<View style={{ gap: space[4] }}>
        <ShopHeader title={myName ? t("overview.greeting", { name: myName.split(" ")[0]! }) : t("overview.greetingNoName")} />
        <Text color="ink2">{t("overview.todayIs", { date: date(now, { weekday: "long", day: "numeric", month: "long" }) })}</Text>
        <ShopSwitcher />
        {can("bookings:write") && <Button icon={Plus} variant="primary" size="lg" label={t("overview.newWalkin")} onPress={() => setWalkin(true)} />}
        {setup.data && !setup.data.done && <Card title={t("setup.chipTitle")} icon={Rocket} style={{ backgroundColor: colors.amberSoft }}>
          <Text>{t("setup.chipProgress", { n: Object.values(setup.data.steps).filter(Boolean).length })}</Text>
          <Button label={t("shop.getListed")} variant="primary" onPress={() => router.push("/setup")} />
        </Card>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {stats.map((stat) => <Card key={stat.title} style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: tone[stat.tone].bg }}>
            <Text size="sm" weight="bold">{stat.title}</Text>
            <Text size="xl" weight="bold">{active.isSuccess ? stat.value : "—"}</Text>
            <Text size="xs">{stat.caption}</Text>
          </Card>)}
        </View>
        <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}><CalendarClock color={colors.ink2} size={20} />{heading(t("overview.todayTitle"))}</View>
        <Button variant="ghost" label={t("common.seeAll")} accessibilityLabel={t("bookings.title")} onPress={() => router.push({ pathname: "/bookings", params: { tab: "today" } })} />
        {active.isPending ? <LoadingRows label={t("common.loading")} /> : active.isError ? loadError(active.error, active.refetch)
          : !todayRows.length ? <EmptyState text={t("overview.todayEmpty")} /> : null}
      </View>}
    />
    <WalkinSheet open={walkin} onClose={() => setWalkin(false)} />
    <HandoverSheet booking={handover} onClose={() => setHandover(null)} />
    <ReturnSheet booking={returning} onClose={() => setReturning(null)} />
  </Screen>;
}
