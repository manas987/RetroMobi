import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Bike, IndianRupee, Rocket } from "lucide-react-native";
import {
  AppProviders, IntroGate, colors, configureApi, font, fontAssets, useAppReady, useLang, useSession, type IntroSlide,
} from "@retromobi/mobile-shared";

configureApi({ portal: "merchant", baseUrl: process.env.EXPO_PUBLIC_API_URL });

// Hold the splash until fonts, the saved session, the language and the intro flag are read.
void SplashScreen.preventAutoHideAsync();

/**
 * First-open slides. App-only copy (the website has no intro), so it lives
 * here in both languages rather than in the shared i18n files, which mirror
 * the website word for word.
 */
const INTRO = {
  en: {
    subtitle: "for shops",
    labels: { next: "Next", skip: "Skip", start: "Get started" },
    slides: [
      { icon: Bike, title: "Run your counter", body: "Hand over, take back and record walk-in rentals in a few taps. Every booking in one place." },
      { icon: Rocket, title: "Get listed when you're ready", body: "Add your licence, papers and vehicles step by step. Nothing shows to customers until you switch it on." },
      { icon: IndianRupee, title: "See what you earned", body: "Online payouts and walk-in cash, day by day, for every shop you run." },
    ] satisfies IntroSlide[],
  },
  hi: {
    subtitle: "दुकानों के लिए",
    labels: { next: "आगे", skip: "छोड़ें", start: "शुरू करें" },
    slides: [
      { icon: Bike, title: "काउंटर का काम आसान", body: "गाड़ी देना, वापस लेना और वॉक-इन किराया कुछ ही टैप में दर्ज करें। हर बुकिंग एक जगह।" },
      { icon: Rocket, title: "जब तैयार हों, लिस्ट करें", body: "लाइसेंस, काग़ज़ और गाड़ियाँ एक-एक करके जोड़ें। जब तक आप चालू न करें, ग्राहकों को कुछ नहीं दिखता।" },
      { icon: IndianRupee, title: "कमाई देखें", body: "ऑनलाइन भुगतान और वॉक-इन नकद, दिन-ब-दिन, आपकी हर दुकान के लिए।" },
    ] satisfies IntroSlide[],
  },
} as const;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = useAppReady();
  const session = useSession();
  const lang = useLang();
  const [introRead, setIntroRead] = useState(false);
  // A font that fails to load must not strand the app on the splash screen.
  const loaded = (fontsLoaded || fontError != null) && ready;

  useEffect(() => {
    if (loaded && introRead) SplashScreen.hide();
  }, [loaded, introRead]);

  if (!loaded) return null;
  const intro = INTRO[lang];

  return (
    <AppProviders>
      <StatusBar style="dark" />
      <IntroGate slides={intro.slides} labels={intro.labels} subtitle={intro.subtitle} onReady={() => setIntroRead(true)}>
        <Stack
          screenOptions={{
            headerTintColor: colors.ink,
            headerTitleStyle: { fontFamily: font.bold },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: "minimal",
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          {/* Signed in: everything under (app). Signed out: only the sign-in screen.
              When the session ends (sign out, or a refresh that fails), Expo Router
              moves to the other group by itself. */}
          <Stack.Protected guard={session != null}>
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={session == null}>
            <Stack.Screen name="login" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
      </IntroGate>
    </AppProviders>
  );
}
