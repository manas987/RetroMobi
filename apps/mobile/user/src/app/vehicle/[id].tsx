import { useState } from "react";
import { Linking, Share, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Share2 } from "lucide-react-native";
import {
  Button, Chip, DateRangeSheet, ErrorNote, LoadingRows, Screen, Text, ApiError,
  bodyTypeLabel, dateLabel, dateTimeLabel, defaultWindow, enumLabel, errorMessage, rentalDays, rentalWindowFromSearch, rupees, space, useToast, type VehicleDetail,
} from "@retromobi/mobile-shared";
import { Card, EmptyState, IconAction } from "../../features/RiderSurface";
import { directions, usePublic } from "../../features/explore/api";
import { Photos } from "../../features/explore/VehicleCard";
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
  const [policy, setPolicy] = useState(false);
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
  const show = (url: string) => { void Linking.openURL(url).catch(() => toast("Couldn't open the link.")); };

  function book() {
    if (inside) { router.push("/cart"); return; }
    if (!canBook || !v?.quote) return;
    const selected = [...new Set([...(line?.vehicleIds ?? []), v.vehicleId])];
    const pool = [...new Set([...selected, ...(line?.availableVehicleIds ?? [])])];
    if (cart.setQty({ modelId: v.modelId, shopId: v.shopId, shopName: v.shopName, make: v.make, model: v.model, pricePerDay: v.quote.pricePerDay, ...win }, selected.length, pool) === "ok") router.push("/cart");
  }

  return <Screen edges={["left", "right", "bottom"]} contentStyle={{ gap: space[4] }} refreshing={q.isRefetching}
    onRefresh={q.isSuccess ? () => void q.refetch() : undefined}
    footer={v && q.isSuccess && <View style={{ gap: space[3], flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
      {v.quote && <View><Text size="xs" color="ink2">Rental subtotal</Text><Text size="lg" weight="bold">{rupees(v.quote.rentalAmount)}</Text></View>}
      <Button label={inside ? "View cart" : canBook ? "Add to cart" : "Not available"} variant="primary" disabled={!inside && !canBook} onPress={book} />
    </View>}>
    <Stack.Screen options={{ title: name }} />
    {q.isPending ? <LoadingRows label="Loading vehicle" /> : gone ? <EmptyState title="Listing unavailable"
      text={q.error instanceof ApiError && q.error.status === 400 ? "This listing link is invalid. Browse for another ride." : "This vehicle is no longer listed. Browse for another ride."}
      action={<Button label="Back to browse" onPress={() => router.replace("/browse")} />} />
      : q.error ? <ErrorNote text={errorMessage(q.error, "Couldn't load this vehicle.")} onRetry={() => void q.refetch()} /> : v && <>
        <Photos key={v.vehicleId} identity={v.vehicleId} urls={v.photoUrls} model={{ id: v.modelId, imageKey: v.imageKey, make: v.make, model: v.model }} action={<IconAction icon={Share2} label="Share vehicle" onPress={() => {
          const env = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "");
          const link = env ? `${env}/vehicles/${v.vehicleId}` : `retromobi://vehicle/${v.vehicleId}`;
          void Share.share({ message: `${name} · ${v.shopName}\n${link}` }).catch(() => toast("Couldn't share this listing."));
        }} />} />
        <Text weight="bold" size="xxl" accessibilityRole="header">{name}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {v.fuelType && <Chip tone={v.fuelType === "ELECTRIC" ? "info" : "muted"} label={v.fuelType === "ELECTRIC" ? "Electric" : "Petrol"} />}
          {v.engineCc != null && <Chip tone="muted" label={`${v.engineCc} cc`} />}
          {v.bodyType && <Chip tone="muted" label={bodyTypeLabel(v.bodyType)} />}
          {v.seatingCapacity != null && <Chip tone="muted" label={`${v.seatingCapacity} seats`} />}
        </View>
        <Text size="sm" color="ink2">{v.rating == null || !v.reviewCount ? "No reviews yet" : `${v.rating.toFixed(1)} / 5 · ${v.reviewCount} reviews`}</Text>

        <Card title="Your rental dates"><View style={{ gap: space[2] }}>
          <Text>{dateTimeLabel(win.pickupAt)} → {dateTimeLabel(win.returnAt)}</Text>
          <Text size="sm" color="ink2">{rentalDays(win.pickupAt, win.returnAt)} rental {rentalDays(win.pickupAt, win.returnAt) === 1 ? "day" : "days"}</Text>
          {v.quote && <Text size="lg" weight="bold">{rupees(v.quote.pricePerDay)} / day</Text>}
          <Button label="Change dates" onPress={() => setDates(true)} />
        </View></Card>
        <Card title={v.licence ? "Licensed to rent" : "Licence not yet confirmed"}>
          <Text color="ink2">{v.licence ? `Named on ${v.shopName}'s Rent-a-Motorcycle licence ${v.licence.licenceNumber}${v.licence.issuingAuthority ? ` (${v.licence.issuingAuthority})` : ""}${v.licence.validUntil ? `, valid to ${dateLabel(v.licence.validUntil)}.` : "."}`
            : "This vehicle has no confirmed rental licence covering these dates."}</Text>
        </Card>
        <Card title="Pricing"><View style={{ gap: space[2] }}>
          <Text>Weekday rate · {rupees(v.amount)} / day</Text><Text>Weekend rate · {rupees(v.weekendAmount)} / day</Text>
          <Text>Refundable deposit · {rupees(v.securityDeposit)}</Text>
          {v.lateFeeAmount > 0 && <Text>Late return · {rupees(v.lateFeeAmount)} / hour</Text>}
        </View></Card>
        <Card title="Rental terms"><View style={{ gap: space[2] }}>
          <Text>Bring to pickup · Your original driving licence</Text>
          {v.accessories.length > 0 && <Text>Accessories · {v.accessories.map((item) => `${item.quantity} × ${enumLabel(item.type)}`).join(", ")}</Text>}
          <Button label="Cancellation policy" accessibilityState={{ expanded: policy }} onPress={() => setPolicy(!policy)} />
          {policy && <RentalPolicy />}
        </View></Card>
        <Card title="Shop identity"><View style={{ gap: space[2] }}>
          <Button label={v.shopName} onPress={() => router.push({ pathname: "/shop/[shopId]", params: { shopId: v.shopId, ...win } })} />
          <Text color="ink2">{v.shopAddress}</Text>
          <ShopMap lat={v.shopLatitude} lng={v.shopLongitude} name={v.shopName} />
          <Button label="Get directions" onPress={() => show(directions(v.shopLatitude, v.shopLongitude, v.shopAddress))} />
          {v.shopPhone && <Button label={v.shopPhone} onPress={() => show(`tel:${v.shopPhone}`)} />}
        </View></Card>
        <Reviews id={v.shopId} name={v.shopName} />
      </>}
    <DateRangeSheet monochrome open={dates} value={win} onClose={() => setDates(false)} onChange={(value) => router.setParams(value)} />
  </Screen>;
}
