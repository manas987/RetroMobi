import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { Bike, ChevronRight, Star } from "lucide-react-native";
import { Button, Chip, Text, colors, radius, rupees, space, type DateWindow, type SearchResult } from "@retromobi/mobile-shared";
import { EmptyState } from "../RiderSurface";
import { Quantity } from "./Quantity";
import { useCart } from "../../state/cart";
import { stockPhotos } from "./stockPhoto";
import { usePublic, validPhoto } from "./api";

export function Photos({ urls = [], model, identity, height = 242, action, onOpen }: {
  urls?: string[]; model?: { id: string; imageKey: string | null; make: string; model: string }; identity: string; height?: number; action?: React.ReactNode; onOpen?: () => void;
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
  return <View style={{ gap: space[1] }}>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.gallery, { height }]}>
      {!photos.length ? <EmptyState icon={Bike} text={model ? "Photo pending" : "No shop photos yet"} /> : width > 0 &&
        <ScrollView horizontal pagingEnabled showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}>
          {photos.map((photo, i) => <Pressable key={String(photo)} disabled={!onOpen} onPress={onOpen}
            accessibilityRole={onOpen ? "button" : "image"} accessibilityLabel={`Photo ${i + 1} of ${photos.length}`} style={{ width, height }}>
            <Image source={typeof photo === "number" ? photo : { uri: photo }} recyclingKey={`${identity}-${i}`}
              cachePolicy="memory-disk" transition={150} contentFit={model && !actual.length ? "contain" : "cover"} style={StyleSheet.absoluteFill}
              onError={() => { if (typeof photo === "string") setFailed((old) => [...old, photo]); }} />
          </Pressable>)}
        </ScrollView>}
      {action && <View style={styles.overlay}>{action}</View>}
      {photos.length > 1 && <View pointerEvents="none" style={styles.dots}>
        {photos.map((photo, i) => <View key={String(photo)} style={[styles.dot, i === idx && styles.dotActive]} />)}
      </View>}
    </View>
    {!actual.length && !!model && !!photos.length && <Text size="xs" color="ink2">Representative photo</Text>}
  </View>;
}

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
  return <View style={styles.listing}>
    <Photos model={model} identity={model.id} height={164} onOpen={detail} />
    <View style={styles.block}>
      <Pressable accessibilityRole="button" onPress={detail} style={styles.titleRow}>
        <Text size="lg" weight="bold" style={{ flex: 1 }}>{title}</Text>
        <ChevronRight size={18} color={colors.ink2} />
      </Pressable>
      {shopLink ? <Pressable accessibilityRole="link" hitSlop={4} onPress={() => router.push({ pathname: "/shop/[shopId]", params: { shopId: offer.shopId, ...window } })}>
        <Text size="sm" color="ink2" style={{ textDecorationLine: "underline" }}>{offer.shopName}</Text>
      </Pressable> : <Text color="ink2" size="sm">{offer.shopName}</Text>}
      <View style={styles.tags}>
        {!!offer.licence && <Chip tone="good" label="Licensed to rent" />}
        {model.fuelType === "ELECTRIC" && <Chip tone="info" label="Electric" />}
        <View style={styles.rating}><Star size={13} color={colors.amberText} /><Text size="xs" color="ink2">{offer.rating == null || !offer.reviewCount ? "No reviews yet" : `${offer.rating.toFixed(1)} (${offer.reviewCount})`}</Text></View>
      </View>
      <View style={styles.priceRow}>
        <View style={{ flex: 1, minWidth: 110 }}>
          <Text weight="bold" size="lg">{rupees(offer.pricePerDay)} <Text color="ink2" size="sm">/ day</Text></Text>
          <Text color="ink2" size="xs">{offerVehicleIds.length} available · {rupees(offer.securityDeposit)} deposit</Text>
        </View>
        {n ? <Quantity value={n} max={pool.length} onChange={qty} />
          : <Button variant="primary" label="Add to cart" disabled={!pool.length} onPress={() => qty(1)} />}
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  listing: { borderRadius: radius.card, padding: space[3], backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  block: { gap: space[2], paddingTop: space[2] },
  titleRow: { flexDirection: "row", alignItems: "center", minHeight: 38 },
  tags: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space[2] },
  rating: { flexDirection: "row", alignItems: "center", gap: 4 },
  priceRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2], alignItems: "center", paddingTop: space[2] },
  gallery: { overflow: "hidden", borderRadius: radius.panel, backgroundColor: colors.surface3 },
  overlay: { position: "absolute", right: 10, top: 10 },
  dots: { position: "absolute", bottom: 10, alignSelf: "center", flexDirection: "row", gap: 5, backgroundColor: colors.scrim, borderRadius: radius.full, padding: 6 },
  dot: { height: 5, width: 5, borderRadius: 3, backgroundColor: colors.lineStrong },
  dotActive: { width: 15, backgroundColor: colors.white },
});
