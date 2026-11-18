import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { ArrowUpRight, CalendarDays, ChevronRight, MapPin, Search, ShoppingBag, Star } from "lucide-react-native";
import {
  CITY_LIST, DEFAULT_CITY, DateRangeSheet, Screen, Sheet, Text, colors, dateTimeLabel, defaultWindow, parseSearchParams, radius, rupees, space, useSession,
  type DateWindow, type SearchResult,
} from "@retromobi/mobile-shared";
import { Headline, IconAction, PhotoPill, PillCTA, SectionHeader } from "../../features/RiderSurface";
import { useSearch } from "../../features/explore/api";
import { Heart, Photos } from "../../features/explore/VehicleCard";
import { useSaved } from "../../state/saved";
import type { Account } from "../../features/profile/ProfileSurface";
import { usePrivate } from "../../state/private";
import { useCart } from "../../state/cart";
import { trail } from "../../ui/trail";

const images = {
  Dehradun: require("../../../assets/images/dehradun.jpg"),
  Haridwar: require("../../../assets/images/haridwar.jpg"),
  Rishikesh: require("../../../assets/images/rishikesh.jpg"),
};

export default function Explore() {
  const router = useRouter();
  const cart = useCart();
  const session = useSession();
  const me = usePrivate<Account>(session ? "/auth/me" : null);
  const [city, setCity] = useState("");
  const [window, setWindow] = useState<DateWindow>();
  const [picker, setPicker] = useState<"city" | "dates" | null>(null);
  const [destination, setDestination] = useState<string>();
  const first = me.data?.name?.trim().split(/\s+/)[0];
  function search(next = city, dates = window) {
    if (!next) { setPicker("city"); return; }
    if (!dates) { setDestination(next); setPicker("dates"); return; }
    router.push({ pathname: "/browse", params: { city: next, ...dates } });
  }
  return <Screen contentStyle={styles.body}>
    <View style={styles.header}>
      <Text size="md" weight="medium" color="ink2">{first ? `Hey ${first} 👋` : "Hey there 👋"}</Text>
      <IconAction icon={ShoppingBag} tone="soft" badge={cart.totalUnits} label={`Cart, ${cart.totalUnits} vehicles`} onPress={() => router.push("/cart")} />
    </View>
    <Headline title={"Where to\nride next?"} action={<IconAction icon={Search} tone="forest" label="Find vehicles" onPress={() => search()} />} />

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}>
      {CITY_LIST.map(({ name }) => <PhotoPill key={name} label={name} image={images[name]} selected={city === name}
        onPress={() => setCity(city === name ? "" : name)} />)}
    </ScrollView>

    <View style={styles.search}>
      <SearchRow icon={MapPin} label="Pickup city" value={city || "Choose a city"} onPress={() => setPicker("city")} />
      <View style={styles.divider} />
      <SearchRow icon={CalendarDays} label="Rental dates" onPress={() => { setDestination(undefined); setPicker("dates"); }}
        value={window ? `${dateTimeLabel(window.pickupAt)} → ${dateTimeLabel(window.returnAt)}` : "Add dates"} />
      <View style={{ paddingTop: space[2] }}><PillCTA label="Find rides" onPress={() => search()} /></View>
    </View>

    <SectionHeader title="Explore Uttarakhand" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}
      snapToInterval={260 + space[3]} decelerationRate="fast">
      {CITY_LIST.map(({ name, blurb }) => <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Find vehicles in ${name}`}
        style={({ pressed }) => [styles.destination, pressed && { transform: [{ scale: 0.97 }] }]} onPress={() => { setCity(name); search(name); }}>
        <Image source={images[name]} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        <View style={styles.glass}>
          <View style={{ flex: 1 }}>
            <Text size="lg" weight="bold">{name}</Text>
            <Text size="sm" color="ink2" numberOfLines={1}>{blurb}</Text>
          </View>
          <View style={styles.arrow}><ArrowUpRight size={18} color={colors.white} /></View>
        </View>
      </Pressable>)}
    </ScrollView>

    <Saved />
    <Trending city={city || DEFAULT_CITY} />

    <Pressable accessibilityRole="link" onPress={() => router.push("/policies")} style={styles.help}>
      <Text size="sm" weight="medium" color="ink2" style={{ flex: 1 }}>Help & policies</Text>
      <ChevronRight size={16} color={colors.ink2} />
    </Pressable>

    {picker === "city" && <Sheet open title="Choose a pickup city" onClose={() => setPicker(null)}>
      {CITY_LIST.map(({ name, blurb }) => <Pressable key={name} accessibilityRole="radio" accessibilityState={{ checked: city === name }}
        style={styles.cityRow} onPress={() => { setCity(name); setPicker(null); }}>
        <Image source={images[name]} style={styles.cityThumb} contentFit="cover" accessible={false} />
        <View style={{ flex: 1 }}><Text weight="bold">{name}</Text><Text size="sm" color="ink2">{blurb}</Text></View>
        <ChevronRight size={18} color={colors.ink} />
      </Pressable>)}
    </Sheet>}
    <DateRangeSheet monochrome open={picker === "dates"} onClose={() => setPicker(null)} value={window} onChange={(dates) => {
      setWindow(dates);
      if (destination) search(destination, dates);
    }} />
  </Screen>;
}

function SearchRow({ icon: Icon, label, value, onPress }: { icon: typeof MapPin; label: string; value: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => [styles.field, pressed && { opacity: 0.7 }]} onPress={onPress}>
    <View style={styles.fieldIcon}><Icon size={19} color={trail.forest} /></View>
    <View style={{ flex: 1 }}><Text size="xs" color="ink2">{label}</Text><Text weight="medium" numberOfLines={1}>{value}</Text></View>
    <ChevronRight size={16} color={colors.ink2} />
  </Pressable>;
}

/** Rides the rider hearted, newest first. Hidden until there is one. */
function Saved() {
  const router = useRouter();
  const saved = useSaved();
  const [win] = useState(defaultWindow);
  if (!saved.length) return null;
  return <View style={{ gap: space[3] }}>
    <SectionHeader title="Saved rides" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}>
      {saved.map((r) => <Pressable key={r.modelId} accessibilityRole="button" accessibilityLabel={`${r.make} ${r.model}, ${rupees(r.pricePerDay)} a day`}
        onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: r.vehicleId, ...win } })}
        style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }] }]}>
        <View pointerEvents="box-none">
          <View pointerEvents="none"><Photos model={{ id: r.modelId, imageKey: r.imageKey, make: r.make, model: r.model }} identity={`saved-${r.modelId}`} height={150} rounded={18} /></View>
          <View style={styles.savedHeart}><Heart ride={r} size={36} /></View>
        </View>
        <View style={{ paddingHorizontal: space[1], gap: 2 }}>
          <Text weight="bold" numberOfLines={1}>{r.make} {r.model}</Text>
          <Text size="sm" color="ink2" numberOfLines={1}>{r.shopName}</Text>
          <Text weight="bold" tnum style={{ marginTop: 2 }}>{rupees(r.pricePerDay)}<Text size="sm" color="ink2"> / day</Text></Text>
        </View>
      </Pressable>)}
    </ScrollView>
  </View>;
}

/** Real rides on the home screen: the default search for the chosen city. Hides itself on error or when empty. */
function Trending({ city }: { city: string }) {
  const router = useRouter();
  const [win] = useState(defaultWindow);
  const q = useSearch({ ...parseSearchParams(""), city, ...win });
  const rows = q.data?.results.slice(0, 8) ?? [];
  if (!rows.length) return null;
  return <View style={{ gap: space[3] }}>
    <SectionHeader title={`Trending in ${city}`} action="See all" onAction={() => router.push({ pathname: "/browse", params: { city, ...win } })} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.row}>
      {rows.map((r) => <RideTile key={`${r.model.id}:${r.primaryOffer.shopId}`} result={r}
        onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: r.primaryOffer.vehicleId, ...win } })} />)}
    </ScrollView>
  </View>;
}

function RideTile({ result: { model, primaryOffer: offer }, onPress }: { result: SearchResult; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${model.make} ${model.model}, ${rupees(offer.pricePerDay)} a day`} onPress={onPress}
    style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.97 }] }]}>
    <View pointerEvents="none"><Photos model={model} identity={`tile-${model.id}`} height={150} rounded={18} /></View>
    <View style={{ paddingHorizontal: space[1], gap: 2 }}>
      <Text weight="bold" numberOfLines={1}>{model.make} {model.model}</Text>
      <Text size="sm" color="ink2" numberOfLines={1}>{offer.shopName}</Text>
      <View style={styles.tileFoot}>
        <Text weight="bold" tnum style={{ flex: 1 }}>{rupees(offer.pricePerDay)}<Text size="sm" color="ink2"> / day</Text></Text>
        {offer.rating != null && !!offer.reviewCount && <View style={styles.rating}>
          <Star size={12} color={colors.amberText} fill={colors.amber} /><Text size="xs" weight="bold">{offer.rating.toFixed(1)}</Text>
        </View>}
      </View>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  body: { gap: space[5], paddingTop: space[2] },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bleed: { flexGrow: 0, marginHorizontal: -space[4] },
  row: { gap: space[3], paddingHorizontal: space[4] },
  search: { backgroundColor: colors.surface2, borderRadius: radius.sheet, padding: space[3], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  field: { minHeight: 60, flexDirection: "row", gap: space[3], alignItems: "center", paddingHorizontal: space[1] },
  fieldIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: trail.forestSoft, alignItems: "center", justifyContent: "center" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: 56 },
  destination: { width: 260, height: 330, borderRadius: 28, overflow: "hidden", backgroundColor: colors.surface3, justifyContent: "flex-end", padding: space[3] },
  glass: { backgroundColor: trail.glass, borderRadius: 22, padding: space[3], paddingLeft: space[4], flexDirection: "row", alignItems: "center", gap: space[2] },
  arrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: trail.forest, alignItems: "center", justifyContent: "center" },
  tile: { width: 200, gap: space[2], padding: space[2], paddingBottom: space[3], borderRadius: 24, backgroundColor: colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  savedHeart: { position: "absolute", top: space[2], right: space[2] },
  tileFoot: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  rating: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.amberSoft, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  help: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  cityRow: { minHeight: 64, flexDirection: "row", gap: space[3], alignItems: "center", paddingVertical: space[2] },
  cityThumb: { width: 52, height: 52, borderRadius: 16 },
});
