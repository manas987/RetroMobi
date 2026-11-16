import { FlatList, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { Button, Screen, Text, dateTimeLabel, rupees, space } from "@retromobi/mobile-shared";
import { Card, EmptyState, IconAction } from "../features/RiderSurface";
import { Quantity } from "../features/explore/Quantity";
import { useCart } from "../state/cart";

export default function Cart() {
  const cart = useCart();
  const router = useRouter();
  const close = () => { if (router.canGoBack()) router.back(); else router.replace("/browse"); };

  return <Screen scroll={false} padded={false} edges={["left", "right", "bottom"]} footer={cart.items.length > 0
    ? <Button label="Checkout" variant="primary" onPress={() => router.push("/checkout")} /> : null}>
    <Stack.Screen options={{ title: "Your cart" }} />
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={cart.items} keyExtractor={(line) => `${line.shopId}:${line.modelId}`}
      contentContainerStyle={{ flexGrow: 1, padding: space[4], gap: space[3] }}
      ListEmptyComponent={<EmptyState title="Your cart is empty" text="Find a vehicle you like and add it here when you’re ready to book."
        action={<Button label="Browse vehicles" variant="primary" onPress={close} />} />}
      renderItem={({ item }) => <Card title={`${item.make} ${item.model}`}><View style={{ gap: space[2] }}>
        <Text color="ink2">{item.shopName}</Text>
        {item.pickupAt && item.returnAt && <Text size="sm" color="ink2">{dateTimeLabel(item.pickupAt)} → {dateTimeLabel(item.returnAt)}</Text>}
        <Text weight="bold">{rupees(item.pricePerDay)} / day</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], alignItems: "center", justifyContent: "space-between" }}>
          <Quantity value={item.vehicleIds.length} max={item.availableVehicleIds.length}
            onChange={(value) => cart.setQty(item, value, item.availableVehicleIds)} />
          <IconAction icon={Trash2} label={`Remove ${item.make} ${item.model} from cart`} onPress={() => cart.setQty(item, 0, item.availableVehicleIds)} />
        </View>
      </View></Card>} />
  </Screen>;
}
