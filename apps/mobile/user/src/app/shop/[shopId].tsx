import { useState } from "react";
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { ArrowLeft, Bike, CalendarCheck, CalendarDays, ChevronRight, Clock, MapPin, Navigation, ShieldCheck, Star, UserRound, type LucideIcon } from "lucide-react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Button, DateRangeSheet, ErrorNote, LoadingRows, Screen, Text, colors, radius,
  bodyTypeLabel, dateLabel, dateTimeLabel, defaultWindow, errorMessage, formatClock, rentalWindowFromSearch,
  space, useToast, type ShopProfile,
} from "@retromobi/mobile-shared";
import { EmptyState, IconAction, PhotoPill, PillCTA, SectionHeader, StatChip } from "../../features/RiderSurface";
import { trail, type } from "../../ui/trail";
import { art } from "../../ui/art";
import { directions, usePublic, useSearch } from "../../features/explore/api";
import { ShopMap } from "../../features/explore/maps";
import { Photos, VehicleCard } from "../../features/explore/VehicleCard";
import { Reviews } from "../../features/explore/Reviews";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export default function Shop() {
  const { shopId, pickupAt, returnAt, reviewBooking } = useLocalSearchParams<{ shopId: string; pickupAt?: string; returnAt?: string; reviewBooking?: string }>();
  const router = useRouter();
  const toast = useToast();
  const [defaultDates] = useState(defaultWindow);
  const win = rentalWindowFromSearch(new URLSearchParams({ pickupAt: pickupAt ?? "", returnAt: returnAt ?? "" }).toString()) ?? defaultDates;
  const [dates, setDates] = useState(false);
  const [type_, setType] = useState<string | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [sort, setSort] = useState<"price" | "rating">("price");
  const profile = usePublic<ShopProfile>(shopId ? `/shops/${encodeURIComponent(shopId)}` : null);
  const q = useSearch({ city: "", shopId, ...win, sort, page: 1, bodyType: type_ ? [type_] : undefined });
  const shop = profile.data;
  const refresh = () => { void Promise.all([profile.refetch(), q.refetch()]); };
  const go = (url: string) => { void Linking.openURL(url).catch(() => toast("Couldn't open the link.")); };
  const address = shop ? [shop.addressLine1, shop.landmark, shop.city, shop.state, shop.pincode].filter(Boolean).join(", ") : "";
  const licence = shop?.licences[0];

  const openToday = shop?.hours.find((day) => day.dayOfWeek === new Date().getDay());
  return <Screen scroll={false} padded={false} edges={["left", "right", "bottom"]}>
    <Stack.Screen options={{ title: "", headerTransparent: true,
      headerLeft: () => <IconAction icon={ArrowLeft} tone="white" label="Back" onPress={() => router.back()} /> }} />
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={profile.isSuccess && !q.isError ? q.data?.results ?? [] : []} keyExtractor={(row) => row.model.id}
      contentContainerStyle={{ paddingBottom: space[6], gap: space[4] }} refreshing={profile.isRefetching || q.isRefetching} onRefresh={refresh}
      renderItem={({ item }) => <View style={{ paddingHorizontal: space[4] }}><VehicleCard result={item} window={win} shopLink={false} /></View>}
      ListHeaderComponent={!shop ? <View style={{ height: 110 }} /> : <View>
        {shop.photoUrls?.length ? <Photos identity={shop.shopId} urls={shop.photoUrls} height={320} rounded={0} dotsBottom={48} />
          : <Image source={art.shop} style={{ height: 320 }} contentFit="cover" accessible={false} />}
        <View style={styles.sheet}>
          <View style={{ gap: space[2] }}>
            <View style={styles.row}>
              <View style={[styles.status, shop.status !== "OPEN" && { backgroundColor: colors.surface3 }]}>
                <View style={[styles.statusDot, shop.status !== "OPEN" && { backgroundColor: colors.ink4 }]} />
                <Text size="xs" weight="bold">{shop.status === "OPEN" ? "OPEN" : "CLOSED"}</Text>
              </View>
              {openToday && <Text size="sm" color="ink2">Today {formatClock(openToday.opensAt.slice(0, 5))} – {formatClock(openToday.closesAt.slice(0, 5))}</Text>}
            </View>
            <Text weight="bold" accessibilityRole="header" style={type.title}>{shop.name}</Text>
            <View style={styles.row}><MapPin size={15} color={colors.ink2} /><Text size="sm" color="ink2" style={{ flex: 1 }}>{address}</Text></View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chips}>
            <StatChip icon={Star} value={shop.rating == null || !shop.reviewCount ? "New" : shop.rating.toFixed(1)} label={shop.reviewCount ? `${shop.reviewCount} reviews` : "No reviews yet"} />
            {q.isSuccess && <StatChip icon={Bike} value={String(q.data.total)} label={q.data.total === 1 ? "Ride free" : "Rides free"} />}
            {!!shop.memberSince && <StatChip icon={CalendarCheck} value={new Date(shop.memberSince).getFullYear().toString()} label="Member since" />}
          </ScrollView>

          <View style={styles.panel}>
            <Row icon={ShieldCheck} label={licence ? "Licensed to rent" : "No active licence on record"}
              detail={licence ? `${licence.licenceNumber}${licence.issuingAuthority ? ` · ${licence.issuingAuthority}` : ""}${licence.expiresAt ? ` · valid to ${dateLabel(licence.expiresAt)}` : ""}` : undefined} />
            {shop.ownerName && <><View style={styles.rule} /><Row icon={UserRound} label={shop.ownerName} detail="Licence holder" /></>}
            {!!shop.hours.length && <><View style={styles.rule} /><Row icon={Clock} label="Opening hours" detail={hoursOpen ? undefined : "See the week"}
              onPress={() => setHoursOpen(!hoursOpen)} /></>}
            {hoursOpen && <View style={{ gap: 4, paddingBottom: space[3], paddingLeft: 48 }}>
              {shop.hours.map((day) => <Text key={day.dayOfWeek} size="sm" tnum>{weekdays[day.dayOfWeek]} · {formatClock(day.opensAt.slice(0, 5))} – {formatClock(day.closesAt.slice(0, 5))}</Text>)}
            </View>}
          </View>

          <View style={styles.mapCard}>
            <ShopMap lat={shop.latitude} lng={shop.longitude} name={shop.name} />
            <PillCTA label="Get directions" icon={Navigation} onPress={() => go(directions(shop.latitude, shop.longitude, address))} />
          </View>

          <View style={{ gap: space[3] }}>
            <SectionHeader title="Rides at this shop" />
            <Pressable style={styles.date} accessibilityRole="button" accessibilityLabel="Change dates" onPress={() => setDates(true)}>
              <View style={styles.dateIcon}><CalendarDays size={16} color={trail.forest} /></View>
              <Text size="sm" weight="medium" style={{ flex: 1 }}>{dateTimeLabel(win.pickupAt)} → {dateTimeLabel(win.returnAt)}</Text>
              <ChevronRight size={16} color={colors.ink2} />
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chips}>
              <PhotoPill label="Cheapest" selected={sort === "price"} onPress={() => setSort("price")} />
              <PhotoPill label="Top rated" selected={sort === "rating"} onPress={() => setSort("rating")} />
              {shop.bodyTypes.length > 1 && <View style={styles.vr} />}
              {shop.bodyTypes.length > 1 && shop.bodyTypes.map((value) => <PhotoPill key={value} label={bodyTypeLabel(value)} selected={type_ === value}
                onPress={() => setType(type_ === value ? null : value)} />)}
            </ScrollView>
          </View>
        </View>
      </View>}
      ListEmptyComponent={<View style={{ paddingHorizontal: space[4] }}>{profile.isPending || q.isPending ? <LoadingRows label="Loading shop" /> : profile.error || q.error
        ? <ErrorNote text={errorMessage(profile.error ?? q.error, "Couldn't load this shop.")} onRetry={refresh} />
        : <EmptyState inline title="No vehicles match this search" action={<Button label="Change dates" onPress={() => setDates(true)} />} />}</View>}
      ListFooterComponent={shop ? <View style={{ paddingHorizontal: space[4], paddingTop: space[4] }}><Reviews id={shop.shopId} name={shop.name} reviewBooking={reviewBooking} /></View> : undefined} />
    <DateRangeSheet monochrome open={dates} value={win} onClose={() => setDates(false)} onChange={(value) => router.setParams(value)} />
  </Screen>;
}

