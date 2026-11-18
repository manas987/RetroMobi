import { Pressable, StyleSheet, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { Text, colors, radius } from "@retromobi/mobile-shared";

export function Quantity({ value, max, onChange }: { value: number; max: number; onChange: (value: number) => void }) {
  return <View style={styles.track}>
    <Pressable accessibilityRole="button" accessibilityLabel="Decrease quantity" style={styles.control} onPress={() => onChange(value - 1)}>
      <Minus size={18} color={colors.ink} />
    </Pressable>
    <Text weight="bold" accessibilityLabel={`Quantity ${value}`}>{value}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Increase quantity" accessibilityState={{ disabled: value >= max }}
      disabled={value >= max} style={styles.control} onPress={() => onChange(value + 1)}>
      <Plus size={18} color={value >= max ? colors.ink4 : colors.ink} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, backgroundColor: colors.surface3, borderRadius: radius.full },
  control: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
});
