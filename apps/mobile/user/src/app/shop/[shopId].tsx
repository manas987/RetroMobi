import { useState } from "react";
import { FlatList, Linking, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Button, Chip, DateRangeSheet, ErrorNote, LoadingRows, Screen, Segmented, Text,
  bodyTypeLabel, dateLabel, dateTimeLabel, defaultWindow, errorMessage, formatClock, phoneLabel, rentalWindowFromSearch,
  space, useToast, type ShopProfile,
} from "@retromobi/mobile-shared";
import { Card, EmptyState } from "../../features/RiderSurface";
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
  const [type, setType] = useState<string | null>(null);
  const [sort, setSort] = useState<"price" | "rating">("price");
  const profile = usePublic<ShopProfile>(shopId ? `/shops/${encodeURIComponent(shopId)}` : null);
  const q = useSearch({ city: "", shopId, ...win, sort, page: 1, bodyType: type ? [type] : undefined });
  const shop = profile.data;
  const refresh = () => { void Promise.all([profile.refetch(), q.refetch()]); };
  const go = (url: string) => { void Linking.openURL(url).catch(() => toast("Couldn't open the link.")); };
  const address = shop ? [shop.addressLine1, shop.landmark, shop.city, shop.state, shop.pincode].filter(Boolean).join(", ") : "";
  const licence = shop?.licences[0];

  return <Screen scroll={false} padded={false} edges={["left", "right", "bottom"]}>
    <Stack.Screen options={{ title: shop?.name ?? "Shop" }} />
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={profile.isSuccess && !q.isError ? q.data?.results ?? [] : []} keyExtractor={(row) => row.model.id}
      contentContainerStyle={{ padding: space[4], gap: space[3] }} refreshing={profile.isRefetching || q.isRefetching} onRefresh={refresh}
      ListHeaderComponent={shop && <View style={{ gap: space[3] }}>
        <Text size="xxl" weight="bold" accessibilityRole="header">{shop.name}</Text>
        <Chip label={shop.status === "OPEN" ? "Open" : "Closed"} tone={shop.status === "OPEN" ? "good" : "muted"} />
        <Text color="ink2">{shop.rating == null || !shop.reviewCount ? "No reviews yet" : `${shop.rating.toFixed(1)} / 5 · ${shop.reviewCount} reviews`}</Text>
        <Card title="Shop details"><View style={{ gap: space[2] }}>
          <Text>{address}</Text>
          {shop.phone && <Button label={phoneLabel(shop.phone)} onPress={() => go(`tel:${shop.phone}`)} />}
          {shop.ownerName && <Text>Licence holder · {shop.ownerName}</Text>}
          <Text>Rent-a-Motorcycle licence · {licence ? `${licence.licenceNumber}${licence.issuingAuthority ? ` · ${licence.issuingAuthority}` : ""}${licence.expiresAt ? ` · valid to ${dateLabel(licence.expiresAt)}` : ""}` : "No active licence on record"}</Text>
          {!!shop.memberSince && <Text size="sm" color="ink2">Member since {dateLabel(shop.memberSince)}</Text>}
        </View></Card>
        <Card title="Shop photos"><Photos identity={shop.shopId} urls={shop.photoUrls} /></Card>
        {!!shop.hours.length && <Card title="Opening hours"><View style={{ gap: space[1] }}>
          {shop.hours.map((day) => <Text key={day.dayOfWeek} size="sm">{weekdays[day.dayOfWeek]} · {formatClock(day.opensAt.slice(0, 5))} – {formatClock(day.closesAt.slice(0, 5))}</Text>)}
        </View></Card>}
        <Card title="Pickup location">
          <ShopMap lat={shop.latitude} lng={shop.longitude} name={shop.name} />
          <Button label="Get directions" onPress={() => go(directions(shop.latitude, shop.longitude, address))} />
        </Card>
        <Text weight="bold" size="lg" accessibilityRole="header">Vehicles at this shop</Text>
        <Button label={`${dateTimeLabel(win.pickupAt)} → ${dateTimeLabel(win.returnAt)}`} accessibilityLabel="Change dates" onPress={() => setDates(true)} />
        <Segmented value={sort} onChange={setSort} options={[{ value: "price", label: "Price" }, { value: "rating", label: "Rating" }]} />
        {!!shop.bodyTypes.length && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          <Button label="All vehicles" variant={type === null ? "dark" : "secondary"} onPress={() => setType(null)} />
          {shop.bodyTypes.map((value) => <Button key={value} label={bodyTypeLabel(value)} variant={type === value ? "dark" : "secondary"} onPress={() => setType(type === value ? null : value)} />)}
        </View>}
      </View>}
      ListEmptyComponent={profile.isPending || q.isPending ? <LoadingRows label="Loading shop" /> : profile.error || q.error
        ? <ErrorNote text={errorMessage(profile.error ?? q.error, "Couldn't load this shop.")} onRetry={refresh} />
        : <EmptyState inline title="No vehicles match this search" action={<Button label="Change dates" onPress={() => setDates(true)} />} />}
      ListFooterComponent={shop ? <Reviews id={shop.shopId} name={shop.name} reviewBooking={reviewBooking} /> : undefined}
      renderItem={({ item }) => <VehicleCard result={item} window={win} shopLink={false} />} />
    <DateRangeSheet monochrome open={dates} value={win} onClose={() => setDates(false)} onChange={(value) => router.setParams(value)} />
  </Screen>;
}
