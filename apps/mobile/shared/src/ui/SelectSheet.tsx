import { Fragment, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { colors, HIT, radius, space } from "../theme";
import { Text } from "./Text";
import { Field } from "./basics";
import { Sheet } from "./Sheet";

export type SelectOption<V extends string = string> = { value: V; label: string; group?: string; disabled?: boolean };

export function SelectField<V extends string>({ label, value, onChange, options, placeholder, disabled, closeLabel }: {
  label: string; value: V | null; onChange: (value: V) => void; options: readonly SelectOption<V>[];
  placeholder?: string; disabled?: boolean; closeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value)?.label;
  return (
    <Field label={label}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: selected ?? placeholder }}
        accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(true)} style={styles.trigger}>
        <Text style={styles.label} color={selected ? "ink" : "ink3"}>{selected ?? placeholder ?? "—"}</Text>
        <ChevronDown size={18} color={colors.ink2} accessible={false} />
      </Pressable>
      {open && <Sheet open={open} onClose={() => setOpen(false)} title={label} scroll={false} closeLabel={closeLabel}>
        <SelectOptions options={options} value={value} onChange={(next) => { setOpen(false); onChange(next); }} />
      </Sheet>}
    </Field>
  );
}

export function SelectOptions<V extends string>({ options, value, onChange }: {
  options: readonly SelectOption<V>[]; value: V | null; onChange: (value: V) => void;
}) {
  return (
    <FlatList keyboardShouldPersistTaps="handled" data={options} keyExtractor={(item) => item.value}
      contentContainerStyle={styles.list}
      renderItem={({ item, index }) => (
        <Fragment>
          {item.group && item.group !== options[index - 1]?.group && <Text weight="bold" size="sm" accessibilityRole="header" style={styles.group}>{item.group}</Text>}
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: item.value === value, disabled: item.disabled }}
            disabled={item.disabled} style={[styles.option, item.value === value && styles.active]} onPress={() => onChange(item.value)}>
            <Text style={styles.label} color={item.disabled ? "ink3" : "ink"}>{item.label}</Text>
            {item.value === value && <Check size={18} color={colors.verified} accessible={false} />}
          </Pressable>
        </Fragment>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], minHeight: HIT, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: radius.row, backgroundColor: colors.surface },
  label: { flex: 1 },
  list: { padding: space[4] },
  group: { paddingHorizontal: space[3], marginTop: space[3], marginBottom: space[1] },
  option: { minHeight: HIT, flexDirection: "row", alignItems: "center", gap: space[2], padding: space[3], borderRadius: radius.row },
  active: { backgroundColor: colors.verifiedSoft },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
