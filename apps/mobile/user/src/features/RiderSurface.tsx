import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from "react-native";
import { Image, type ImageProps } from "expo-image";
import * as Haptics from "expo-haptics";
import { ArrowRight, Bike, Check, type LucideIcon } from "lucide-react-native";
import { Card as SharedCard, EmptyState as SharedEmptyState, HIT, Text, colors, radius, space } from "@retromobi/mobile-shared";
import { trail, type } from "../ui/trail";

export function Card({ style, ...props }: ComponentProps<typeof SharedCard>) {
  return <SharedCard {...props} style={{ ...styles.panel, ...style }} />;
}

export function EmptyState({ icon, title, text, action, inline, style, onLayout, image }: ComponentProps<typeof SharedEmptyState> &
  Pick<ViewProps, "style" | "onLayout"> & { inline?: boolean }) {
  if (!title || inline) return <SharedEmptyState icon={icon} title={title} text={text} action={action} />;
  return <View style={[styles.empty, style]} onLayout={onLayout}>
    <View style={styles.artDisc}>
      <Image source={image ?? require("../../assets/images/empty-ride.png")} style={styles.art} contentFit="contain" accessible={false} />
    </View>
    <Text weight="bold" center accessibilityRole="header" style={type.title}>{title}</Text>
    {text && <Text color="ink2" center style={{ maxWidth: 300 }}>{text}</Text>}
    {action && <View style={{ marginTop: space[2], alignSelf: "stretch", alignItems: "center" }}>{action}</View>}
  </View>;
}

type Tone = "white" | "forest" | "amber" | "soft";
const TONES: Record<Tone, { bg: string; ink: string }> = {
  white: { bg: colors.surface, ink: colors.ink },
  forest: { bg: trail.forest, ink: colors.white },
  amber: { bg: colors.amber, ink: colors.onAmber },
  soft: { bg: colors.surface3, ink: colors.ink },
};

/** A 48pt round button: on photos, in headers, beside headlines. `badge` shows a count (the cart). */
export function IconAction({ icon: Icon, label, onPress, primary = false, tone, badge, disabled = false, busy = false, style }: {
  icon: LucideIcon; label: string; onPress: () => void; primary?: boolean; tone?: Tone; badge?: number; disabled?: boolean; busy?: boolean; style?: ViewStyle;
}) {
  const t = TONES[tone ?? (primary ? "amber" : "white")];
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.action, tone === "white" && styles.lift, {
      backgroundColor: t.bg, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.9 : 1 }],
    }, style]}>
    {busy ? <ActivityIndicator color={t.ink} /> : <Icon size={20} color={t.ink} strokeWidth={2} />}
    {!!badge && <View pointerEvents="none" style={styles.badge}><Text size="xs" weight="bold" color="onAmber" maxFontSizeMultiplier={1.2}>{badge}</Text></View>}
  </Pressable>;
}

/**
 * The screen's main action: a tall forest pill with an arrow disc. With `amount` it becomes
 * the sticky money footer ("Total ₹1,190" on the left, the pill on the right).
 */
export function PillCTA({ label, onPress, disabled, busy, amount, caption, icon: Icon = ArrowRight, tone = "forest" }: {
  label: string; onPress: () => void; disabled?: boolean; busy?: boolean; amount?: string; caption?: string; icon?: LucideIcon; tone?: "forest" | "amber" | "white";
}) {
  const off = disabled || busy;
  const fg = tone === "forest" ? colors.white : colors.ink;
  const pill = <Pressable accessibilityRole="button" accessibilityLabel={amount ? `${label}, ${amount}` : label} accessibilityState={{ disabled: !!off, busy: !!busy }}
    disabled={off} onPress={() => { void Haptics.selectionAsync().catch(() => {}); onPress(); }}
    style={({ pressed }) => [styles.pill, { backgroundColor: tone === "forest" ? trail.forest : tone === "amber" ? colors.amber : colors.surface,
      opacity: off ? 0.4 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }, amount ? { flex: 1 } : null]}>
    <Text weight="bold" size="md" numberOfLines={1} style={{ color: fg, flexShrink: 1 }}>{label}</Text>
    <View style={[styles.pillDisc, { backgroundColor: tone === "forest" ? colors.amber : trail.forest }]}>
      {busy ? <ActivityIndicator color={tone === "forest" ? colors.onAmber : colors.white} />
        : <Icon size={18} color={tone === "forest" ? colors.onAmber : colors.white} strokeWidth={2.4} />}
    </View>
  </Pressable>;
  if (!amount) return pill;
  return <View style={styles.money}>
    <View style={{ flexShrink: 1 }}>
      {caption && <Text size="xs" color="ink2">{caption}</Text>}
      <Text weight="bold" size="xl" tnum style={{ letterSpacing: -0.5 }}>{amount}</Text>
    </View>
    {pill}
  </View>;
}

