import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewProps } from "react-native";
import { Image } from "expo-image";
import type { LucideIcon } from "lucide-react-native";
import { Card as SharedCard, EmptyState as SharedEmptyState, HIT, Text, colors, radius, space } from "@retromobi/mobile-shared";

export function Card({ style, ...props }: ComponentProps<typeof SharedCard>) {
  return <SharedCard {...props} style={{ ...styles.panel, ...style }} />;
}

export function EmptyState({ icon, title, text, action, inline, style, onLayout }: ComponentProps<typeof SharedEmptyState> &
  Pick<ViewProps, "style" | "onLayout"> & { inline?: boolean }) {
  if (!title || inline) return <SharedEmptyState icon={icon} title={title} text={text} action={action} />;
  return <View style={[styles.empty, style]} onLayout={onLayout}>
    <Image source={require("../../assets/images/empty-ride.png")} style={styles.art} contentFit="contain" accessible={false} />
    <Text size="xl" weight="bold" center accessibilityRole="header">{title}</Text>
    {text && <Text size="sm" color="ink2" center style={{ maxWidth: 300 }}>{text}</Text>}
    {action && <View style={{ marginTop: space[1] }}>{action}</View>}
  </View>;
}

export function IconAction({ icon: Icon, label, onPress, primary = false, disabled = false, busy = false }: {
  icon: LucideIcon; label: string; onPress: () => void; primary?: boolean; disabled?: boolean; busy?: boolean;
}) {
  const ink = primary ? colors.onAmber : colors.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.action, {
      backgroundColor: primary ? colors.amber : colors.surface,
      opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
    }]}>
    {busy ? <ActivityIndicator color={ink} /> : <Icon size={20} color={ink} />}
  </Pressable>;
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface2, borderRadius: radius.panel, shadowOpacity: 0, elevation: 0 },
  empty: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space[4], paddingVertical: space[6], gap: space[2] },
  art: { width: 190, maxWidth: "80%", aspectRatio: 1.5 },
  action: { width: HIT, height: HIT, justifyContent: "center", alignItems: "center", borderRadius: radius.full },
});
