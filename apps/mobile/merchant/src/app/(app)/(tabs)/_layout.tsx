import { Tabs } from "expo-router";
import { Bike, CalendarCheck, Home, IndianRupee, Menu, MessageCircle } from "lucide-react-native";
import { colors, font, useT } from "@retromobi/mobile-shared";

import { useMerchantShop } from "../../../state/shop";
import { useSetup } from "../../../features/fleet/listing";

export default function MainTabs() {
  const { t } = useT();
  const { shopId, can } = useMerchantShop();
  const setup = useSetup(can("fleet:read") ? shopId : null);
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.ink,
    tabBarInactiveTintColor: colors.ink2,
    tabBarActiveBackgroundColor: colors.amberSoft,
    tabBarLabelStyle: { fontFamily: font.medium },
    tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
  }}>
    <Tabs.Screen name="index" options={{ title: t("nav.overview"), tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
    <Tabs.Screen name="bookings" options={{ title: t("nav.bookings"), tabBarIcon: ({ color, size }) => <CalendarCheck color={color} size={size} /> }} />
    <Tabs.Screen name="vehicles" options={{ title: t("nav.fleet"), tabBarIcon: ({ color, size }) => <Bike color={color} size={size} /> }} />
    <Tabs.Screen name="earnings" options={{ title: t("nav.earnings"), href: can("payouts:read") ? "/earnings" : null,
      tabBarIcon: ({ color, size }) => <IndianRupee color={color} size={size} /> }} />
    <Tabs.Screen name="chats" options={{ title: t("nav.support"), href: can("payouts:read") ? null : "/chats",
      tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }} />
    <Tabs.Screen name="more" options={{ title: t("common.more"), tabBarBadge: setup.data && !setup.data.done ? "•" : undefined, tabBarBadgeStyle: { backgroundColor: colors.amber, color: colors.ink }, tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }} />
  </Tabs>;
}
