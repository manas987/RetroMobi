import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Bike, Heart as HeartIcon, Plus, ShieldCheck, Star, Zap } from "lucide-react-native";
import { Text, colors, radius, rupees, space, type DateWindow, type SearchResult } from "@retromobi/mobile-shared";
import { EmptyState } from "../RiderSurface";
import { Quantity } from "./Quantity";
import { useCart } from "../../state/cart";
import { stockPhotos } from "./stockPhoto";
import { usePublic, validPhoto } from "./api";
import { trail } from "../../ui/trail";
import { toggleSaved, useSaved, type SavedRide } from "../../state/saved";

export function Photos({ urls = [], model, identity, height = 242, action, onOpen, rounded = radius.panel, dotsBottom = 10, tint = colors.white, noteBottom }: {
  urls?: string[]; model?: { id: string; imageKey: string | null; make: string; model: string }; identity: string; height?: number; action?: React.ReactNode; onOpen?: () => void;
  rounded?: number; /** Lift the page dots above anything overlapping the photo's bottom edge. */ dotsBottom?: number;
  /** Background behind contained (cut-out) photos. */ tint?: string; /** Put the "Representative photo" note at the bottom (heroes under a header). */ noteBottom?: number;
}) {
  const q = usePublic<{ url: string }>(model?.imageKey ? `/search/models/${model.id}/image` : null, 30 * 60_000);
  const [failed, setFailed] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const actual = urls.filter((url) => validPhoto(url) && !failed.includes(url));
  const remote = q.data?.url && validPhoto(q.data.url) && !failed.includes(q.data.url) ? [q.data.url] : [];
  const demo = model ? stockPhotos(model.make, model.model) : [];
  const photos = actual.length ? actual : remote.length ? remote : demo;
  const idx = Math.min(index, photos.length - 1);
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.gallery, { height, borderRadius: rounded, backgroundColor: tint }]}>
    {!photos.length ? <EmptyState icon={Bike} text={model ? "Photo pending" : "No shop photos yet"} /> : width > 0 &&
      <ScrollView horizontal pagingEnabled showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}>
        {photos.map((photo, i) => <Pressable key={String(photo)} disabled={!onOpen} onPress={onOpen}
          accessibilityRole={onOpen ? "button" : "image"} accessibilityLabel={`Photo ${i + 1} of ${photos.length}`} style={{ width, height }}>
          <Image source={typeof photo === "number" ? photo : { uri: photo }} recyclingKey={`${identity}-${i}`}
            cachePolicy="memory-disk" transition={150} contentFit="cover" style={StyleSheet.absoluteFill}
            onError={() => { if (typeof photo === "string") setFailed((old) => [...old, photo]); }} />
        </Pressable>)}
      </ScrollView>}
    {!actual.length && !!model && !!photos.length && height > 180 && <View pointerEvents="none" style={[styles.note, noteBottom != null && { top: undefined, bottom: noteBottom }]}><Text size="xs" color="ink2" numberOfLines={1} maxFontSizeMultiplier={1.2}>Representative photo</Text></View>}
    {action && <View style={styles.overlay}>{action}</View>}
    {photos.length > 1 && <View pointerEvents="none" style={[styles.dots, { bottom: dotsBottom }]}>
      {photos.map((photo, i) => <View key={String(photo)} style={[styles.dot, i === idx && styles.dotActive]} />)}
    </View>}
  </View>;
}

