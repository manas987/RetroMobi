import { StyleSheet, View } from "react-native";
import { Text, colors, radius, space } from "@retromobi/mobile-shared";

const tiers = [
  { window: "More than 24 hours", refund: "90%" },
  { window: "2–24 hours", refund: "50%" },
  { window: "Under 2 hours", refund: "0%" },
];

export function RentalPolicy() {
  return <View style={{ gap: space[3] }}>
    <View style={styles.table}>
      <View style={[styles.row, styles.header]}>
        <Text size="xs" weight="bold" color="ink2" style={styles.grow}>Before scheduled pickup</Text>
        <Text size="xs" weight="bold" color="ink2">Rental refund</Text>
      </View>
      {tiers.map(({ window, refund }) => <View key={window} style={[styles.row, styles.rule]}>
        <Text size="sm" weight="medium" style={styles.grow}>{window}</Text>
        <Text size="lg" weight="bold" color={refund === "0%" ? "ink2" : "verified"} tnum>{refund}</Text>
      </View>)}
    </View>
    <View style={styles.notes}>
      <Text size="sm"><Text size="sm" weight="bold">Deposit </Text>· Refunded in full on eligible cancellations.</Text>
      <Text size="sm"><Text size="sm" weight="bold">Platform fee </Text>· Excluded from the refund. Rental amounts include tax.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  table: { backgroundColor: colors.surface, borderRadius: radius.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, overflow: "hidden" },
  row: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3], paddingHorizontal: space[3], paddingVertical: space[2] },
  grow: { flex: 1 },
  header: { backgroundColor: colors.surface3 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  notes: { gap: space[2], paddingHorizontal: space[1] },
});
