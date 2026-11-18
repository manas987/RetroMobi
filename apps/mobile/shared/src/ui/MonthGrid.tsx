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
        {days.slice(0, 7).map((d) => <Text key={d} style={[styles.cell, monochrome && styles.weekday]} center size="xs" color={monochrome ? "ink3" : "ink2"}>{formatIstDate(date(d), { weekday: "narrow" }, lang)}</Text>)}
      </View>
      {Array.from({ length: days.length / 7 }, (_, w) => (
        <View key={w} style={styles.week}>
          {days.slice(w * 7, w * 7 + 7).map((day, col) => {
            if (monochrome) return <WebDay key={day} day={day} col={col} from={from} to={to} lang={lang} onPress={onPress}
              outside={!day.startsWith(monthKey(month))} blocked={(!!min && day < min) || (!!max && day > max) || !!disabled?.(day)} />;
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

/**
 * The website's calendar day (react-day-picker "calendar-black-glass"): a fixed 44pt circle,
 * neighbouring-month days left blank, black circles on the two ends and a grey band between
 * them that starts and stops under the circles' centres and rounds off at the week's edges.
 */
function WebDay({ day, col, from, to, outside, blocked, lang, onPress }: {
  day: string; col: number; from?: string; to?: string; outside: boolean; blocked: boolean; lang: Lang; onPress: (day: string) => void;
}) {
  if (outside) return <View style={[styles.cell, styles.webDay]} />;
  const edge = day === from || day === to;
  const range = !!from && !!to && from !== to;
  const inside = range && day >= from && day <= to;
  const label = formatIstDate(`${day}T12:00:00+05:30`, { weekday: "long", day: "numeric", month: "long", year: "numeric" }, lang);
  return <Pressable disabled={blocked} accessibilityRole="button" accessibilityState={{ selected: edge || inside, disabled: blocked }} accessibilityLabel={label}
    style={[styles.cell, styles.webDay]} onPress={() => onPress(day)}>
    {inside && <View pointerEvents="none" style={[styles.webBand,
      col === 0 && styles.webRowStart, col === 6 && styles.webRowEnd,
      day === from && styles.webBandStart, day === to && styles.webBandEnd]} />}
    <View style={[styles.webCircle, edge && styles.webCircleOn]}>
      <Text size="sm" weight={edge ? "bold" : "regular"} color={edge ? "white" : "ink"} style={blocked ? { opacity: 0.35 } : undefined}>{Number(day.slice(-2))}</Text>
    </View>
  </Pressable>;
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
  weekday: { fontSize: 11, textTransform: "uppercase", paddingVertical: space[1] },
  webDay: { height: HIT, alignItems: "center", justifyContent: "center", marginTop: 2 },
  webBand: { position: "absolute", top: 2, bottom: 2, left: -1, right: -1, backgroundColor: colors.surface3 },
  webBandStart: { left: "50%" },
  webBandEnd: { right: "50%" },
  webRowStart: { left: 0, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  webRowEnd: { right: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12 },
  webCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  webCircleOn: { backgroundColor: colors.ink, shadowColor: colors.ink, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
});
