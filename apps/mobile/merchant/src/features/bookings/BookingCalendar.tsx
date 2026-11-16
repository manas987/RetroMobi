import { useState, type ReactNode } from "react";
import { FlatList, View } from "react-native";
import { Plus } from "lucide-react-native";
import {
  Button, Card, Chip, EmptyState, ErrorNote, LoadingRows, MonthGrid, Text, bookingFilters, bookingStage,
  dateLabel, errorText, istBookingTime, istDay, monthDays, monthOf, space, tone, useT, type BookingStage, type Row, type Tone,
} from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../state/query";
import { useMerchantShop } from "../../state/shop";
import { CounterRow } from "../overview/CounterRow";

export type BookingActions = { onHandover: (b: Row) => void; onReturn: (b: Row) => void; onDetails: (b: Row) => void };

function calendarTone(stage: BookingStage): Tone {
  if (stage === "PICKUP_LATE" || stage === "OVERDUE") return "bad";
  if (stage === "ON_RIDE" || stage === "RETURN_TODAY") return "info";
  if (stage === "RETURNED" || stage === "DEPOSIT_CLAIMED") return "good";
  return "attention";
}

export function BookingCalendar({ shopId, filters, actions, header, onWalkin }: {
  shopId: string; filters: bookingFilters.Filters; actions: BookingActions; header: ReactNode; onWalkin: (day: string) => void;
}) {
  const { t, lang, date } = useT();
  const { can } = useMerchantShop();
  const today = istDay(new Date());
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);
  const days = monthDays(month);
  const range = bookingFilters.withFilters(new URLSearchParams({
    from: new Date(istBookingTime(days[0]!, "00:00")).toISOString(),
    to: new Date(`${days.at(-1)}T23:59:59+05:30`).toISOString(),
  }), filters);
  const q = useMerchantQuery<{ bookings: Row[] }>(`/shops/${shopId}/bookings?${range}`);
  const staged = (q.data?.bookings ?? []).map((b) => ({ b, stage: bookingStage(b) })).filter(({ stage }) => stage !== "AWAITING_PAYMENT");
  const selectedItems = staged.filter(({ b }) => bookingFilters.daysCovered(b).includes(selected))
    .sort((a, b) => bookingFilters.pickupIso(a.b).localeCompare(bookingFilters.pickupIso(b.b)));
  const bars = new Map<string, { lanes: (Tone | null)[]; hidden: number }>();
  for (let start = 0; start < days.length; start += 7) {
    const week = days.slice(start, start + 7);
    const segments = bookingFilters.weekSegments(staged, week);
    week.forEach((day, index) => {
      const daySegments = segments.filter((s) => s.start <= index && s.start + s.span > index);
      bars.set(day, {
        lanes: Array.from({ length: 3 }, (_, lane) => {
          const s = daySegments.find((segment) => segment.lane === lane);
          return s ? calendarTone(s.stage) : null;
        }),
        hidden: daySegments.filter((s) => s.lane >= 3).length,
      });
    });
  }
  const legend: [Tone, string][] = [["attention", t("bookings.legendPickup")], ["info", t("bookings.legendOnride")],
    ["bad", t("bookings.legendLate")], ["good", t("bookings.legendFinished")]];

  return <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={q.isSuccess ? selectedItems : []} keyExtractor={({ b }) => String(b.id)}
    refreshing={q.isRefetching} onRefresh={() => void q.refetch()} contentContainerStyle={{ gap: space[3], padding: space[4] }}
    ListHeaderComponent={<View style={{ gap: space[3] }}>
      {header}
      <Card>
        <MonthGrid month={month} selected={selected} lang={lang} onPress={setSelected} onMonthChange={(next) => {
          setMonth(next);
          const prefix = `${next.y}-${String(next.m).padStart(2, "0")}`;
          setSelected(today.startsWith(prefix) ? today : `${prefix}-01`);
        }} renderDay={(day) => {
          const info = bars.get(day);
          if (!info || (!info.hidden && info.lanes.every((value) => !value))) return null;
          return <View accessible={false} style={{ alignSelf: "stretch", gap: 2 }}>
            {info.lanes.map((value, i) => <View key={i} style={{ height: 3, backgroundColor: value ? tone[value].dot : "transparent" }} />)}
            {info.hidden > 0 && <Text size="xs" center color="ink2">{t("bookings.more", { count: info.hidden })}</Text>}
          </View>;
        }} />
        <Button label={t("common.today")} variant="ghost" onPress={() => { setMonth(monthOf(today)); setSelected(today); }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {legend.map(([key, label]) => <Chip key={key} tone={key} label={label} />)}
        </View>
      </Card>
      <Text size="lg" weight="bold" accessibilityRole="header">{t("bookings.dayBookings", { date: date(`${selected}T12:00:00+05:30`, { weekday: "long", day: "numeric", month: "long" }) })}</Text>
      {can("bookings:write") && selected >= today && <Button icon={Plus} variant="primary" label={t("bookings.newWalkinOn", { date: dateLabel(selected, lang) })} onPress={() => onWalkin(selected)} />}
    </View>}
    ListEmptyComponent={q.isPending ? <LoadingRows label={t("common.loading")} />
      : q.isError ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />
      : <EmptyState text={t(staged.length ? "bookings.noDay" : "bookings.noMonth")} />}
    renderItem={({ item }) => <CounterRow b={item.b} stage={item.stage} onHandover={actions.onHandover} onReturn={actions.onReturn} onDetails={() => actions.onDetails(item.b)} />} />;
}