function Row({ icon: Icon, label, detail, onPress }: { icon: LucideIcon; label: string; detail?: string; onPress?: () => void }) {
  const body = <>
    <View style={styles.rowIcon}><Icon size={18} color={trail.forest} /></View>
    <View style={{ flex: 1 }}><Text weight="medium">{label}</Text>{detail && <Text size="sm" color="ink2">{detail}</Text>}</View>
    {onPress && <ChevronRight size={17} color={colors.ink2} />}
  </>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={styles.line}>{body}</Pressable> : <View style={styles.line}>{body}</View>;
}

const styles = StyleSheet.create({
  sheet: { marginTop: -trail.hero, borderTopLeftRadius: trail.hero, borderTopRightRadius: trail.hero, backgroundColor: colors.surface, padding: space[4], paddingTop: space[6], gap: space[5] },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
  status: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: trail.forestSoft, borderRadius: radius.full, paddingHorizontal: space[3], paddingVertical: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.verified },
  bleed: { flexGrow: 0, marginHorizontal: -space[4] },
  chips: { gap: space[2], paddingHorizontal: space[4], alignItems: "center" },
  panel: { borderRadius: 24, backgroundColor: colors.surface2, paddingHorizontal: space[3], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  line: { flexDirection: "row", alignItems: "center", minHeight: 62, gap: space[3], paddingVertical: space[2] },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: trail.forestSoft, alignItems: "center", justifyContent: "center" },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 48 },
  mapCard: { gap: space[3], borderRadius: 28, overflow: "hidden" },
  date: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 48 },
  dateIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: trail.forestSoft, alignItems: "center", justifyContent: "center" },
  vr: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.lineStrong, marginHorizontal: space[1] },
});
