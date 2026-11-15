import { ShopProvider } from "../../state/shop";
import { Stack } from "expo-router";
import { colors, font } from "@retromobi/mobile-shared";

export default function AppLayout() {
  return (
    <ShopProvider>
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: font.bold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
    </ShopProvider>
  );
}
