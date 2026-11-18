import { StyleSheet } from "react-native";
import { font } from "@retromobi/mobile-shared";

/**
 * Rider-only look ("Trail"): deep forest for the dark pieces, brand amber as the pop,
 * big editorial headlines. Shared tokens (`colors`, `space`) still come from mobile-shared.
 */
export const trail = {
  forest: "#14291e",
  forestSoft: "#e7eee8",
  /** Text and icons on forest. */
  mist: "#dce8dc",
  canvas: "#f5f4ef",
  /** Faked glass: Android blur is costly, a translucent white reads the same on photos. */
  glass: "rgba(255,255,255,0.88)",
  shade: "rgba(10,20,14,0.55)",
  hero: 32,
} as const;

export const type = StyleSheet.create({
  headline: { fontFamily: font.bold, fontSize: 38, lineHeight: 42, letterSpacing: -1.4 },
  title: { fontFamily: font.bold, fontSize: 28, lineHeight: 33, letterSpacing: -0.8 },
});
