import { useState } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Bike, CalendarDays, ChevronRight, FileText, Fuel, Gauge, MapPin, Share2, ShieldCheck, Star, Users, Zap } from "lucide-react-native";
import {
  Button, DateRangeSheet, ErrorNote, Line, LoadingRows, Screen, Sheet, Text, ApiError, dayLabel, timeLabel,
  bodyTypeLabel, colors, dateLabel, defaultWindow, enumLabel, errorMessage, radius, rentalDays, rentalWindowFromSearch, rupees, space, useToast, type VehicleDetail,
} from "@retromobi/mobile-shared";
import { EmptyState, IconAction, PillCTA, StatChip, Ticket } from "../../features/RiderSurface";
import { trail, type } from "../../ui/trail";
import { directions, usePublic } from "../../features/explore/api";
import { Heart, Photos } from "../../features/explore/VehicleCard";
import { Reviews } from "../../features/explore/Reviews";
import { ShopMap } from "../../features/explore/maps";
import { RentalPolicy } from "../../features/explore/RentalPolicy";
import { useCart } from "../../state/cart";

export default function Vehicle() {
  const { id, pickupAt, returnAt } = useLocalSearchParams<{ id: string; pickupAt?: string; returnAt?: string }>();
  const router = useRouter();
  const cart = useCart();
  const toast = useToast();
  const [dates, setDates] = useState(false);
  const [details, setDetails] = useState<"terms" | "licence" | "pickup" | null>(null);
  const [defaultDates] = useState(defaultWindow);
  const query = new URLSearchParams({ pickupAt: pickupAt ?? "", returnAt: returnAt ?? "" });
  const win = rentalWindowFromSearch(query.toString()) ?? defaultDates;
  const q = usePublic<VehicleDetail>(id ? `/search/vehicle/${encodeURIComponent(id)}?${new URLSearchParams(win)}` : null);
  const v = q.data;
  const canBook = q.isSuccess && !!(v?.listingEligible && v.datesAvailable && v.quote);
  const line = v && cart.items.find((i) => i.modelId === v.modelId && i.shopId === v.shopId && i.pickupAt === win.pickupAt && i.returnAt === win.returnAt);
  const inside = !!v && !!line?.vehicleIds.includes(v.vehicleId);
  const gone = q.error instanceof ApiError && [400, 404].includes(q.error.status);
  const name = v ? `${v.make} ${v.model}` : "Vehicle";
  const days = rentalDays(win.pickupAt, win.returnAt);
  const show = (url: string) => { void Linking.openURL(url).catch(() => toast("Couldn't open the link.")); };

  function book() {
    if (inside) { router.push("/cart"); return; }
    if (!canBook || !v?.quote) return;
    const selected = [...new Set([...(line?.vehicleIds ?? []), v.vehicleId])];
    const pool = [...new Set([...selected, ...(line?.availableVehicleIds ?? [])])];
    if (cart.setQty({ modelId: v.modelId, shopId: v.shopId, shopName: v.shopName, make: v.make, model: v.model, pricePerDay: v.quote.pricePerDay, ...win }, selected.length, pool) === "ok") router.push("/cart");
  }

  const share = () => {
    if (!v) return;
    const env = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "");
    const link = env ? `${env}/vehicles/${v.vehicleId}` : `retromobi://vehicle/${v.vehicleId}`;
    void Share.share({ message: `${name} · ${v.shopName}\n${link}` }).catch(() => toast("Couldn't share this listing."));
  };

  return <Screen edges={["left", "right", "bottom"]} padded={false} refreshing={q.isRefetching}
    onRefresh={q.isSuccess ? () => void q.refetch() : undefined}
    footer={v && q.isSuccess && <PillCTA label={inside ? "View cart" : canBook ? "Add to cart" : "Not available"} disabled={!inside && !canBook} onPress={book}
      caption={v.quote ? `${days} ${days === 1 ? "day" : "days"} · rental` : undefined} amount={v.quote ? rupees(v.quote.rentalAmount) : "—"} />}>
    <Stack.Screen options={{ title: "", headerTransparent: true,
      headerLeft: () => <IconAction icon={ArrowLeft} tone="white" label="Back" onPress={() => router.back()} />,
      headerRight: () => v ? <View style={{ flexDirection: "row", gap: space[2] }}>
        <View style={styles.headHeart}><Heart size={48} ride={{ vehicleId: v.vehicleId, modelId: v.modelId, imageKey: v.imageKey, make: v.make, model: v.model, shopName: v.shopName, pricePerDay: v.quote?.pricePerDay ?? v.amount }} /></View>
        <IconAction icon={Share2} tone="white" label="Share vehicle" onPress={share} />
      </View> : null }} />
    {q.isPending ? <View style={styles.pad}><LoadingRows label="Loading vehicle" /></View> : gone ? <EmptyState title="Listing unavailable"
      text={q.error instanceof ApiError && q.error.status === 400 ? "This listing link is invalid. Browse for another ride." : "This vehicle is no longer listed. Browse for another ride."}
      action={<Button label="Back to browse" onPress={() => router.replace("/browse")} />} />
      : q.error ? <View style={styles.pad}><ErrorNote text={errorMessage(q.error, "Couldn't load this vehicle.")} onRetry={() => void q.refetch()} /></View> : v && <>
        <Photos key={v.vehicleId} identity={v.vehicleId} urls={v.photoUrls} height={340} rounded={0} dotsBottom={48} tint={colors.surface3} noteBottom={48}
          model={{ id: v.modelId, imageKey: v.imageKey, make: v.make, model: v.model }} />
        <View style={styles.sheet}>
        <View style={{ gap: space[2] }}>
          <View style={styles.titleRow}>
            <Text weight="bold" accessibilityRole="header" style={[type.title, { flex: 1 }]}>{name}</Text>
            <View style={styles.ratingPill}>
              <Star size={14} color={colors.amberText} fill={colors.amber} />
              <Text size="sm" weight="bold">{v.rating == null || !v.reviewCount ? "New" : v.rating.toFixed(1)}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/shop/[shopId]", params: { shopId: v.shopId, ...win } })} style={styles.inline}>
            <MapPin size={15} color={colors.ink2} /><Text color="ink2" style={{ textDecorationLine: "underline" }}>{v.shopName}</Text>
            {!!v.reviewCount && <Text size="sm" color="ink2">· {v.reviewCount} reviews</Text>}
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.chips}>
          {v.engineCc != null && <StatChip icon={Gauge} value={`${v.engineCc} cc`} label="Engine" />}
          {v.fuelType && <StatChip icon={v.fuelType === "ELECTRIC" ? Zap : Fuel} value={v.fuelType === "ELECTRIC" ? "Electric" : "Petrol"} label="Fuel" />}
          {v.seatingCapacity != null && <StatChip icon={Users} value={String(v.seatingCapacity)} label="Seats" />}
          {v.bodyType && <StatChip icon={Bike} value={bodyTypeLabel(v.bodyType)} label="Type" />}
        </ScrollView>

        <View style={{ gap: space[2] }}>
          <View style={styles.heading}>
            <Text size="xl" weight="bold" accessibilityRole="header">Your rental</Text>
            <Pressable accessibilityRole="button" onPress={() => setDates(true)} hitSlop={8} style={styles.change}>
              <CalendarDays size={15} color={trail.forest} /><Text size="sm" weight="bold" style={{ color: trail.forest }}>Change</Text>
            </Pressable>
          </View>
          <Ticket dark label="Change rental dates" onPress={() => setDates(true)}
            from={{ label: "Pickup", day: dayLabel(win.pickupAt), time: timeLabel(win.pickupAt) }}
            to={{ label: "Return", day: dayLabel(win.returnAt), time: timeLabel(win.returnAt) }}
            strip={<>
              <Text size="sm" style={{ color: trail.mist, flex: 1 }}>{days} rental {days === 1 ? "day" : "days"}</Text>
              {v.quote && <Text size="sm" weight="bold" color="white">{rupees(v.quote.pricePerDay)} / day</Text>}
            </>} />
        </View>

        <View style={{ gap: space[2] }}>
          <Text size="xl" weight="bold" accessibilityRole="header">Rates & deposit</Text>
          <View style={styles.rates}>
            <Rate label="Weekday" value={rupees(v.amount)} unit="/ day" />
            <Rate label="Weekend" value={rupees(v.weekendAmount)} unit="/ day" />
            <Rate label="Deposit" value={rupees(v.securityDeposit)} unit="refundable" />
            {v.lateFeeAmount > 0 && <Rate label="Late return" value={rupees(v.lateFeeAmount)} unit="/ hour" />}
          </View>
        </View>
        <View style={styles.links}>
          <DetailLink label={v.licence ? "Licensed to rent" : "Licence not yet confirmed"} icon={ShieldCheck} onPress={() => setDetails("licence")} />
          <View style={styles.rule} />
          <DetailLink label="Rental terms & cancellation" icon={FileText} onPress={() => setDetails("terms")} />
          <View style={styles.rule} />
          <DetailLink label="Pickup location" icon={MapPin} detail={v.shopAddress} onPress={() => setDetails("pickup")} />
        </View>
        <Reviews id={v.shopId} name={v.shopName} />
        </View>
        {details && <Sheet open title={details === "licence" ? "Rental licence" : details === "terms" ? "Rental terms & cancellation" : "Pickup location"} onClose={() => setDetails(null)}>
          <View style={{ gap: space[3] }}>
            {details === "licence" && (v.licence ? <>
              <Text weight="bold">{v.shopName}</Text>
              <Text>Rent-a-Motorcycle licence {v.licence.licenceNumber}</Text>
              {!!v.licence.issuingAuthority && <Text color="ink2">{v.licence.issuingAuthority}</Text>}
              {!!v.licence.validUntil && <Text color="ink2">Valid until {dateLabel(v.licence.validUntil)}</Text>}
            </> : <Text>This vehicle has no confirmed rental licence covering these dates.</Text>)}
            {details === "terms" && <>
              <Text>Bring your original driving licence to pickup.</Text>
              {v.accessories.length > 0 && <Text>Accessories · {v.accessories.map((item) => `${item.quantity} × ${enumLabel(item.type)}`).join(", ")}</Text>}
              <Line />
              <RentalPolicy />
            </>}
            {details === "pickup" && <>
              <Text weight="bold">{v.shopName}</Text><Text color="ink2">{v.shopAddress}</Text>
              <ShopMap lat={v.shopLatitude} lng={v.shopLongitude} name={v.shopName} />
              <Button label="Get directions" onPress={() => show(directions(v.shopLatitude, v.shopLongitude, v.shopAddress))} />
            </>}
          </View>
        </Sheet>}
      </>}
    <DateRangeSheet monochrome open={dates} value={win} onClose={() => setDates(false)} onChange={(value) => router.setParams(value)} />
  </Screen>;
}

