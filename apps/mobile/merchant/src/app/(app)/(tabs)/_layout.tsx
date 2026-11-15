import { Tabs } from "expo-router";
import { Home, Menu } from "lucide-react-native";
import { colors, font, useT } from "@retromobi/mobile-shared";

export default function MainTabs() {
  const { t } = useT();
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.ink,
    tabBarInactiveTintColor: colors.ink2,
    tabBarActiveBackgroundColor: colors.amberSoft,
    tabBarLabelStyle: { fontFamily: font.medium },
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
  }}>
    <Tabs.Screen name="index" options={{ title: t("nav.overview"), tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
    <Tabs.Screen name="more" options={{ title: t("common.more"), tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }} />
  </Tabs>;
}
