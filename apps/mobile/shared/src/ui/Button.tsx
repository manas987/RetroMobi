import { ActivityIndicator, Pressable, StyleSheet, type PressableProps, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";
import { colors, radius, space } from "../theme";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "dark" | "secondary" | "ghost" | "danger";

const FILL: Record<ButtonVariant, { bg: string; fg: keyof typeof colors; border?: string }> = {
  // Amber is a fill under dark text, never text itself.
  primary: { bg: colors.amber, fg: "onAmber" },
  dark: { bg: colors.ink, fg: "surface" },
  secondary: { bg: colors.surface, fg: "ink", border: colors.lineStrong },
  ghost: { bg: "transparent", fg: "ink2" },
  danger: { bg: colors.danger, fg: "surface" },
};

/**
 * `busy` shows a spinner and blocks presses, which is what stops a double
 * submit. Every button is at least 48 points tall.
 */
export function Button({
  label,
  variant = "secondary",
  size = "md",
  icon: Icon,
  busy = false,
  disabled,
  full,
  onPress,
  style,
  ...rest
}: Omit<PressableProps, "children" | "style"> & {
  label: string;
  variant?: ButtonVariant;
  size?: "md" | "lg";
  icon?: LucideIcon;
  busy?: boolean;
  /** Stretch to the parent's width. */
  full?: boolean;
  style?: ViewStyle;
}) {
  const fill = FILL[variant];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy }}
      disabled={off}
      onPress={(e) => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        size === "lg" ? styles.lg : styles.md,
        { backgroundColor: fill.bg, borderColor: fill.border ?? "transparent", opacity: off ? 0.4 : pressed ? 0.8 : 1 },
        full && styles.full,
        style,
      ]}
      {...rest}
    >
      {busy ? <ActivityIndicator color={colors[fill.fg]} /> : Icon ? <Icon size={20} color={colors[fill.fg]} /> : null}
      <Text weight="bold" size={size === "lg" ? "md" : "base"} color={fill.fg} center style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[2], paddingVertical: space[2], borderRadius: radius.button, borderWidth: 1 },
  md: { minHeight: 48, paddingHorizontal: space[4] },
  lg: { minHeight: 56, paddingHorizontal: space[6] },
  full: { alignSelf: "stretch" },
});
