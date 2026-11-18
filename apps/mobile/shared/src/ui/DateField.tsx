import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CalendarDays, ChevronDown } from "lucide-react-native";
import { monthOf, shiftMonth, type Month } from "../lib/calendar";
import { dateLabel, istDay } from "../lib/format";
import { useT } from "../i18n";
import { colors, HIT, radius, space } from "../theme";
import { Field } from "./basics";
import { Button } from "./Button";
import { MonthGrid } from "./MonthGrid";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

export function DateField({ label, value, onChange, min, max, clearable, yearStepper = true, inline = false }: {
  label: string; value?: string | null; onChange: (value: string) => void;
  min?: string; max?: string; clearable?: boolean; yearStepper?: boolean; inline?: boolean;
}) {
  const { lang, t } = useT();
  const [month, setMonth] = useState<Month | null>(null);
  const open = () => {
    const day = value || istDay(new Date());
    setMonth(monthOf(min && day < min ? min : max && day > max ? max : day));
  };
  const moveYear = (delta: number) => {
    if (!month) return;
    const next = shiftMonth(month, delta * 12);
    const target = `${next.y}-${String(next.m).padStart(2, "0")}`;
    setMonth(min && target < min.slice(0, 7) ? monthOf(min) : max && target > max.slice(0, 7) ? monthOf(max) : next);
  };
  const control = <>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={label}
        accessibilityValue={{ text: value ? dateLabel(value, lang) : t("common.pickDate") }}
        accessibilityState={{ expanded: month !== null }}
        style={({ pressed }) => [styles.trigger, inline && styles.inline, pressed && styles.pressed]}>
        <CalendarDays size={18} color={colors.ink2} accessible={false} />
        <View style={{ flex: 1 }}>
          {inline && <Text size="xs" weight="medium" color="ink2">{label}</Text>}
          <Text color={value ? "ink" : inline ? "ink2" : "ink3"}>{value ? dateLabel(value, lang) : t("common.pickDate")}</Text>
        </View>
        {inline && <ChevronDown size={17} color={colors.ink2} accessible={false} />}
      </Pressable>
      {month && <Sheet open title={label} closeLabel={t("common.close")} onClose={() => setMonth(null)}
        footer={clearable && value ? <Button label={t("common.clear")} onPress={() => { onChange(""); setMonth(null); }} /> : null}>
        {yearStepper && <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space[2] }}>
          <Button variant="ghost" accessibilityLabel={lang === "hi" ? "पिछला साल" : "Previous year"} label={String(month.y - 1)}
            disabled={!!min && month.y <= monthOf(min).y} onPress={() => moveYear(-1)} />
          <Button variant="ghost" accessibilityLabel={lang === "hi" ? "अगला साल" : "Next year"} label={String(month.y + 1)}
            disabled={!!max && month.y >= monthOf(max).y} onPress={() => moveYear(1)} />
        </View>}
        <MonthGrid month={month} selected={value ?? undefined} min={min} max={max} lang={lang}
          onMonthChange={setMonth} onPress={(day) => { onChange(day); setMonth(null); }} />
      </Sheet>}
  </>;
  return inline ? control : <Field label={label}>{control}</Field>;
}

const styles = StyleSheet.create({
  trigger: { minHeight: HIT, flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.row, backgroundColor: colors.surface },
  inline: { gap: space[3], paddingVertical: space[3], paddingHorizontal: space[4], borderRadius: radius.button, backgroundColor: colors.surface2 },
  pressed: { backgroundColor: colors.verifiedSoft },
});
