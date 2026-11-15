import { CartProvider, useCartReady } from "../state/cart";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AppProviders, IntroGate, colors, configureApi, font, fontAssets, useAppReady, type IntroSlide } from "@retromobi/mobile-shared";

configureApi({ portal: "user", baseUrl: process.env.EXPO_PUBLIC_API_URL });

// Hold the splash until fonts, the saved session and the intro flag are read.
void SplashScreen.preventAutoHideAsync();

// The website's "how it works" steps (pages/Home.tsx STEPS), three of them.
const SLIDES: IntroSlide[] = [
  {
    title: "Find your ride",
    body: "Pick your city and dates. Explore scooters near you, with no sign-up until you book.",
    image: require("../../assets/images/how-search.jpg"),
  },
  {
    title: "Know before you pay",
    body: "See the deposit, rental terms and return policy before booking. Clear details, fewer surprises.",
    image: require("../../assets/images/how-pay.jpg"),
  },
  {
    title: "Record. Ride. Return.",
    body: "Record a pickup video to document your scooter's condition. Ride with confidence, then return it with a clear record.",
    image: require("../../assets/images/how-ride.jpg"),
  },
];

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = useAppReady();
  const cartReady = useCartReady();
  const [introRead, setIntroRead] = useState(false);
  // A font that fails to load must not strand the app on the splash screen.
  const loaded = (fontsLoaded || fontError != null) && ready && cartReady;

  useEffect(() => {
    if (loaded && introRead) SplashScreen.hide();
  }, [loaded, introRead]);

  if (!loaded) return null;

  return (
    <AppProviders>
      <CartProvider>
      <StatusBar style="dark" />
      <IntroGate slides={SLIDES} labels={{ next: "Next", skip: "Skip", start: "Start exploring" }} onReady={() => setIntroRead(true)}>
        <Stack
          screenOptions={{
            headerTintColor: colors.ink,
            headerTitleStyle: { fontFamily: font.bold },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            contentStyle: { backgroundColor: colors.surface },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
      </IntroGate>
      </CartProvider>
    </AppProviders>
  );
}
