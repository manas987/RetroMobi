import { Tabs } from "expo-router";
import { CalendarDays, Compass, MessageCircle, User } from "lucide-react-native";
import { colors, font } from "@retromobi/mobile-shared";

export default function RiderTabs() {
  return <Tabs screenOptions={{
    headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: colors.amber, tabBarInactiveTintColor: "#dce8dc",
    tabBarLabelStyle: { fontFamily: font.medium },
    tabBarStyle: { backgroundColor: "#14291e", borderTopWidth: 0, borderRadius: 24, marginHorizontal: 12, marginBottom: 6, paddingTop: 4, elevation: 0 },
  }}>
    <Tabs.Screen name="index" options={{ title: "Explore", tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }} />
    <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
    <Tabs.Screen name="support" options={{ title: "Support", tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }} />
    <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
  </Tabs>;
}
