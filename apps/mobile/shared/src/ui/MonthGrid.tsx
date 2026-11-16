import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { formatIstDate, type Lang } from "../lib/format";
import { monthDays, shiftMonth, type Month } from "../lib/calendar";
import { colors, HIT, radius, space } from "../theme";
import { Text } from "./Text";

export function MonthGrid({ month, selected, disabled, onPress, onMonthChange, renderDay, lang = "en", min, max, monochrome = false }: {
  month: Month; selected?: string | { from: string; to: string }; disabled?: (day: string) => boolean;
  onPress: (day: string) => void; onMonthChange: (month: Month) => void; renderDay?: (day: string) => ReactNode;
  lang?: Lang; min?: string; max?: string; monochrome?: boolean;
}) {
  const days = monthDays(month);
  const from = typeof selected === "string" ? selected : selected?.from;
  const to = typeof selected === "string" ? selected : selected?.to;
  const monthKey = (v: Month) => `${v.y}-${String(v.m).padStart(2, "0")}`;
  const date = (day: string) => `${day}T12:00:00+05:30`;
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return (
    <View style={styles.grid}>
      <View style={styles.header}>
        <MonthButton direction={-1} lang={lang} disabled={!!min && monthKey(prev) < min.slice(0, 7)} onPress={() => onMonthChange(prev)} />
        <Text style={styles.heading} weight="bold" accessibilityRole="header" center>
          {formatIstDate(date(`${monthKey(month)}-01`), { month: "long", year: "numeric" }, lang)}
        </Text>
        <MonthButton direction={1} lang={lang} disabled={!!max && monthKey(next) > max.slice(0, 7)} onPress={() => onMonthChange(next)} />
      </View>
      <View style={styles.week} accessible={false}>
        {days.slice(0, 7).map((d) => <Text key={d} style={styles.cell} center size="xs" color="ink2">{formatIstDate(date(d), { weekday: "narrow" }, lang)}</Text>)}
      </View>
      {Array.from({ length: days.length / 7 }, (_, w) => (
        <View key={w} style={styles.week}>
          {days.slice(w * 7, w * 7 + 7).map((day) => {
            const blocked = (!!min && day < min) || (!!max && day > max) || !!disabled?.(day);
            const edge = day === from || day === to;
            const inside = !!from && !!to && day >= from && day <= to;
            return (
              <Pressable key={day} disabled={blocked} accessibilityRole="button" accessibilityState={{ selected: edge || inside, disabled: blocked }}
                accessibilityLabel={formatIstDate(date(day), { weekday: "long", day: "numeric", month: "long", year: "numeric" }, lang)}
                style={[styles.cell, styles.day, inside && (monochrome ? styles.band : styles.inside), monochrome && inside && day === from && styles.bandStart, monochrome && inside && day === to && styles.bandEnd, !monochrome && edge && styles.edge]} onPress={() => onPress(day)}>
                <View style={monochrome && edge ? styles.blackDay : undefined}><Text size="sm" weight={edge ? "bold" : "regular"} color={monochrome && edge ? "white" : blocked || (!edge && !day.startsWith(monthKey(month))) ? "ink3" : "ink"}>
                  {Number(day.slice(-2))}
                </Text></View>
                {renderDay?.(day)}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function MonthButton({ direction, lang, disabled, onPress }: { direction: -1 | 1; lang: Lang; disabled: boolean; onPress: () => void }) {
  const Icon = direction < 0 ? ChevronLeft : ChevronRight;
  const label = lang === "hi" ? (direction < 0 ? "पिछला महीना" : "अगला महीना") : (direction < 0 ? "Previous month" : "Next month");
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={styles.monthButton}><Icon size={20} color={disabled ? colors.ink4 : colors.ink} /></Pressable>;
}

const styles = StyleSheet.create({
  grid: { gap: space[1] }, header: { flexDirection: "row", alignItems: "center" },
  heading: { flex: 1 }, week: { flexDirection: "row" }, cell: { flex: 1, minWidth: 0 },
  day: { minHeight: HIT, alignItems: "center", justifyContent: "center" },
  edge: { borderRadius: radius.row, backgroundColor: colors.amber },
  inside: { backgroundColor: colors.amberSoft },
  band: { backgroundColor: colors.surface3 },
  bandStart: { borderTopLeftRadius: radius.full, borderBottomLeftRadius: radius.full },
  bandEnd: { borderTopRightRadius: radius.full, borderBottomRightRadius: radius.full },
  blackDay: { width: "100%", maxWidth: 44, aspectRatio: 1, borderRadius: radius.full, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  monthButton: { width: HIT, height: HIT, alignItems: "center", justifyContent: "center" },
});
