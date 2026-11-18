import { useEffect, useState, type ComponentProps } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import * as Haptics from "expo-haptics";
import { CalendarDays, Compass, MessageCircle, User, type LucideIcon } from "lucide-react-native";
import { Text, colors, space } from "@retromobi/mobile-shared";
import { trail } from "../../ui/trail";

const ICONS: Record<string, LucideIcon> = { index: Compass, bookings: CalendarDays, support: MessageCircle, profile: User };
type BarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/**
 * Floating forest pill. The active tab grows into an amber pill with its label; the
 * others are icons only. It takes its own space below the screen (no overlap to pad around).
 */
function TrailBar({ state, descriptors, navigateToTab }: BarProps) {
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboard) return null;
  return <View style={[styles.wrap, { paddingBottom: insets.bottom + space[2] }]}>
    <View style={styles.bar} accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const label = descriptors[route.key]!.options.title ?? route.name;
        const Icon = ICONS[route.name] ?? Compass;
        return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }}
          style={[styles.item, focused && styles.active]}
          onPress={() => {
            if (focused) return;
            void Haptics.selectionAsync().catch(() => {});
            navigateToTab(route.key);
          }}>
          <Icon size={21} color={focused ? colors.onAmber : trail.mist} strokeWidth={focused ? 2.4 : 1.9} />
          {focused && <Text weight="bold" numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ color: colors.onAmber }}>{label}</Text>}
        </Pressable>;
      })}
    </View>
  </View>;
}

export default function RiderTabs() {
  return <Tabs tabBar={(props) => <TrailBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tabs.Screen name="index" options={{ title: "Explore" }} />
    <Tabs.Screen name="bookings" options={{ title: "Trips" }} />
    <Tabs.Screen name="support" options={{ title: "Help" }} />
    <Tabs.Screen name="profile" options={{ title: "Profile" }} />
  </Tabs>;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, paddingHorizontal: space[4], paddingTop: space[1] },
  bar: { flexDirection: "row", alignItems: "center", gap: space[1], backgroundColor: trail.forest, borderRadius: 999, padding: 7, minHeight: 68,
    shadowColor: trail.forest, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  item: { flex: 1, height: 54, borderRadius: 27, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[2] },
  active: { flex: 2.1, backgroundColor: colors.amber },
});
