import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import { Tabs } from "expo-router";
import { Bike, CalendarCheck, Home, IndianRupee, Menu, MessageCircle } from "lucide-react-native";
import { colors, font, radius, shadow, space, useT } from "@retromobi/mobile-shared";

import { counter } from "../../../ui/Counter";
import { useMerchantShop } from "../../../state/shop";
import { useSetup } from "../../../features/fleet/listing";

function tabIcon(Icon: LucideIcon) {
  return function MerchantTabIcon({ focused }: { focused: boolean }) {
    return <View style={{
      width: 52, height: 32, borderRadius: radius.full, backgroundColor: focused ? counter.navy : "transparent",
      justifyContent: "center", alignItems: "center",
    }}><Icon size={20} color={focused ? colors.surface : colors.ink2} strokeWidth={focused ? 2.2 : 1.8} /></View>;
  };
}

export default function MainTabs() {
  const { t } = useT();
  const { shopId, can } = useMerchantShop();
  const setup = useSetup(can("fleet:read") ? shopId : null);
  const insets = useSafeAreaInsets();
  // Floating pill: margins (not absolute positioning) so screens never scroll under it.
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: counter.navy,
    tabBarInactiveTintColor: colors.ink2,
    tabBarHideOnKeyboard: true,
    tabBarLabelPosition: "below-icon",
    tabBarLabelStyle: { fontFamily: font.bold, fontSize: 12, marginTop: 2 },
    tabBarItemStyle: { paddingVertical: space[1] },
    tabBarStyle: {
      backgroundColor: colors.surface, borderTopWidth: 0, borderRadius: radius.hero, height: 72, paddingTop: space[2], paddingBottom: space[2],
      paddingHorizontal: space[1], marginHorizontal: space[4], marginBottom: insets.bottom + space[2], ...shadow.card,
    },
  }}>
    <Tabs.Screen name="index" options={{ title: t("nav.overview"), tabBarIcon: tabIcon(Home) }} />
    <Tabs.Screen name="bookings" options={{ title: t("nav.bookings"), tabBarIcon: tabIcon(CalendarCheck) }} />
    <Tabs.Screen name="vehicles" options={{ title: t("nav.fleet"), tabBarIcon: tabIcon(Bike) }} />
    <Tabs.Screen name="earnings" options={{ title: t("nav.earnings"), href: can("payouts:read") ? "/earnings" : null,
      tabBarIcon: tabIcon(IndianRupee) }} />
    <Tabs.Screen name="chats" options={{ title: t("nav.support"), href: can("payouts:read") ? null : "/chats",
      tabBarIcon: tabIcon(MessageCircle) }} />
    <Tabs.Screen name="more" options={{ title: t("common.more"), tabBarBadge: setup.data && !setup.data.done ? "•" : undefined, tabBarBadgeStyle: { backgroundColor: colors.amber, color: colors.ink }, tabBarIcon: tabIcon(Menu) }} />
  </Tabs>;
}
