import type { ExpoConfig } from "expo/config";

/**
 * RetroMobi, the rider app.
 *
 * APP_ID is a PROPOSED value. It becomes permanent the first time a build is
 * uploaded to a store, so the owner must confirm it before that.
 */
const APP_ID = "com.retromobi.rider";

const config: ExpoConfig = {
  name: "RetroMobi",
  slug: "retromobi-rider",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Deep links: retromobi://vehicle/<id>, retromobi://rider/<id>/verify
  scheme: "retromobi",
  // The website has one (light) theme; the app matches it.
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: false,
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      backgroundColor: "#ffd901",
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
