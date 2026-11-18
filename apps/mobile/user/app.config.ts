import type { ExpoConfig } from "expo/config";

/**
 * RetroMobi, the rider app.
 *
 * APP_ID is a PROPOSED value. It becomes permanent the first time a build is
 * uploaded to a store, so the owner must confirm it before that.
 */
const APP_ID = "com.retromobi.rider";
const googleIOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const reversedGoogleIOS = googleIOS?.endsWith(".apps.googleusercontent.com") ? googleIOS.split(".").reverse().join(".") : undefined;

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
    infoPlist: { LSApplicationQueriesSchemes: ["upi", "phonepe", "tez", "paytm", "paytmmp", "bhim", "credpay"] },
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
    "@rnmapbox/maps",
    ["expo-location", { locationWhenInUsePermission: "RetroMobi uses your location to show scooters near you. You can also just pick a city." }],
    ["expo-splash-screen", { backgroundColor: "#ffffff", image: "./assets/images/splash-icon.png", imageWidth: 120 }],
    "expo-secure-store",
    ["expo-image-picker", {
      cameraPermission: "RetroMobi uses the camera to record the scooter’s condition at pickup and to take a rider photo.",
      microphonePermission: "The pickup video is recorded with sound.",
      photosPermission: "Choose a photo or video you already took.",
    }],
    ...(reversedGoogleIOS ? [["@react-native-google-signin/google-signin", { iosUrlScheme: reversedGoogleIOS }] as [string, Record<string, string>]] : []),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