/** Photo-led listing card: a big rounded photo, details underneath on the same card. */
export function VehicleCard({ result, window, shopLink = true }: { result: SearchResult; window: DateWindow; shopLink?: boolean }) {
  const { model, primaryOffer: offer, offerVehicleIds } = result;
  const cart = useCart();
  const router = useRouter();
  const title = `${model.make} ${model.model}`;
  const line = cart.items.find((item) => item.modelId === model.id && item.shopId === offer.shopId);
  const sameWindow = line?.pickupAt === window.pickupAt && line?.returnAt === window.returnAt;
  const n = sameWindow ? line?.vehicleIds.length ?? 0 : 0;
  const pool = [...new Set([...(sameWindow ? line?.vehicleIds ?? [] : []), ...offerVehicleIds])];
  const detail = () => router.push({ pathname: "/vehicle/[id]", params: { id: offer.vehicleId, ...window } });
  const qty = (next: number) => cart.setQty({ modelId: model.id, shopId: offer.shopId, shopName: offer.shopName,
    make: model.make, model: model.model, pricePerDay: offer.pricePerDay, ...window }, next, pool);
  const left = offerVehicleIds.length;
  return <View style={styles.listing}>
    <Photos model={model} identity={model.id} height={210} onOpen={detail} rounded={22} />
    <View pointerEvents="box-none" style={styles.badges}>
      {model.fuelType === "ELECTRIC" && <Badge icon={Zap} label="Electric" />}
      {!!offer.licence && <Badge icon={ShieldCheck} label="Licensed" />}
    </View>
    <View style={styles.heart}>
      <Heart ride={{ vehicleId: offer.vehicleId, modelId: model.id, imageKey: model.imageKey, make: model.make, model: model.model, shopName: offer.shopName, pricePerDay: offer.pricePerDay }} />
    </View>
    <View style={styles.panel}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}, details`} onPress={detail} style={styles.titleRow}>
        <Text size="lg" weight="bold" numberOfLines={1} style={{ flex: 1, letterSpacing: -0.3 }}>{title}</Text>
        <View style={styles.rating}>
          <Star size={13} color={colors.amberText} fill={colors.amber} />
          <Text size="sm" weight="bold">{offer.rating == null || !offer.reviewCount ? "New" : offer.rating.toFixed(1)}</Text>
          {!!offer.reviewCount && <Text size="xs" color="ink2">({offer.reviewCount})</Text>}
        </View>
      </Pressable>
      {shopLink ? <Pressable accessibilityRole="link" hitSlop={6} style={{ alignSelf: "flex-start" }}
        onPress={() => router.push({ pathname: "/shop/[shopId]", params: { shopId: offer.shopId, ...window } })}>
        <Text size="sm" color="ink2" numberOfLines={1} style={{ textDecorationLine: "underline" }}>{offer.shopName}</Text>
      </Pressable> : <Text color="ink2" size="sm" numberOfLines={1}>{offer.shopName}</Text>}
      <View style={styles.priceRow}>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Text weight="bold" size="xl" tnum style={{ letterSpacing: -0.5 }}>{rupees(offer.pricePerDay)}<Text color="ink2" size="sm"> / day</Text></Text>
          <Text size="xs" color={left <= 2 && left > 0 ? "warning" : "ink2"}>{left ? `${left} left` : "Sold out"} · {rupees(offer.securityDeposit)} deposit</Text>
        </View>
        {n ? <Quantity value={n} max={pool.length} onChange={qty} />
          : <Pressable accessibilityRole="button" accessibilityLabel={`Add ${title} to cart`} accessibilityState={{ disabled: !pool.length }}
            disabled={!pool.length} onPress={() => qty(1)} style={({ pressed }) => [styles.add, { opacity: !pool.length ? 0.4 : 1, transform: [{ scale: pressed ? 0.93 : 1 }] }]}>
            <Plus size={18} color={colors.onAmber} strokeWidth={2.6} /><Text weight="bold" color="onAmber">Add</Text>
          </Pressable>}
      </View>
    </View>
  </View>;
}

/** Round heart that saves the ride on this phone. */
export function Heart({ ride, size = 40 }: { ride: SavedRide; size?: number }) {
  const saved = useSaved().some((r) => r.modelId === ride.modelId);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: saved }} hitSlop={6}
    accessibilityLabel={saved ? `Remove ${ride.make} ${ride.model} from saved` : `Save ${ride.make} ${ride.model}`}
    onPress={() => { void Haptics.selectionAsync().catch(() => {}); toggleSaved(ride); }}
    style={({ pressed }) => [styles.heartButton, { width: size, height: size, borderRadius: size / 2, transform: [{ scale: pressed ? 0.85 : 1 }] }]}>
    <HeartIcon size={size * 0.48} color={saved ? colors.danger : colors.ink} fill={saved ? colors.danger : "transparent"} strokeWidth={2.2} />
  </Pressable>;
}

function Badge({ icon: Icon, label }: { icon: typeof Zap; label: string }) {
  return <View style={styles.badge}><Icon size={12} color={trail.forest} strokeWidth={2.4} /><Text size="xs" weight="bold" numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  listing: { borderRadius: 28, backgroundColor: colors.surface, padding: space[2], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  badges: { position: "absolute", top: space[4], right: 64, flexDirection: "row", gap: space[1] },
  heart: { position: "absolute", top: space[3], right: space[3] },
  heartButton: { backgroundColor: trail.glass, alignItems: "center", justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: trail.glass, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 5 },
  panel: { gap: 2, paddingHorizontal: space[2], paddingTop: space[3], paddingBottom: space[1] },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 32 },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  priceRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2], alignItems: "center", paddingTop: space[2] },
  add: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space[5], borderRadius: radius.full, backgroundColor: colors.amber },
  gallery: { overflow: "hidden", backgroundColor: colors.white },
  overlay: { position: "absolute", right: 12, top: 12 },
  note: { position: "absolute", left: 12, top: 12, backgroundColor: trail.glass, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4 },
  dots: { position: "absolute", alignSelf: "center", flexDirection: "row", gap: 5, backgroundColor: colors.scrim, borderRadius: radius.full, padding: 6 },
  dot: { height: 5, width: 5, borderRadius: 3, backgroundColor: colors.lineStrong },
  dotActive: { width: 15, backgroundColor: colors.white },
});
