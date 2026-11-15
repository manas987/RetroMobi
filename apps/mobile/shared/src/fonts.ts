import { font } from "./theme";

/** Passed to `useFonts` in each app's root layout. Kept out of theme.ts so pure code never loads a font file. */
export const fontAssets = {
  [font.regular]: require("../assets/fonts/AirbnbCereal_W_Bk.otf"),
  [font.medium]: require("../assets/fonts/AirbnbCereal_W_Md.otf"),
  [font.bold]: require("../assets/fonts/AirbnbCereal_W_Bd.otf"),
} as const;
