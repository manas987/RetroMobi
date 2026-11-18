import { FlatList, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Stack, useRouter } from "expo-router";
import { Bike, Trash2 } from "lucide-react-native";
import { Button, Screen, Text, colors, dayLabel, rupees, space, timeLabel } from "@retromobi/mobile-shared";
import { EmptyState, Headline, IconAction, PillCTA, Ticket } from "../features/RiderSurface";
import { Quantity } from "../features/explore/Quantity";
import { stockPhotos } from "../features/explore/stockPhoto";
import { useCart } from "../state/cart";
import { art } from "../ui/art";

export default function Cart() {
  const cart = useCart();
  const router = useRouter();
  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/browse"); };
  const perDay = cart.items.reduce((sum, item) => sum + item.pricePerDay * item.vehicleIds.length, 0);

  return <Screen scroll={false} padded={false} edges={["left", "right", "bottom"]} footer={cart.items.length > 0
    ? <PillCTA label="Checkout" onPress={() => router.push("/checkout")} amount={`${rupees(perDay)}`} caption={`${cart.totalUnits} ${cart.totalUnits === 1 ? "vehicle" : "vehicles"} · per day`} />
    : null}>
    <Stack.Screen options={{ title: "" }} />
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={cart.items} keyExtractor={(line) => `${line.shopId}:${line.modelId}`}
      contentContainerStyle={{ flexGrow: 1, padding: space[4], paddingTop: space[1], gap: space[4] }}
      ListHeaderComponent={cart.items.length ? <Headline kicker="Ready when you are" title="Your cart" /> : undefined}
      ListEmptyComponent={<EmptyState image={art.emptyCart} title="Your cart is empty" text="Find a vehicle you like and add it here when you’re ready to book."
        action={<Button label="Browse vehicles" variant="primary" onPress={close} />} />}
      renderItem={({ item }) => {
        const photo = stockPhotos(item.make, item.model)[0];
        return <View style={styles.card}>
          <View style={styles.vehicle}>
            <View style={styles.photo}>
              {photo ? <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Representative vehicle photo" />
                : <Bike size={28} color={colors.ink2} />}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text size="lg" weight="bold" numberOfLines={1}>{item.make} {item.model}</Text>
              <Text size="sm" color="ink2" numberOfLines={1}>{item.shopName}</Text>
              <Text weight="bold" tnum>{rupees(item.pricePerDay)}<Text size="sm" color="ink2"> / day</Text></Text>
            </View>
          </View>
          {item.pickupAt && item.returnAt && <Ticket
            from={{ label: "Pickup", day: dayLabel(item.pickupAt), time: timeLabel(item.pickupAt) }}
            to={{ label: "Return", day: dayLabel(item.returnAt), time: timeLabel(item.returnAt) }} />}
          <View style={styles.footer}>
            <Quantity value={item.vehicleIds.length} max={item.availableVehicleIds.length}
              onChange={(value) => cart.setQty(item, value, item.availableVehicleIds)} />
            <IconAction icon={Trash2} tone="soft" label={`Remove ${item.make} ${item.model} from cart`} onPress={() => cart.setQty(item, 0, item.availableVehicleIds)} />
          </View>
        </View>;
      }} />
  </Screen>;
}

const styles = StyleSheet.create({
  card: { padding: space[3], gap: space[3], borderRadius: 28, backgroundColor: colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  vehicle: { flexDirection: "row", alignItems: "center", gap: space[3] },
  photo: { width: 104, height: 84, backgroundColor: colors.surface3, borderRadius: 20, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] },
});
