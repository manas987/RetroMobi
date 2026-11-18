import { useState, type ReactNode } from "react";
import { Animated, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import {
  Chip, EmptyState, ErrorNote, Segmented, Text, STAGE_TONE, bookingStage, colors, dateLabel,
  errorText, HIT, istDay, radius, space, timeline, tone, useT, type Row, type Tone,
} from "@retromobi/mobile-shared";
import { IconAction, counterStyles } from "../../ui/Counter";
import { useMerchantQuery } from "../../state/query";
import { useMerchantShop } from "../../state/shop";
import { renterName, vehicleLabel } from "../bookings/common";
import { Fields, Pending } from "./tabs/Fields";

const dayWidth = HIT + space[2];
const nameWidth = 132;
const at = (day: string) => `${day}T00:00:00+05:30`;
const shift = (day: string, n: number) => istDay(new Date(Date.parse(at(day)) + n * 86_400_000));

export function FleetTimeline({ shopId, header, onBook }: { shopId: string; header: ReactNode; onBook: (id: string, day: string) => void }) {
  const { t, lang, date } = useT();
  const { can } = useMerchantShop();
  const { width: viewport } = useWindowDimensions();
  const today = istDay(new Date());
  const [range, setRange] = useState<"14" | "30">("14");
  const [start, setStart] = useState(today);
  const [x] = useState(() => new Animated.Value(0));
  const days = timeline.dayRange(start, Number(range));
  const width = nameWidth + dayWidth * days.length;
  const params = new URLSearchParams({ from: at(start), to: at(shift(start, Number(range))) });
  const vehicles = useMerchantQuery<{ vehicles: Row[] }>(`/shops/${shopId}/vehicles`);
  const bookings = useMerchantQuery<{ bookings: Row[] }>(`/shops/${shopId}/bookings?${params}`);
  const real = (bookings.data?.bookings ?? []).filter((b) => b.status !== "HOLD" && b.status !== "CANCELLED");
  const retry = () => { void Promise.all([vehicles.refetch(), bookings.refetch()]); };
  const listHead = <Fields>
    {header}
    <Segmented pill value={range} onChange={setRange}
      options={[{ value: "14", label: t("fleet.daysN", { n: 14 }) }, { value: "30", label: t("fleet.daysN", { n: 30 }) }]} />
    <View style={{ ...counterStyles.row, gap: space[1] }}>
      <IconAction icon={ChevronLeft} label={t("common.previous")} onPress={() => setStart(shift(start, -7))} />
      <Text weight="medium" size="sm" center style={{ flex: 1 }} tnum>{dateLabel(days[0], lang)} – {dateLabel(days.at(-1), lang)}</Text>
      <IconAction icon={ChevronRight} label={t("common.next")} onPress={() => setStart(shift(start, 7))} />
      <IconAction icon={CalendarDays} label={t("common.today")} onPress={() => setStart(today)} />
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      {([["fleet.legendPickup", "attention"], ["fleet.legendOut", "info"], ["fleet.legendLate", "bad"], ["fleet.legendDone", "good"], ["fleet.legendBlocked", "muted"]] as const)
        .map(([label, status]) => <Chip key={label} tone={status} label={t(label)} />)}
    </View>
    {can("bookings:write") && <Text size="sm" color="ink2">{t("fleet.tapToBook")}</Text>}
    <Text size="sm" color="ink2">{t("fleet.blockHint")}</Text>
  </Fields>;

  const ready = vehicles.isSuccess && bookings.isSuccess;
  return <Animated.ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled scrollEventThrottle={16}
    contentContainerStyle={{ flexGrow: 1 }}
    onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: true })}>
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={ready ? vehicles.data.vehicles : []} keyExtractor={(vehicle) => String(vehicle.id)}
      style={{ width: ready && vehicles.data.vehicles.length ? Math.max(viewport, width) : viewport }}
      onRefresh={retry} refreshing={vehicles.isRefetching || bookings.isRefetching} nestedScrollEnabled
      ListHeaderComponent={<>
        <Animated.View style={{ width: viewport, padding: space[4], transform: [{ translateX: x }] }}>
          {listHead}
        </Animated.View>
        {ready && vehicles.data.vehicles.length > 0 && <View style={styles.row}>
          <Animated.View style={[styles.pinned, { transform: [{ translateX: x }] }]}><Text weight="bold">{t("actions.vehicle")}</Text></Animated.View>
          {days.map((d) => <View key={d} style={[styles.cell, d === today && styles.today]}>
            <Text size="xs" color="ink2">{date(`${d}T12:00:00+05:30`, { weekday: "narrow" })}</Text><Text weight="bold">{Number(d.slice(-2))}</Text>
          </View>)}
        </View>}
      </>}
      ListEmptyComponent={<View style={{ width: viewport, padding: space[4] }}>
        {!ready ? <Pending error={vehicles.error ?? bookings.error} retry={retry} /> : <EmptyState text={t("fleet.empty")} />}
      </View>}
      renderItem={({ item: vehicle }) => <TimelineRow vehicle={vehicle} days={days} today={today}
        real={real.filter((b) => b.vehicle_id === vehicle.id)} x={x} shopId={shopId} onBook={onBook} />}
    />
  </Animated.ScrollView>;
}

