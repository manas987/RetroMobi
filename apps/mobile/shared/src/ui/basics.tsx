import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, radius, shadow, space, text, font, tone, type Tone } from "../theme";
import { Text } from "./Text";
import { Button } from "./Button";

export function Card({ title, icon: Icon, action, children, style }: { title?: string; icon?: LucideIcon; action?: ReactNode; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      {(title || action) && (
        <View style={styles.cardHead}>
          {title && (
            <View style={styles.row}>
              {Icon && <Icon size={20} color={colors.ink3} />}
              <Text weight="bold" size="md" accessibilityRole="header">{title}</Text>
            </View>
          )}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

/** A status pill. The label always carries the meaning; the colour only backs it up. */
export function Chip({ tone: t, label, icon: Icon }: { tone: Tone; label: string; icon?: LucideIcon }) {
  return (
    <View style={[styles.chip, { backgroundColor: tone[t].bg }]}>
      {Icon && <Icon size={14} color={tone[t].fg} />}
      <Text size="xs" weight="bold" style={{ color: tone[t].fg, flexShrink: 1 }}>{label}</Text>
    </View>
  );
}

/** Label above, hint or error below. Wrap exactly one input. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text size="sm" weight="medium">{label}</Text>
      {children}
      {error ? <Text size="xs" color="danger" accessibilityRole="alert">{error}</Text> : hint ? <Text size="xs" color="ink3">{hint}</Text> : null}
    </View>
  );
}

/** The one text-input look. Give it `accessibilityLabel` when it has no <Field> label. */
export function Input({ style, ...rest }: TextInputProps) {
  return <TextInput placeholderTextColor={colors.ink3} selectionColor={colors.ink} {...rest} style={[styles.input, style]} />;
}

export function EmptyState({ icon: Icon, title, text: body, action }: { icon?: LucideIcon; title?: string; text?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      {Icon && (
        <View style={styles.emptyIcon}>
          <Icon size={24} color={colors.ink3} />
        </View>
      )}
      {title && <Text weight="bold" center>{title}</Text>}
      {body && <Text size="sm" color="ink2" center>{body}</Text>}
      {action}
    </View>
  );
}

/** A failed load or action, with the way out. */
export function ErrorNote({ text: body = "Couldn't load this.", onRetry, retryLabel = "Try again" }: { text?: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text size="sm" color="danger" style={{ flex: 1 }}>{body}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} hitSlop={12} accessibilityRole="button" accessibilityLabel={retryLabel}>
          <Text size="sm" weight="bold" color="danger" style={{ textDecorationLine: "underline" }}>{retryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Grey rows that pulse while something loads. `label` is read out once by screen readers. */
export function LoadingRows({ rows = 3, height = 56, label = "Loading" }: { rows?: number; height?: number; label?: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ gap: space[3], opacity: pulse }} accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: rows }, (_, i) => <View key={i} style={[styles.skeleton, { height }]} />)}
    </Animated.View>
  );
}

/** Thin divider. */
export function Line() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />;
}

export { Button };

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: space[5], gap: space[3], ...shadow.card },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[3] },
  row: { flexDirection: "row", alignItems: "center", gap: space[2], flexShrink: 1 },
  chip: { flexDirection: "row", alignItems: "center", gap: space[1], alignSelf: "flex-start", borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  field: { gap: 6, marginBottom: space[4] },
  input: {
    minHeight: 48, borderRadius: radius.button, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface,
    paddingHorizontal: space[4], fontFamily: font.regular, fontSize: text.md, color: colors.ink,
  },
  empty: { alignItems: "center", gap: space[3], paddingVertical: space[8], paddingHorizontal: space[4] },
  emptyIcon: { height: 48, width: 48, borderRadius: radius.button, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  error: { flexDirection: "row", alignItems: "center", gap: space[3], borderRadius: radius.button, backgroundColor: colors.dangerSoft, paddingHorizontal: space[4], paddingVertical: space[3] },
  skeleton: { borderRadius: radius.button, backgroundColor: colors.surface3 },
});
