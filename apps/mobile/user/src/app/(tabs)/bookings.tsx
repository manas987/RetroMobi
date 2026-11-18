import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ArrowUpRight, Bike, Star, X } from "lucide-react-native";
import { Button, Chip, ErrorNote, LoadingRows, Screen, Text, colors, dayLabel, errorMessage, radius, rupees, space, timeLabel, useSession, type Row } from "@retromobi/mobile-shared";
import { EmptyState, Headline, IconAction, PhotoPill, Ticket } from "../../features/RiderSurface";
import { usePrivate } from "../../state/private";
import { bookingLabel, canReview, groupBookings, liveHold, vehicleName } from "../../features/bookings/bookings";
import { stockPhotos } from "../../features/explore/stockPhoto";
import { art } from "../../ui/art";
import { trail } from "../../ui/trail";

const TABS = [{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past trips" }] as const;

/** "in 2 days", "in 5 hours", "soon". */
function until(iso: unknown, now: number) {
  const ms = Date.parse(String(iso)) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "now";
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return "soon";
  if (h < 36) return `in ${h} ${h === 1 ? "hour" : "hours"}`;
  const d = Math.round(h / 24);
  return `in ${d} days`;
}

export default function Bookings() {
  const session = useSession();
  const router = useRouter();
  const q = usePrivate<{ bookings: Row[] }>("/bookings");
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const [now, setNow] = useState(Date.now);
  const [dismissed, setDismissed] = useState("");
  const list = useRef<FlatList<Row>>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const groups = groupBookings(q.data?.bookings ?? [], now);
  const remind = view === "past" ? groups.past.find(canReview) : undefined;
  // A booking still waiting for payment outranks the soonest ride: it disappears if ignored.
  const next = view === "upcoming" ? groups.upcoming.find((row) => liveHold(row, now)) ?? groups.upcoming[0] : undefined;
  const rows = next ? groups.upcoming.filter((row) => row !== next) : groups[view];
  const open = (row: Row) => router.push({ pathname: "/booking/[id]", params: { id: String(row.id) } });

  return <Screen scroll={false} padded={false}>
    {!session ? <EmptyState image={art.emptyTrips} title="Sign in to see your trips" text="Upcoming rides, pickup details and past rentals live here."
      action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
      : <FlatList ref={list} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={rows}
          keyExtractor={(row) => String(row.id)} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<View style={{ gap: space[4] }}>
            <Headline kicker={q.isSuccess ? `${groups.upcoming.length} upcoming` : undefined} title="Your trips" />
            <View style={styles.tabs} accessibilityRole="tablist">
              {TABS.map(({ value, label }) => <PhotoPill key={value} label={label} selected={view === value}
                onPress={() => { list.current?.scrollToOffset({ offset: 0, animated: false }); setView(value); }} />)}
            </View>
            {q.error && <ErrorNote text={errorMessage(q.error, "Couldn’t load your bookings.")} onRetry={() => void q.refetch()} />}
            {next && <NextRide row={next} now={now} onPress={() => open(next)} />}
            {remind && String(remind.id) !== dismissed && <View style={styles.remind}>
              <View style={styles.remindIcon}><Star size={20} color={colors.onAmber} fill={colors.onAmber} /></View>
              <View style={{ flex: 1 }}>
                <Text weight="bold">How was your ride?</Text>
                <Text size="sm" color="onAmber">{String(remind.shop_name)}</Text>
              </View>
              <Button label="Review" variant="dark" onPress={() => router.push({ pathname: "/shop/[shopId]", params: { shopId: String(remind.shop_id), reviewBooking: String(remind.id) } })} />
              <IconAction icon={X} tone="amber" label="Dismiss reminder" onPress={() => setDismissed(String(remind.id))} />
            </View>}
            {next && rows.length > 0 && <Text size="xl" weight="bold" accessibilityRole="header">Later</Text>}
          </View>}
          ListEmptyComponent={q.isPending ? <LoadingRows label="Loading bookings" /> : q.isSuccess && !next ? <EmptyState image={art.emptyTrips}
            title={view === "upcoming" ? "No trips planned yet" : "No past trips"}
            text={view === "upcoming" ? "Your next ride will show up here." : "Completed and cancelled rentals will appear here."}
            action={<Button label="Find a ride" variant="primary" onPress={() => router.push("/browse")} />} /> : undefined}
          renderItem={({ item }) => <TripCard row={item} now={now} onPress={() => open(item)} />} />}
  </Screen>;
}

function Thumb({ row, size }: { row: Row; size: number }) {
  const photo = stockPhotos(String(row.make ?? ""), String(row.model ?? ""))[0];
  return <View style={[styles.thumb, { width: size, height: size * 0.8 }]}>
    {photo ? <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : <Bike size={24} color={colors.ink2} />}
  </View>;
}

/** The soonest upcoming trip, as a dark hero with a countdown. */
function NextRide({ row, now, onPress }: { row: Row; now: number; onPress: () => void }) {
  const riding = !!row.actual_pickup_at;
  const due = liveHold(row, now);
  return <Pressable accessibilityRole="button" accessibilityHint="Opens booking details" onPress={onPress}
    style={({ pressed }) => [styles.hero, pressed && { transform: [{ scale: 0.98 }] }]}>
    <View style={styles.heroTop}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text size="xs" weight="bold" style={{ color: colors.amber, letterSpacing: 0.8 }}>{due ? "PAYMENT DUE" : riding ? "ON THE ROAD" : "NEXT RIDE"}</Text>
        <Text size="xl" weight="bold" color="white" numberOfLines={2}>{vehicleName(row)}</Text>
        <Text size="sm" style={{ color: trail.mist }} numberOfLines={1}>{String(row.shop_name)}</Text>
      </View>
      <Thumb row={row} size={92} />
    </View>
    <View style={styles.countdown}>
      <Text weight="bold" color="onAmber">{due ? `Complete payment · ${rupees(Number(row.total_amount ?? 0))}` : riding ? `Return ${until(row.scheduled_return_at, now)}` : `Pickup ${until(row.scheduled_pickup_at, now)}`}</Text>
      <View style={styles.heroArrow}><ArrowUpRight size={18} color={colors.white} /></View>
    </View>
    <View style={styles.heroDates}>
      <Text size="sm" style={{ color: trail.mist }}>{dayLabel(String(row.scheduled_pickup_at))}, {timeLabel(String(row.scheduled_pickup_at))}</Text>
      <Text size="sm" style={{ color: trail.mist }}>→</Text>
      <Text size="sm" style={{ color: trail.mist }}>{dayLabel(String(row.scheduled_return_at))}, {timeLabel(String(row.scheduled_return_at))}</Text>
    </View>
  </Pressable>;
}

function TripCard({ row, now, onPress }: { row: Row; now: number; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityHint="Opens booking details" onPress={onPress}
    style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}>
    <View style={styles.cardTop}>
      <Thumb row={row} size={72} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text size="lg" weight="bold" numberOfLines={1}>{vehicleName(row)}</Text>
        <Text size="sm" color="ink2" numberOfLines={1}>{String(row.shop_name)}</Text>
      </View>
    </View>
    <Ticket style={{ borderWidth: 0, backgroundColor: colors.surface }}
      from={{ label: "Pickup", day: dayLabel(String(row.scheduled_pickup_at)), time: timeLabel(String(row.scheduled_pickup_at)) }}
      to={{ label: "Return", day: dayLabel(String(row.scheduled_return_at)), time: timeLabel(String(row.scheduled_return_at)) }}
      strip={<>
        <View style={{ flex: 1, alignItems: "flex-start" }}><Chip {...bookingLabel(row, now)} /></View>
        <Text weight="bold" tnum>{rupees(Number(row.total_amount ?? 0))}</Text>
      </>} />
  </Pressable>;
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, padding: space[4], paddingBottom: space[6], gap: space[4] },
  tabs: { flexDirection: "row", gap: space[2] },
  thumb: { borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: trail.forest, borderRadius: 30, padding: space[4], gap: space[3] },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space[3] },
  countdown: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.amber, borderRadius: radius.full, paddingLeft: space[4], padding: 5 },
  heroArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: trail.forest, alignItems: "center", justifyContent: "center" },
  heroDates: { flexDirection: "row", flexWrap: "wrap", gap: space[2], paddingHorizontal: space[1] },
  remind: { flexDirection: "row", alignItems: "center", gap: space[2], backgroundColor: colors.amber, borderRadius: 24, padding: space[3] },
  remindIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.45)", alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 28, backgroundColor: colors.surface2, padding: space[2], gap: space[2], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  cardTop: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[1] },
});
