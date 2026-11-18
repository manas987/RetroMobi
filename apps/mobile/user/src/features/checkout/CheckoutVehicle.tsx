import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { Bike } from "lucide-react-native";
import { Text, colors, space } from "@retromobi/mobile-shared";
import { stockPhotos } from "../explore/stockPhoto";

export function CheckoutVehicle({ make, model, shopName, riderName }: { make: string; model: string; shopName: string; riderName?: string | null }) {
  const photo = stockPhotos(make, model)[0];
  return <View style={styles.row}>
    <View style={styles.thumbnail}>
      {photo != null ? <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Representative vehicle photo" />
        : <Bike color={colors.ink2} size={23} />}
    </View>
    <View style={styles.copy}>
      <Text size="md" weight="bold">{make} {model}</Text>
      <Text size="sm" color="ink2">{shopName}</Text>
      {riderName && <Text size="sm" color="ink2">Rider · {riderName}</Text>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  thumbnail: { width: 84, height: 66, alignItems: "center", justifyContent: "center", borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface3 },
  copy: { flex: 1, gap: 2 },
});