/** Icon in a circle, a value and a small label (cc · fuel · seats · rating). */
export function StatChip({ icon: Icon, value, label, dark }: { icon: LucideIcon; value: string; label: string; dark?: boolean }) {
  return <View style={[styles.stat, dark && { backgroundColor: "rgba(255,255,255,0.1)" }]} accessible accessibilityLabel={`${label}: ${value}`}>
    <View style={[styles.statIcon, dark && { backgroundColor: colors.amber }]}><Icon size={17} color={dark ? colors.onAmber : trail.forest} strokeWidth={2} /></View>
    <View style={{ flexShrink: 1 }}>
      <Text weight="bold" numberOfLines={1} style={dark ? { color: colors.white } : undefined}>{value}</Text>
      <Text size="xs" numberOfLines={1} style={{ color: dark ? trail.mist : colors.ink2 }}>{label}</Text>
    </View>
  </View>;
}

/** A filter pill with a round photo, as in "🏔 Hiking". */
export function PhotoPill({ label, image, selected, onPress }: { label: string; image?: ImageProps["source"]; selected?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.photoPill, !image && { paddingLeft: space[4] }, selected && { backgroundColor: trail.forest, borderColor: trail.forest }, pressed && { transform: [{ scale: 0.95 }] }]}>
    {image && <Image source={image} style={styles.photoPillImage} contentFit="cover" accessible={false} />}
    <Text weight="medium" style={{ color: selected ? colors.white : colors.ink }}>{label}</Text>
  </Pressable>;
}

/** A statement the rider confirms: a tappable card with a square tick box. */
export function Tick({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label}
    onPress={() => { void Haptics.selectionAsync().catch(() => {}); onChange(!checked); }}
    style={({ pressed }) => [styles.tick, checked && styles.tickOn, pressed && { transform: [{ scale: 0.98 }] }]}>
    <View style={[styles.tickBox, checked && styles.tickBoxOn]}>{checked && <Check size={17} color={colors.white} strokeWidth={3} />}</View>
    <Text style={{ flex: 1 }}>{label}</Text>
  </Pressable>;
}

/** Big editorial page title with an optional kicker line above and an action on the right. */
export function Headline({ kicker, title, action }: { kicker?: string; title: string; action?: ReactNode }) {
  return <View style={styles.headline}>
    <View style={{ flex: 1, gap: 2 }}>
      {kicker && <Text size="sm" weight="medium" color="ink2">{kicker}</Text>}
      <Text weight="bold" accessibilityRole="header" style={type.headline}>{title}</Text>
    </View>
    {action}
  </View>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.section}>
    <Text size="xl" weight="bold" accessibilityRole="header" style={{ flex: 1, letterSpacing: -0.4 }}>{title}</Text>
    {action && onAction && <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction} style={styles.sectionLink}>
      <Text size="sm" weight="medium" color="ink2">{action}</Text>
    </Pressable>}
  </View>;
}

/**
 * Boarding-pass itinerary: two stops joined by a dashed line with a scooter in the middle.
 * `strip` is the tinted bottom band (booking ID, rider, total).
 */