function Rate({ label, value, unit }: { label: string; value: string; unit: string }) {
  return <View style={styles.rate}>
    <Text size="xs" color="ink2">{label}</Text>
    <Text size="lg" weight="bold" tnum>{value}</Text>
    <Text size="xs" color="ink2">{unit}</Text>
  </View>;
}

function DetailLink({ label, detail, icon: Icon, onPress }: { label: string; detail?: string; icon: typeof ShieldCheck; onPress: () => void }) {
  return <Pressable style={styles.detailLink} accessibilityRole="button" onPress={onPress}>
    <View style={styles.linkIcon}><Icon size={18} color={trail.forest} /></View>
    <View style={{ flex: 1 }}>
      <Text weight="medium">{label}</Text>
      {detail && <Text size="sm" color="ink2" numberOfLines={1}>{detail}</Text>}
    </View>
    <ChevronRight size={17} color={colors.ink2} />
  </Pressable>;
}

const styles = StyleSheet.create({
  pad: { padding: space[4], paddingTop: 110 },
  headHeart: { borderRadius: 24, backgroundColor: colors.white, shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  sheet: { marginTop: -trail.hero, borderTopLeftRadius: trail.hero, borderTopRightRadius: trail.hero, backgroundColor: colors.surface,
    padding: space[4], paddingTop: space[6], gap: space[6] },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  ratingPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.amberSoft, borderRadius: radius.full, paddingHorizontal: space[3], paddingVertical: 6, marginTop: 4 },
  inline: { flexDirection: "row", alignItems: "center", gap: space[1], flexWrap: "wrap", minHeight: 32 },
  bleed: { flexGrow: 0, marginHorizontal: -space[4] },
  chips: { gap: space[2], paddingHorizontal: space[4] },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[2] },
  change: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40 },
  rates: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  rate: { flexGrow: 1, flexBasis: "45%", backgroundColor: colors.surface2, borderRadius: 20, padding: space[3], paddingLeft: space[4], gap: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  links: { borderRadius: 24, backgroundColor: colors.surface2, paddingHorizontal: space[3], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 48 },
  detailLink: { flexDirection: "row", alignItems: "center", minHeight: 60, gap: space[3] },
  linkIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: trail.forestSoft, alignItems: "center", justifyContent: "center" },
});
