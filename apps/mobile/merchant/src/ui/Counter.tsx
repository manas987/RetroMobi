import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type TextInputProps } from "react-native";
import { AlertTriangle, CheckCircle2, ChevronRight, CircleDot, Clock3, PauseCircle, Search, type LucideIcon } from "lucide-react-native";
import { Chip, Input, Text, colors, radius, shadow, space, tone, type Tone } from "@retromobi/mobile-shared";

export const counter = { navy: "#15283d", pale: "#e9edf1", muted: "#c3d0dc" };

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <View style={styles.row}>
    <View style={styles.grow}>
      <Text size="display" weight="bold" accessibilityRole="header" style={styles.display}>{title}</Text>
      {subtitle && <Text size="sm" color="ink2">{subtitle}</Text>}
    </View>
    {action}
  </View>;
}

export function IconAction({ icon: Icon, label, onPress, primary, disabled, busy }: {
  icon: LucideIcon; label: string; onPress: () => void; primary?: boolean; disabled?: boolean; busy?: boolean;
}) {
  const off = disabled || busy;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: off, busy }}
    disabled={off} onPress={onPress}
    style={({ pressed }) => [styles.iconAction, primary && styles.primary, { opacity: disabled && !busy ? 0.42 : pressed ? 0.7 : 1 }]}>
    {busy ? <ActivityIndicator color={primary ? colors.onAmber : counter.navy} /> : <Icon size={21} strokeWidth={1.9} color={primary ? colors.onAmber : counter.navy} />}
  </Pressable>;
}

export function CounterRowLink({ icon: Icon, title, detail, trailing, onPress, danger }: {
  icon: LucideIcon; title: string; detail?: string; trailing?: ReactNode; onPress: () => void; danger?: boolean;
}) {
  const tint = danger ? colors.danger : counter.navy;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
    <View style={[styles.tile, danger && styles.danger]}><Icon color={tint} size={21} strokeWidth={1.8} /></View>
    <View style={styles.grow}>
      <Text weight="bold" style={{ color: tint }}>{title}</Text>
      {detail && <Text size="sm" color="ink2" numberOfLines={2}>{detail}</Text>}
    </View>
    {trailing != null && <View style={{ maxWidth: "37%" }}>{trailing}</View>}
    <ChevronRight color={colors.ink2} size={17} />
  </Pressable>;
}

export function SearchField({ style, ...props }: TextInputProps) {
  return <View style={styles.search}>
    <Search color={colors.ink2} size={19} />
    <Input {...props} style={[styles.searchInput, style]} />
  </View>;
}

/** A status pill that always carries an icon, so the state reads without reading the word. */
const TONE_ICON: Record<Tone, LucideIcon> = { good: CheckCircle2, attention: Clock3, bad: AlertTriangle, info: CircleDot, muted: PauseCircle };
export function StatusBadge({ tone: t, label, icon }: { tone: Tone; label: string; icon?: LucideIcon }) {
  return <Chip tone={t} label={label} icon={icon ?? TONE_ICON[t]} />;
}

/** Icon in a tinted circle, a big number, a short label. Pressable when `onPress` is given. */
export function StatChip({ icon: Icon, value, label, tone: t = "muted", onPress }: {
  icon: LucideIcon; value: string; label: string; tone?: Tone; onPress?: () => void;
}) {
  const body = <>
    <View style={[styles.statIcon, { backgroundColor: t === "attention" ? colors.amberSoft : tone[t].bg }]}>
      <Icon size={20} strokeWidth={2} color={t === "attention" ? colors.amberText : tone[t].fg} />
    </View>
    <Text size="xl" weight="bold" tnum style={{ color: counter.navy }}>{value}</Text>
    <Text size="sm" color="ink2" numberOfLines={2}>{label}</Text>
  </>;
  if (!onPress) return <View style={styles.stat}>{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} onPress={onPress}
    style={({ pressed }) => [styles.stat, pressed && styles.pressed]}>{body}</Pressable>;
}

/** The one dark card on a screen: the figure that matters most. */
export function HeroCard({ label, value, icon: Icon, children }: { label: string; value: string; icon?: LucideIcon; children?: ReactNode }) {
  return <View style={styles.hero}>
    <View style={[styles.row, { justifyContent: "space-between" }]}>
      <Text color="surface" weight="medium">{label}</Text>
      {Icon && <View style={styles.heroIcon}><Icon color={colors.onAmber} size={20} /></View>}
    </View>
    <Text weight="bold" size="display" color="surface" tnum>{value}</Text>
    {children}
  </View>;
}

export const counterStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space[3] },
  group: { borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  panel: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, shadowOpacity: 0, elevation: 0 },
});

const styles = StyleSheet.create({
  row: counterStyles.row,
  grow: { flex: 1, minWidth: 0, gap: space[1] },
  display: { color: counter.navy, letterSpacing: -1, lineHeight: 38 },
  iconAction: { width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  primary: { backgroundColor: colors.amber, borderColor: colors.amberEdge },
  link: { ...counterStyles.row, minHeight: 60, paddingHorizontal: space[3], paddingVertical: space[2] },
  pressed: { backgroundColor: counter.pale },
  tile: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: counter.pale, alignItems: "center", justifyContent: "center" },
  danger: { backgroundColor: colors.dangerSoft },
  stat: { flex: 1, minWidth: 0, gap: 2, padding: space[3], borderRadius: radius.card },
  statIcon: { width: 40, height: 40, borderRadius: radius.full, alignItems: "center", justifyContent: "center", marginBottom: space[1] },
  hero: { gap: space[2], padding: space[5], borderRadius: radius.hero, backgroundColor: counter.navy, ...shadow.card },
  heroIcon: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center" },
  search: { ...counterStyles.row, minHeight: 48, paddingLeft: space[3], borderRadius: radius.button, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, gap: space[1] },
  searchInput: { flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: "transparent", paddingLeft: space[2] },
});