export function Ticket({ from, to, dark, strip, onPress, label, style }: {
  from: { label: string; day: string; time?: string }; to: { label: string; day: string; time?: string };
  dark?: boolean; strip?: ReactNode; onPress?: () => void; label?: string; style?: ViewStyle;
}) {
  const ink = dark ? colors.white : colors.ink;
  const soft = dark ? trail.mist : colors.ink2;
  const body = <>
    <View style={styles.ticketBody}>
      <Stop {...from} ink={ink} soft={soft} />
      <View style={styles.ticketMid} importantForAccessibility="no-hide-descendants">
        <View style={[styles.ticketDash, { borderColor: dark ? "rgba(255,255,255,0.35)" : colors.lineStrong }]} />
        <View style={[styles.ticketBike, { backgroundColor: dark ? colors.amber : trail.forest }]}><Bike size={16} color={dark ? colors.onAmber : colors.white} /></View>
        <View style={[styles.ticketDash, { borderColor: dark ? "rgba(255,255,255,0.35)" : colors.lineStrong }]} />
      </View>
      <Stop {...to} ink={ink} soft={soft} end />
    </View>
    {strip && <View style={[styles.ticketStrip, { backgroundColor: dark ? "rgba(255,255,255,0.08)" : colors.amberSoft }]}>{strip}</View>}
  </>;
  const box = [styles.ticket, { backgroundColor: dark ? trail.forest : colors.surface }, !dark && styles.hair, style];
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [...box, pressed && { transform: [{ scale: 0.98 }] }]}>{body}</Pressable>
    : <View style={box}>{body}</View>;
}

function Stop({ label, day, time, ink, soft, end }: { label: string; day: string; time?: string; ink: string; soft: string; end?: boolean }) {
  return <View style={{ flex: 1, alignItems: end ? "flex-end" : "flex-start", gap: 2 }}>
    <Text size="xs" weight="medium" maxFontSizeMultiplier={1.3} style={{ color: soft, letterSpacing: 0.6 }}>{label.toUpperCase()}</Text>
    <Text weight="bold" size="lg" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: ink, letterSpacing: -0.3 }}>{day}</Text>
    {time && <Text size="sm" tnum style={{ color: soft }}>{time}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  tick: { minHeight: 56, flexDirection: "row", alignItems: "flex-start", gap: space[3], padding: space[4], borderRadius: 22,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  tickOn: { borderColor: trail.forest, backgroundColor: trail.forestSoft },
  tickBox: { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: colors.lineStrong, backgroundColor: colors.surface2,
    alignItems: "center", justifyContent: "center", marginTop: -1 },
  tickBoxOn: { backgroundColor: trail.forest, borderColor: trail.forest },
  panel: { backgroundColor: colors.surface2, borderRadius: radius.card, shadowOpacity: 0, elevation: 0 },
  empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space[4], paddingVertical: space[8], gap: space[2] },
  artDisc: { width: 210, height: 210, borderRadius: 105, backgroundColor: trail.forestSoft, alignItems: "center", justifyContent: "center", marginBottom: space[3] },
  art: { width: 180, height: 140 },
  action: { width: HIT, height: HIT, justifyContent: "center", alignItems: "center", borderRadius: radius.full },
  lift: { shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.white },
  pill: { minHeight: 58, borderRadius: radius.full, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3], paddingLeft: space[6], paddingRight: 6 },
  pillDisc: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  money: { flexDirection: "row", alignItems: "center", gap: space[4] },
  stat: { flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: space[2], paddingLeft: space[2], paddingRight: space[3], borderRadius: radius.full, backgroundColor: colors.surface3 },
  statIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  photoPill: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: space[2], paddingLeft: 5, paddingRight: space[4], borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  photoPillImage: { width: 42, height: 42, borderRadius: 21 },
  headline: { flexDirection: "row", alignItems: "flex-end", gap: space[3] },
  section: { flexDirection: "row", alignItems: "center", minHeight: 32 },
  sectionLink: { minHeight: HIT, justifyContent: "center" },
  ticket: { borderRadius: 26, overflow: "hidden" },
  hair: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  ticketBody: { flexDirection: "row", alignItems: "center", padding: space[4], gap: space[2] },
  ticketMid: { flexDirection: "row", alignItems: "center", width: 64, gap: 3 },
  ticketDash: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed", minWidth: 6 },
  ticketBike: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  ticketStrip: { flexDirection: "row", flexWrap: "wrap", gap: space[4], paddingHorizontal: space[4], paddingVertical: space[3] },
});
