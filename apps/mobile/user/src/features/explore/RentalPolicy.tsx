import { View } from "react-native";
import { Text, space } from "@retromobi/mobile-shared";

export function RentalPolicy() {
  return <View style={{ gap: space[2] }}>
    <Text>More than 24 hours before pickup · 90% of the rental refunded</Text>
    <Text>2–24 hours before pickup · 50% of the rental refunded</Text>
    <Text>Under 2 hours until pickup · No rental refund</Text>
    <Text size="sm" color="ink2">Eligible cancellations include a full deposit refund. Rental refunds are based on the scheduled pickup time and exclude the platform fee. Rental amounts include tax.</Text>
  </View>;
}
