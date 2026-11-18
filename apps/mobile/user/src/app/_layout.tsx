import { CartProvider, useCartReady } from "../state/cart";
import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AppProviders, IntroGate, colors, configureApi, font, fontAssets, useAppReady, type IntroSlide } from "@retromobi/mobile-shared";
import { IconAction } from "../features/RiderSurface";
import { art } from "../ui/art";

configureApi({ portal: "user", baseUrl: process.env.EXPO_PUBLIC_API_URL });

// Hold the splash until fonts, the saved session and the intro flag are read.
void SplashScreen.preventAutoHideAsync();

const SLIDES: IntroSlide[] = [
  {
    title: "Ride the\nmountains.",
    body: "Scooters and bikes from local shops in Rishikesh, Dehradun and Haridwar. No sign-up until you book.",
    image: art.intro[0],
  },
  {
    title: "Licence?\nJust bring it.",
    body: "No uploads, no waiting. Show your original driving licence at pickup and ride.",
    image: art.intro[1],
  },
  {
    title: "Record.\nRide. Return.",
    body: "A quick pickup video keeps a clear record of the vehicle.",
    image: art.intro[2],
  },
];

function BackButton() {
  const router = useRouter();
  return <IconAction icon={ArrowLeft} tone="soft" label="Back" onPress={() => router.back()} style={{ marginRight: 8 }} />;
}

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
      <IntroGate quick poster slides={SLIDES} labels={{ next: "Next", skip: "Skip", start: "Let’s ride" }} onReady={() => setIntroRead(true)}>
        <Stack
          screenOptions={{
            headerTintColor: colors.ink,
            headerTitleStyle: { fontFamily: font.bold },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            headerLeft: ({ canGoBack }) => canGoBack ? <BackButton /> : undefined,
            contentStyle: { backgroundColor: colors.surface },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="browse" options={{ title: "Browse vehicles" }} />
          <Stack.Screen name="cart" options={{ presentation: "modal", title: "Your cart" }} />
          <Stack.Screen name="login" options={{ presentation: "modal", title: "Sign in" }} />
          <Stack.Screen name="checkout/index" options={{ presentation: "card", title: "Checkout" }} />
          <Stack.Screen name="checkout/pay/[groupId]" options={{ presentation: "card", title: "Payment" }} />
          <Stack.Screen name="rider/[riderId]/verify" options={{ presentation: "card", title: "Driving licence check" }} />
        </Stack>
      </IntroGate>
      </CartProvider>
    </AppProviders>
  );
}
