import { Fragment, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { colors, HIT, radius, space } from "../theme";
import { Text } from "./Text";
import { Field } from "./basics";
import { Sheet } from "./Sheet";

export type SelectOption<V extends string = string> = { value: V; label: string; detail?: string; group?: string; disabled?: boolean };

export function SelectField<V extends string>({ label, value, onChange, options, placeholder, disabled, closeLabel, compact }: {
  label: string; value: V | null; onChange: (value: V) => void; options: readonly SelectOption<V>[];
  placeholder?: string; disabled?: boolean; closeLabel?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value)?.label;
  const control = <>
    <SelectTrigger label={label} value={selected} placeholder={placeholder} disabled={disabled} expanded={open}
      compact={compact} onPress={() => setOpen(true)} />
    {open && <Sheet open={open} onClose={() => setOpen(false)} title={label} scroll={false} closeLabel={closeLabel}>
      <SelectOptions options={options} value={value} onChange={(next) => { setOpen(false); onChange(next); }} />
    </Sheet>}
  </>;
  return compact ? control : <Field label={label}>{control}</Field>;
}

export function SelectTrigger({ label, value, placeholder, compact, expanded, disabled, onPress }: {
  label: string; value?: string; placeholder?: string; compact?: boolean; expanded?: boolean; disabled?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: value ?? placeholder }}
      accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.trigger, compact && styles.compact, pressed && styles.active, disabled && styles.disabled]}>
      <View style={styles.label}>
        {compact && <Text size="xs" weight="medium" color="ink2">{label}</Text>}
        <Text size={compact ? "sm" : "base"} weight={compact ? "bold" : "regular"} color={value ? "ink" : compact ? "ink2" : "ink3"}>
          {value ?? placeholder ?? "—"}
        </Text>
      </View>
      <View style={compact ? styles.chevron : undefined}>
        <ChevronDown size={17} color={colors.ink2} accessible={false} />
      </View>
    </Pressable>;
}

export function SelectOptions<V extends string>({ options, value, onChange }: {
  options: readonly SelectOption<V>[]; value: V | null; onChange: (value: V) => void;
}) {
  return (
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" data={options} keyExtractor={(item) => item.value}
      contentContainerStyle={styles.list}
      renderItem={({ item, index }) => (
        <Fragment>
          {item.group && item.group !== options[index - 1]?.group && <Text weight="bold" size="sm" accessibilityRole="header" style={styles.group}>{item.group}</Text>}
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: item.value === value, disabled: item.disabled }}
            disabled={item.disabled} style={[styles.option, item.value === value && styles.active]} onPress={() => onChange(item.value)}>
            <View style={styles.label}>
              <Text weight={item.detail ? "bold" : "regular"} color={item.disabled ? "ink3" : "ink"}>{item.label}</Text>
              {item.detail && <Text size="sm" color="ink2">{item.detail}</Text>}
            </View>
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
  compact: { minHeight: 56, borderRadius: radius.panel, paddingVertical: space[2], backgroundColor: colors.surface2 },
  chevron: { height: 30, width: 30, borderRadius: radius.full, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.55 },
  label: { flex: 1, minWidth: 0 },
  list: { padding: space[4] },
  group: { paddingHorizontal: space[3], marginTop: space[3], marginBottom: space[1] },
  option: { minHeight: HIT, flexDirection: "row", alignItems: "center", gap: space[2], padding: space[3], borderRadius: radius.row },
  active: { backgroundColor: colors.verifiedSoft },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
});
