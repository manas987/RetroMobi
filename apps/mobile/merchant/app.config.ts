import type { ExpoConfig } from "expo/config";

/**
 * RetroMobi for Shops, the merchant app.
 *
 * APP_ID is a PROPOSED value. It becomes permanent the first time a build is
 * uploaded to a store, so the owner must confirm it before that.
 */
const APP_ID = "com.retromobi.shops";

const config: ExpoConfig = {
  name: "RetroMobi for Shops",
  slug: "retromobi-shops",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Deep links: retromobishops://bookings/<id>
  scheme: "retromobishops",
  // The website has one (light) theme; the app matches it.
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: false,
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      backgroundColor: "#12161a",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
  },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { backgroundColor: "#ffffff", image: "./assets/images/splash-icon.png", imageWidth: 120 }],
    "expo-secure-store",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
