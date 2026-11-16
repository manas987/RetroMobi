import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { colors, HIT, radius, space } from "../theme";
import { Text } from "./Text";

type Props<V extends string> = { value: V | null; onChange: (value: V) => void; options: readonly { value: V; label: string; count?: number }[] };

function Items<V extends string>({ value, onChange, options, segmented }: Props<V> & { segmented?: boolean }) {
  return options.map((option) => (
    <Pressable key={option.value} onPress={() => onChange(option.value)} accessibilityRole="tab"
      accessibilityState={{ selected: option.value === value }} style={[styles.item, segmented && styles.segment, option.value === value && styles.selected]}>
      <Text weight={option.value === value ? "bold" : "medium"} color={option.value === value ? "ink" : "ink2"} center>
        {option.label}{option.count === undefined ? "" : ` · ${option.count}`}
      </Text>
    </Pressable>
  ));
}

export function Tabs<V extends string>(props: Props<V>) {
  return <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}><Items {...props} /></ScrollView>;
}

export function Segmented<V extends string>(props: Props<V>) {
  return <View style={styles.track}><Items {...props} segmented /></View>;
}

const styles = StyleSheet.create({
  row: { gap: space[1], paddingVertical: space[1] },
  track: { flexDirection: "row", gap: space[1], backgroundColor: colors.line, padding: space[1], borderRadius: radius.panel },
  item: { minHeight: HIT, padding: space[2], justifyContent: "center", borderRadius: radius.row },
  segment: { flex: 1 },
  selected: { backgroundColor: colors.surface },
});
