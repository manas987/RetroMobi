import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronRight, UserRound, type LucideIcon } from "lucide-react-native";
import { Text, colors, radius, space } from "@retromobi/mobile-shared";
import { trail } from "../../ui/trail";

export type Account = { name: string | null; email: string | null; phone: string };
export type Device = { id: string; is_current: boolean; device_name: string | null; browser_name: string | null; login_location: string | null; created_at: string; last_used_at: string };
export const deviceName = (device: Device) => device.device_name ?? (device.is_current ? "Current device" : "Unidentified device");

export function ProfileAvatar({ name, compact = false }: { name?: string | null; compact?: boolean }) {
  const initials = name?.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase();
  return <View style={[styles.avatar, compact && styles.avatarCompact]} accessible={false} importantForAccessibility="no-hide-descendants">
    {initials ? <Text size={compact ? "sm" : "xxl"} weight="bold" color="verified" maxFontSizeMultiplier={1.2}>{initials}</Text>
      : <UserRound color={colors.verified} size={compact ? 19 : 30} />}
  </View>;
}

export function ProfileGroup({ label, children }: { label?: string; children: ReactNode }) {
  return <View style={styles.group}>
    {label && <Text size="sm" weight="medium" color="ink2" accessibilityRole="header" style={styles.groupLabel}>{label}</Text>}
    <View style={styles.rows}>{children}</View>
  </View>;
}

export function ProfileRow({ icon: Icon, avatar, label, detail, end, onPress, separated, danger }: {
  icon?: LucideIcon; avatar?: string; label: string; detail?: string; end?: ReactNode;
  onPress?: () => void; separated?: boolean; danger?: boolean;
}) {
  const content = <>
    {avatar ? <ProfileAvatar name={avatar} compact /> : Icon && <View style={[styles.icon, danger && styles.dangerIcon]}>
      <Icon size={19} strokeWidth={1.9} color={danger ? colors.danger : trail.forest} />
    </View>}
    <View style={styles.rowText}>
      <Text weight="medium" color={danger ? "danger" : "ink"}>{label}</Text>
      {detail && <Text size="sm" color="ink2">{detail}</Text>}
      {end}
    </View>
    {onPress && !danger && <ChevronRight size={17} color={colors.ink2} />}
  </>;
  return onPress
    ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, separated && styles.divider, pressed && styles.pressed]}>{content}</Pressable>
    : <View style={[styles.row, separated && styles.divider]}>{content}</View>;
}

export const profileStyles = StyleSheet.create({
  page: { width: "100%", maxWidth: 540, alignSelf: "center", gap: space[4] },
  identity: { alignItems: "center", gap: space[2], paddingVertical: space[6] },
  lead: { borderRadius: 24, backgroundColor: trail.forestSoft, padding: space[4], flexDirection: "row", alignItems: "center", gap: space[3] },
  leadText: { flex: 1, gap: space[1] },
  title: { letterSpacing: -0.6 },
});

const styles = StyleSheet.create({
  avatar: { width: 76, height: 76, alignItems: "center", justifyContent: "center", backgroundColor: colors.verifiedSoft, borderRadius: radius.full },
  avatarCompact: { width: 43, height: 43 },
  group: { gap: space[2] },
  groupLabel: { paddingHorizontal: space[2] },
  rows: { borderRadius: 24, backgroundColor: colors.surface, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  row: { minHeight: 58, paddingHorizontal: space[3], paddingVertical: space[2], gap: space[3], flexDirection: "row", alignItems: "center" },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  pressed: { backgroundColor: colors.surface3 },
  icon: { width: 36, height: 36, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: trail.forestSoft },
  dangerIcon: { backgroundColor: colors.dangerSoft },
  rowText: { flex: 1, gap: 2 },
});
