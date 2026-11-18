import { useState, type ReactNode } from "react";
import { FlatList, View } from "react-native";
import {
  Button, EmptyState, ErrorNote, LoadingRows, Tabs, Text, bookingFilters, dateLabel, errorText, istDay, space, useT, type Row, type TKey,
} from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../state/query";
import { useMerchantShop } from "../../state/shop";
import { CounterRow } from "../overview/CounterRow";
import type { BookingActions } from "./BookingCalendar";
import { art } from "../../ui/art";

type FilterTab = bookingFilters.Tab;
const labels: Record<FilterTab, TKey> = {
  today: "bookings.tabToday", upcoming: "bookings.tabUpcoming", onride: "bookings.tabOnride",
  late: "bookings.tabLate", finished: "bookings.tabFinished", all: "bookings.tabAll",
};
const empty: Record<FilterTab, TKey> = {
  today: "bookings.emptyToday", upcoming: "bookings.emptyUpcoming", onride: "bookings.emptyOnride",
  late: "bookings.emptyLate", finished: "bookings.emptyFinished", all: "bookings.emptyAll",
};

export function BookingList({ shopId, filters, tab, setTab, header, actions, clear, onWalkin }: {
  shopId: string; filters: bookingFilters.Filters; tab: FilterTab; setTab: (tab: FilterTab) => void;
  header: ReactNode; actions: BookingActions; clear: () => void; onWalkin: () => void;
}) {
  const { t, lang } = useT();
  const { can } = useMerchantShop();
  const [steps, setSteps] = useState(1);
  const now = new Date();
  const day = istDay(new Date(now.getTime() - 90 * steps * 86_400_000));
  const from = new Date(`${day}T00:00:00+05:30`).toISOString();
  const path = (params: Record<string, string>) => `/shops/${shopId}/bookings?${bookingFilters.withFilters(new URLSearchParams(params), filters)}`;
  const active = useMerchantQuery<{ bookings: Row[] }>(path({ status: "CONFIRMED" }), { refetchInterval: 30_000 });
  const finished = useMerchantQuery<{ bookings: Row[] }>(path({ status: "COMPLETED", from }));
  const byId = new Map<string, Row>();
  for (const b of [...(active.data?.bookings ?? []), ...(finished.data?.bookings ?? [])]) byId.set(String(b.id), b);
  const bookings = [...byId.values()];
  const withPast = tab === "finished" || tab === "all";
  const pending = active.isPending || (withPast && finished.isPending);
  const error = active.error ?? (withPast ? finished.error : null);
  const retry = () => { void Promise.all([active.refetch(), finished.refetch()]); };
  const items = bookingFilters.rowsForTab(bookings, tab, now);
  const groups = bookingFilters.groupByDay(items, ({ b }) => ["onride", "late", "finished"].includes(tab) ? bookingFilters.returnIso(b) : bookingFilters.pickupIso(b));
  const list = groups.flatMap(({ day: key, rows }) => rows.map((row, i) => ({ ...row, heading: i === 0 ? key : null })));
  const filtered = bookingFilters.hasFilters(filters);
  const emptyAction = filtered ? <Button label={t("bookings.clear")} onPress={clear} />
    : tab === "today" ? <Button label={t("bookings.seeUpcoming")} onPress={() => setTab("upcoming")} />
    : can("bookings:write") && (tab === "all" || tab === "upcoming") ? <Button variant="primary" label={t("bookings.newWalkin")} onPress={onWalkin} /> : null;
  return <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={pending || error ? [] : list} keyExtractor={({ b }) => String(b.id)}
    contentContainerStyle={{ padding: space[4], gap: space[3] }} keyboardShouldPersistTaps="handled"
    refreshing={active.isRefetching || finished.isRefetching} onRefresh={retry}
    ListHeaderComponent={<View style={{ gap: space[3] }}>
      {header}
      <Tabs pill wrap value={tab} onChange={setTab} options={bookingFilters.TAB_KEYS.map((value) => ({
        value, label: t(labels[value]), count: active.isSuccess && (value !== "finished" && value !== "all" || finished.isSuccess)
          ? bookingFilters.rowsForTab(bookings, value, now).length : undefined,
      }))} />
    </View>}
    ListEmptyComponent={error ? <ErrorNote text={errorText(lang, error)} retryLabel={t("common.retry")} onRetry={retry} />
      : pending ? <LoadingRows label={t("common.loading")} />
      : <EmptyState image={filtered ? undefined : art.emptyBookings} text={t(filtered ? "bookings.emptyFiltered" : empty[tab])} action={emptyAction} />}
    ListFooterComponent={withPast && finished.isSuccess ? <Button variant="ghost" label={t("common.showOlder")} onPress={() => setSteps((n) => n + 1)} /> : undefined}
    renderItem={({ item }) => <View style={{ gap: space[2] }}>
      {item.heading && <Text size="sm" weight="bold" accessibilityRole="header">{dateLabel(item.heading, lang)}</Text>}
      <CounterRow b={item.b} stage={item.stage} onHandover={actions.onHandover} onReturn={actions.onReturn} onDetails={() => actions.onDetails(item.b)} />
    </View>} />;
}
