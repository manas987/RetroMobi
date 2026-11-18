import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { colors, HIT, radius, space } from "../theme";
import { Text } from "./Text";

type Props<V extends string> = { pill?: boolean; value: V | null; onChange: (value: V) => void; options: readonly { value: V; label: string; count?: number }[] };

function Items<V extends string>({ value, onChange, options, segmented, pill }: Props<V> & { segmented?: boolean }) {
  return options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable key={option.value} onPress={() => onChange(option.value)} accessibilityRole="tab"
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          styles.item, segmented && !pill && styles.segment, pill && styles.pillButton,
          selected && !pill && styles.selected,
          pressed && styles.pressed,
        ]}>
        <Text weight={selected ? "bold" : "medium"} color={selected ? pill ? "surface" : "ink" : "ink2"}
          size={pill ? "sm" : "base"} center style={pill ? [styles.pill, selected && styles.pillSelected] : undefined}>
          {option.label}{option.count === undefined ? "" : ` · ${option.count}`}
        </Text>
      </Pressable>
    );
  });
}

export function Tabs<V extends string>({ wrap, ...props }: Props<V> & { wrap?: boolean }) {
  if (wrap) return <View style={[styles.row, styles.wrap]}><Items {...props} /></View>;
  return <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}><Items {...props} /></ScrollView>;
}

export function Segmented<V extends string>(props: Props<V>) {
  return <View style={props.pill ? styles.pillRow : styles.track}><Items {...props} segmented /></View>;
}

const styles = StyleSheet.create({
  row: { gap: space[1], paddingVertical: space[1] },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  track: { flexDirection: "row", gap: space[1], backgroundColor: colors.line, padding: space[1], borderRadius: radius.panel },
  pillRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  pressed: { opacity: 0.7 },
  item: { minHeight: HIT, padding: space[2], justifyContent: "center", borderRadius: radius.row },
  pillButton: { padding: 0, maxWidth: "100%" },
  pill: {
    overflow: "hidden", borderRadius: radius.full, paddingHorizontal: space[4], paddingVertical: 10,
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  pillSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  segment: { flex: 1 },
  selected: { backgroundColor: colors.surface },
});