function TimelineRow({ vehicle, days, today, real, x, shopId, onBook }: {
  vehicle: Row; days: string[]; today: string; real: Row[]; x: Animated.Value; shopId: string; onBook: (id: string, day: string) => void;
}) {
  const { t, lang, date } = useT();
  const router = useRouter();
  const { can } = useMerchantShop();
  const id = String(vehicle.id);
  const q = useMerchantQuery<{ blocks: Row[] }>(`/vehicles/${id}/unavailability`);
  const bars: { id: string; start: number; span: number; status: Tone; label: string; booking?: string }[] = [];
  for (const b of real) {
    const span = timeline.spanFor(String(b.scheduled_pickup_at), String(b.actual_return_at ?? b.scheduled_return_at), days);
    if (span) bars.push({ ...span, id: String(b.id), booking: String(b.id), status: STAGE_TONE[bookingStage(b)], label: renterName(b).split(" ")[0]! });
  }
  for (const block of q.data?.blocks ?? []) {
    const span = timeline.spanFor(String(block.start_at), String(block.end_at), days);
    if (span) bars.push({ ...span, id: `block-${block.id}`, status: "muted",
      label: block.reason ? `${t("fleet.blocked")}: ${String(block.reason)}` : t("fleet.blocked") });
  }

  return <>
    <View style={styles.row}>
      <Animated.View style={[styles.pinned, { transform: [{ translateX: x }] }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={vehicleLabel(vehicle)} style={styles.tap}
          onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id, shopId } })}>
          <Text size="sm" weight="bold" numberOfLines={2}>{String(vehicle.make)} {String(vehicle.model)}</Text>
          <Text size="xs" color="ink2">{String(vehicle.registration_number ?? "")}</Text>
        </Pressable>
      </Animated.View>
      {days.map((day, i) => {
        const bar = bars.find((entry) => entry.start <= i && i < entry.start + entry.span);
        const label = bar ? `${dateLabel(day, lang)} · ${bar.label}` : t("fleet.bookCell", {
          vehicle: String(vehicle.registration_number), day: date(`${day}T12:00:00+05:30`, { weekday: "short", day: "numeric" }),
        });
        const bookable = !bar && q.isSuccess && can("bookings:write") && vehicle.amount != null && day >= today;
        const action = bar?.booking ? () => router.push({ pathname: "/booking/[id]", params: { id: bar.booking!, shopId } })
          : bookable ? () => onBook(id, day) : undefined;
        const style = [styles.cell, day === today && styles.today, bar && { backgroundColor: tone[bar.status].bg, borderLeftWidth: 0,
          borderTopLeftRadius: i === bar.start ? radius.row : 0, borderBottomLeftRadius: i === bar.start ? radius.row : 0,
          borderTopRightRadius: i === bar.start + bar.span - 1 ? radius.row : 0, borderBottomRightRadius: i === bar.start + bar.span - 1 ? radius.row : 0,
          marginVertical: 6 }];
        const labelNode = bar ? <Text color="ink" size="xs" center numberOfLines={1}>{i === bar.start ? bar.label : ""}</Text>
          : null;
        return action ? <Pressable key={day} style={style} accessibilityRole="button" accessibilityLabel={label} onPress={action}>{labelNode}</Pressable>
          : <View key={day} style={style} accessible={!!bar} accessibilityLabel={bar ? label : undefined}>{labelNode}</View>;
      })}
    </View>
    {q.error && <Animated.View style={{ width: nameWidth + dayWidth * 3, transform: [{ translateX: x }] }}>
      <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />
    </Animated.View>}
  </>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line, minHeight: HIT },
  pinned: { width: nameWidth, minHeight: HIT, zIndex: 2, elevation: 2, backgroundColor: colors.surface, justifyContent: "center", paddingHorizontal: space[2] },
  tap: { minHeight: HIT, justifyContent: "center" },
  cell: { width: dayWidth, minHeight: HIT, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: colors.line, justifyContent: "center", alignItems: "center", padding: space[1] },
  today: { backgroundColor: colors.amberSoft },
});
