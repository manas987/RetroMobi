import { useContext, type ReactNode } from "react";
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useNetworkState } from "expo-network";
import { useT } from "../i18n";
import { colors, space } from "../theme";
import { Text } from "./Text";

/** Shown at the top of every screen while the phone has no connection. */
export function OfflineBanner() {
  const { lang } = useT();
  const net = useNetworkState();
  // `undefined` while the first reading is pending: say nothing until we know.
  if (net.isConnected !== false && net.isInternetReachable !== false) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Text size="sm" color="surface" center>{lang === "hi" ? "इंटरनेट नहीं है। पिछली बार लोड हुई जानकारी दिख रही है।" : "You're offline. Showing what was loaded last."}</Text>
    </View>
  );
}

/**
 * The frame every screen sits in: safe areas, the offline banner, keyboard
 * avoidance, and (unless `scroll={false}`) a scroll view with pull-to-refresh.
 *
 * Use `scroll={false}` for screens whose body is a FlatList or a map -- never
 * put a FlatList inside this component's ScrollView.
 */
export function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  background = "surface",
  edges = ["top", "left", "right"],
  padded = true,
  footer,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Supplying it turns on pull-to-refresh. */
  onRefresh?: () => void;
  refreshing?: boolean;
  background?: "surface" | "canvas";
  /** Tab screens leave the bottom edge to the tab bar; stack screens add "bottom". */
  edges?: Edge[];
  padded?: boolean;
  /** Pinned under the scroll area, above the keyboard: the screen's primary action. */
  footer?: ReactNode;
  contentStyle?: ViewStyle;
}) {
  const pad = padded ? styles.pad : undefined;
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors[background] }]} edges={edges}>
      <OfflineBanner />
      <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
        {scroll ? (
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scrollContent, pad, contentStyle]}
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink3} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, pad, contentStyle]}>{children}</View>
        )}
        {footer && <View style={styles.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  pad: { padding: space[4], paddingBottom: space[8] },
  offline: { backgroundColor: colors.ink2, paddingVertical: space[2], paddingHorizontal: space[4] },
  footer: { paddingHorizontal: space[4], paddingVertical: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.surface },
});
